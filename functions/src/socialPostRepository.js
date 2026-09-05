const { defineSecret } = require('firebase-functions/params')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { getPropertyEngagementSummary } = require('./engagementRepository')

const SOCIAL_POST_COLLECTION = 'cmsSocialPosts'
const DEFAULT_GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_ROOT = 'https://graph.facebook.com'
const ALLOWED_PLATFORMS = new Set(['facebook', 'instagram'])
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_SUMMARY_WINDOW_DAYS = 90
const FACEBOOK_PAGE_ACCESS_TOKEN_SECRET = defineSecret('FACEBOOK_PAGE_ACCESS_TOKEN')
const SOCIAL_MEDIA_SECRETS = [FACEBOOK_PAGE_ACCESS_TOKEN_SECRET]

function normalizeTimestampValue(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString()
  }

  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString()
  }

  return ''
}

function normalizeDateOnly(value) {
  const normalized = String(value ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function getLocalDateOnly(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function addDays(dateOnly, dayCount) {
  const date = new Date(`${dateOnly}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dayCount)
  return date.toISOString().slice(0, 10)
}

// --- Graph API configuration -------------------------------------------------

function getGraphApiVersion() {
  return String(process.env.FACEBOOK_GRAPH_API_VERSION ?? '').trim() || DEFAULT_GRAPH_API_VERSION
}

function getSecretValue(secret, fallbackEnvironmentVariableName) {
  try {
    const secretValue = String(secret.value() ?? '').trim()

    if (secretValue) {
      return secretValue
    }
  } catch {
    // Local scripts/tests may import this module outside a bound Cloud Functions
    // runtime. Fall back to process.env so emulators can still use local config.
  }

  return String(process.env[fallbackEnvironmentVariableName] ?? '').trim()
}

function getFacebookPageAccessToken() {
  return getSecretValue(FACEBOOK_PAGE_ACCESS_TOKEN_SECRET, 'FACEBOOK_PAGE_ACCESS_TOKEN')
}

function getSocialMediaConfig() {
  return {
    graphApiVersion: getGraphApiVersion(),
    pageId: String(process.env.FACEBOOK_PAGE_ID ?? '').trim(),
    pageAccessToken: getFacebookPageAccessToken(),
    instagramBusinessAccountId: String(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? '').trim(),
  }
}

function getSocialConnectionStatus() {
  const config = getSocialMediaConfig()
  const facebookConfigured = Boolean(config.pageId && config.pageAccessToken)
  const instagramConfigured = Boolean(config.instagramBusinessAccountId && config.pageAccessToken)

  return {
    facebookConfigured,
    instagramConfigured,
    graphApiVersion: config.graphApiVersion,
    missingEnvVars: [
      ...(config.pageAccessToken ? [] : ['FACEBOOK_PAGE_ACCESS_TOKEN']),
      ...(config.pageId ? [] : ['FACEBOOK_PAGE_ID']),
      ...(config.instagramBusinessAccountId ? [] : ['INSTAGRAM_BUSINESS_ACCOUNT_ID']),
    ],
  }
}

// --- Graph API calls ----------------------------------------------------------

async function callGraphApi(pathSegment, { method = 'GET', params = {}, accessToken }) {
  const version = getGraphApiVersion()
  const url = new URL(`${GRAPH_API_ROOT}/${version}/${pathSegment}`)
  const searchParams = new URLSearchParams({ ...params, access_token: accessToken })

  let response

  try {
    if (method === 'GET') {
      url.search = searchParams.toString()
      response = await fetch(url, { method: 'GET' })
    } else {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: searchParams.toString(),
      })
    }
  } catch (error) {
    throw new HttpError(502, `Could not reach the Facebook Graph API: ${error instanceof Error ? error.message : 'network error'}.`)
  }

  const payload = await response.json().catch(() => null)

  if (payload?.error) {
    throw new HttpError(502, `Facebook Graph API error: ${payload.error.message || 'unknown error'}.`, {
      graphErrorCode: payload.error.code,
      graphErrorType: payload.error.type,
    })
  }

  if (!response.ok) {
    throw new HttpError(502, `Facebook Graph API request failed with status ${response.status}.`)
  }

  return payload ?? {}
}

async function publishFacebookPost({ pageId, accessToken, message, imageUrl }) {
  if (imageUrl) {
    const result = await callGraphApi(`${pageId}/photos`, {
      method: 'POST',
      accessToken,
      params: { url: imageUrl, caption: message, published: 'true' },
    })

    return { externalId: String(result.post_id || result.id || '') }
  }

  const result = await callGraphApi(`${pageId}/feed`, {
    method: 'POST',
    accessToken,
    params: { message },
  })

  return { externalId: String(result.id || '') }
}

async function publishInstagramPost({ igUserId, accessToken, message, imageUrl }) {
  if (!imageUrl) {
    throw new HttpError(400, 'Instagram posts require an image - select one from the property gallery.')
  }

  const creation = await callGraphApi(`${igUserId}/media`, {
    method: 'POST',
    accessToken,
    params: { image_url: imageUrl, caption: message },
  })

  const creationId = String(creation.id || '')

  if (!creationId) {
    throw new HttpError(502, 'Instagram did not return a media container id.')
  }

  const published = await callGraphApi(`${igUserId}/media_publish`, {
    method: 'POST',
    accessToken,
    params: { creation_id: creationId },
  })

  return { externalId: String(published.id || '') }
}

async function getFacebookPostMetrics({ postId, accessToken }) {
  const result = await callGraphApi(postId, {
    accessToken,
    params: { fields: 'likes.summary(true),comments.summary(true),shares' },
  })

  return {
    likes: Number(result?.likes?.summary?.total_count) || 0,
    comments: Number(result?.comments?.summary?.total_count) || 0,
    shares: Number(result?.shares?.count) || 0,
  }
}

async function getInstagramMediaMetrics({ mediaId, accessToken }) {
  const result = await callGraphApi(mediaId, {
    accessToken,
    params: { fields: 'like_count,comments_count' },
  })

  return {
    likes: Number(result?.like_count) || 0,
    comments: Number(result?.comments_count) || 0,
  }
}

// --- Validation ----------------------------------------------------------------

function normalizePlatforms(value) {
  const platforms = Array.isArray(value) ? value : []
  const normalized = Array.from(
    new Set(platforms.map((platform) => String(platform ?? '').trim().toLowerCase()).filter((platform) => ALLOWED_PLATFORMS.has(platform))),
  )

  if (normalized.length === 0) {
    throw new HttpError(400, 'Select at least one platform to post to (Facebook and/or Instagram).')
  }

  return normalized
}

function normalizeMessage(value) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new HttpError(400, 'A post caption is required.')
  }

  if (normalized.length > 2200) {
    throw new HttpError(400, 'Post captions must be 2200 characters or fewer.')
  }

  return normalized
}

function normalizePropertySlug(value) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    throw new HttpError(400, 'A property is required.')
  }

  return normalized
}

function normalizePublishedProperty(property) {
  const slug = normalizePropertySlug(property?.slug)
  const name = String(property?.name ?? property?.title ?? '').trim()

  return {
    slug,
    name: name || slug,
  }
}

// Matches the two hosts this codebase actually serves property gallery images from:
// the legacy resizing CDN (see src/lib/remoteImage.js) and Firebase Storage, where
// newly uploaded media lives (see functions/src/mediaRepository.js). Scoping to these,
// rather than accepting any https:// URL, keeps a compromised/careless admin session
// from directing this server to fetch and publish an arbitrary externally-hosted image
// to the business's Facebook or Instagram Page.
const HOSTED_ASSET_URL_PATTERN = /^https:\/\/(?:static\.[a-z]{3}static\.com\/media\/|firebasestorage\.googleapis\.com\/v0\/b\/)/i

function normalizeImageUrl(value) {
  const normalized = String(value ?? '').trim()

  if (!normalized) {
    return ''
  }

  if (!HOSTED_ASSET_URL_PATTERN.test(normalized)) {
    throw new HttpError(400, 'The post image must be a URL from the property media library (pick one from the property gallery).')
  }

  return normalized
}

// --- Firestore normalization -----------------------------------------------

function normalizePlatformResult(result = {}) {
  return {
    platform: String(result?.platform ?? '').trim(),
    status: String(result?.status ?? '').trim() || 'failed',
    externalId: String(result?.externalId ?? '').trim(),
    message: String(result?.message ?? '').trim(),
    metrics: result?.metrics && typeof result.metrics === 'object' ? { ...result.metrics } : null,
    metricsRefreshedAt: normalizeTimestampValue(result?.metricsRefreshedAt),
  }
}

function normalizeSocialPostRecord(id, record = {}) {
  return {
    id: String(id ?? '').trim(),
    propertySlug: String(record.propertySlug ?? '').trim(),
    propertyName: String(record.propertyName ?? '').trim(),
    message: String(record.message ?? '').trim(),
    imageUrl: String(record.imageUrl ?? '').trim(),
    status: String(record.status ?? '').trim() || 'failed',
    platformResults: Array.isArray(record.platformResults) ? record.platformResults.map(normalizePlatformResult) : [],
    createdAt: normalizeTimestampValue(record.createdAt),
    updatedAt: normalizeTimestampValue(record.updatedAt),
    createdBy: String(record.createdBy ?? '').trim(),
  }
}

// A post only counts as 'failed' when at least one platform was actually attempted
// and failed; if every selected platform was simply unconfigured, that's a setup
// issue, not a publish failure, so it gets its own status.
function computePostStatus(platformResults) {
  const hasPublished = platformResults.some((result) => result.status === 'published')
  const allNotConnected = platformResults.every((result) => result.status === 'not_connected')

  return hasPublished ? 'published' : allNotConnected ? 'not_connected' : 'failed'
}

// --- Public repository functions --------------------------------------------

async function listSocialPostsForProperty(propertySlug) {
  const normalizedSlug = normalizePropertySlug(propertySlug)

  try {
    const snapshot = await getDb()
      .collection(SOCIAL_POST_COLLECTION)
      .where('propertySlug', '==', normalizedSlug)
      .get()

    return snapshot.docs
      .map((document) => normalizeSocialPostRecord(document.id, document.data()))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The social posts service is temporarily unavailable.')
    }

    throw error
  }
}

async function createSocialPost(payload, adminUser, property) {
  const normalizedProperty = normalizePublishedProperty(property)
  const propertySlug = normalizedProperty.slug
  const propertyName = normalizedProperty.name
  const message = normalizeMessage(payload?.message)
  const imageUrl = normalizeImageUrl(payload?.imageUrl)
  const platforms = normalizePlatforms(payload?.platforms)
  const config = getSocialMediaConfig()
  const connection = getSocialConnectionStatus()

  const platformResults = await Promise.all(
    platforms.map(async (platform) => {
      if (platform === 'facebook' && !connection.facebookConfigured) {
        return normalizePlatformResult({
          platform,
          status: 'not_connected',
          message:
            'Facebook is not connected yet. Set FACEBOOK_PAGE_ID and the FACEBOOK_PAGE_ACCESS_TOKEN secret, then redeploy.',
        })
      }

      if (platform === 'instagram' && !connection.instagramConfigured) {
        return normalizePlatformResult({
          platform,
          status: 'not_connected',
          message:
            'Instagram is not connected yet. Set INSTAGRAM_BUSINESS_ACCOUNT_ID and the FACEBOOK_PAGE_ACCESS_TOKEN secret, then redeploy.',
        })
      }

      try {
        if (platform === 'facebook') {
          const { externalId } = await publishFacebookPost({
            pageId: config.pageId,
            accessToken: config.pageAccessToken,
            message,
            imageUrl,
          })

          return normalizePlatformResult({ platform, status: 'published', externalId })
        }

        const { externalId } = await publishInstagramPost({
          igUserId: config.instagramBusinessAccountId,
          accessToken: config.pageAccessToken,
          message,
          imageUrl,
        })

        return normalizePlatformResult({ platform, status: 'published', externalId })
      } catch (error) {
        return normalizePlatformResult({
          platform,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Publishing failed.',
        })
      }
    }),
  )

  const status = computePostStatus(platformResults)

  const db = getDb()
  const docRef = db.collection(SOCIAL_POST_COLLECTION).doc()
  const nowIso = new Date().toISOString()
  const record = {
    propertySlug,
    propertyName,
    message,
    imageUrl,
    status,
    platformResults,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: adminUser.email || adminUser.uid,
  }

  await docRef.set({ ...record, createdAt: getServerTimestamp(), updatedAt: getServerTimestamp() })

  return normalizeSocialPostRecord(docRef.id, record)
}

async function refreshSocialPostMetrics(postId) {
  const normalizedId = String(postId ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'A post id is required.')
  }

  const config = getSocialMediaConfig()
  const docRef = getDb().collection(SOCIAL_POST_COLLECTION).doc(normalizedId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That social post could not be found.')
  }

  const post = normalizeSocialPostRecord(snapshot.id, snapshot.data())

  const refreshedResults = await Promise.all(
    post.platformResults.map(async (result) => {
      if (result.status !== 'published' || !result.externalId || !config.pageAccessToken) {
        return result
      }

      try {
        const metrics =
          result.platform === 'facebook'
            ? await getFacebookPostMetrics({ postId: result.externalId, accessToken: config.pageAccessToken })
            : await getInstagramMediaMetrics({ mediaId: result.externalId, accessToken: config.pageAccessToken })

        return normalizePlatformResult({ ...result, metrics, metricsRefreshedAt: new Date().toISOString() })
      } catch (error) {
        return normalizePlatformResult({
          ...result,
          message: error instanceof Error ? error.message : result.message,
        })
      }
    }),
  )

  const updatedAtIso = new Date().toISOString()
  await docRef.update({ platformResults: refreshedResults, updatedAt: getServerTimestamp() })

  return normalizeSocialPostRecord(normalizedId, { ...post, platformResults: refreshedResults, updatedAt: updatedAtIso })
}

function normalizeSummaryDateRange({ startDate, endDate } = {}) {
  const normalizedStartDate = normalizeDateOnly(startDate)
  const normalizedEndDate = normalizeDateOnly(endDate)

  if (normalizedStartDate && normalizedEndDate) {
    return { startDate: normalizedStartDate, endDate: normalizedEndDate }
  }

  const today = getLocalDateOnly()
  return { startDate: addDays(today, -DEFAULT_SUMMARY_WINDOW_DAYS), endDate: today }
}

async function getPropertySocialSummary({ propertySlug, startDate, endDate }) {
  const normalizedSlug = normalizePropertySlug(propertySlug)
  const dateRange = normalizeSummaryDateRange({ startDate, endDate })

  const [visitorEngagement, posts] = await Promise.all([
    getPropertyEngagementSummary({ itemType: 'property', itemId: normalizedSlug, ...dateRange }),
    listSocialPostsForProperty(normalizedSlug),
  ])

  return { propertySlug: normalizedSlug, dateRange, visitorEngagement, posts }
}

exports.createSocialPost = createSocialPost
exports.getPropertySocialSummary = getPropertySocialSummary
exports.getSocialConnectionStatus = getSocialConnectionStatus
exports.listSocialPostsForProperty = listSocialPostsForProperty
exports.refreshSocialPostMetrics = refreshSocialPostMetrics
exports.SOCIAL_MEDIA_SECRETS = SOCIAL_MEDIA_SECRETS
exports._test = {
  computePostStatus,
  normalizePlatforms,
  normalizePublishedProperty,
  normalizeSocialPostRecord,
  normalizeSummaryDateRange,
}
