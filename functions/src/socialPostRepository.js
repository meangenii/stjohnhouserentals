const { defineSecret } = require('firebase-functions/params')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { getPropertyEngagementSummary } = require('./engagementRepository')

const SOCIAL_POST_COLLECTION = 'cmsSocialPosts'
const DEFAULT_GRAPH_API_VERSION = 'v26.0'
const GRAPH_API_ROOT = 'https://graph.facebook.com'
const ALLOWED_PLATFORMS = new Set(['facebook', 'instagram'])
const FACEBOOK_POST_INSIGHT_METRIC_SETS = [
  ['post_media_view', 'post_total_media_view_unique', 'post_clicks'],
  ['post_impressions', 'post_impressions_unique', 'post_clicks'],
]
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
  const searchParams = new URLSearchParams(params)
  const authHeaders = accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

  let response

  try {
    if (method === 'GET') {
      url.search = searchParams.toString()
      response = await fetch(url, { method: 'GET', headers: authHeaders })
    } else {
      response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...authHeaders },
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

async function resolveFacebookPageAccessToken({ pageId, accessToken }) {
  if (!pageId || !accessToken) {
    return accessToken
  }

  try {
    const result = await callGraphApi('me/accounts', {
      accessToken,
      params: {
        fields: 'id,name,access_token',
        limit: '100',
      },
    })
    const pages = Array.isArray(result?.data) ? result.data : []
    const page = pages.find((candidate) => String(candidate?.id ?? '').trim() === pageId)

    return String(page?.access_token ?? '').trim() || accessToken
  } catch {
    // The configured secret may already be a Page token, in which case /me/accounts
    // is not guaranteed to be available. Fall back and let the Page call report any
    // remaining permission problem.
    return accessToken
  }
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
  const insights = await getFacebookPostInsights({ postId, accessToken }).catch(() => ({
    views: null,
    viewers: null,
    clicks: null,
  }))

  return {
    likes: Number(result?.likes?.summary?.total_count) || 0,
    comments: Number(result?.comments?.summary?.total_count) || 0,
    shares: Number(result?.shares?.count) || 0,
    ...insights,
  }
}

function sumInsightValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + sumInsightValue(entry), 0)
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, entry) => sum + sumInsightValue(entry), 0)
  }

  return 0
}

function getInsightMetricValue(insights, metricNames) {
  const metricNameSet = new Set(metricNames)
  const entry = insights.find((candidate) => metricNameSet.has(candidate?.name))
  const values = Array.isArray(entry?.values) ? entry.values : []
  const value = values.length > 0 ? values[values.length - 1]?.value : null

  return value === null || value === undefined ? null : sumInsightValue(value)
}

async function getFacebookPostInsights({ postId, accessToken }) {
  let lastError = null

  for (const metricSet of FACEBOOK_POST_INSIGHT_METRIC_SETS) {
    try {
      const result = await callGraphApi(`${postId}/insights`, {
        accessToken,
        params: {
          metric: metricSet.join(','),
          period: 'lifetime',
        },
      })
      const insights = Array.isArray(result?.data) ? result.data : []

      return {
        views: getInsightMetricValue(insights, ['post_media_view', 'post_impressions']),
        viewers: getInsightMetricValue(insights, ['post_total_media_view_unique', 'post_impressions_unique']),
        clicks: getInsightMetricValue(insights, ['post_clicks']),
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new HttpError(502, 'Facebook Graph API did not return post insights.')
}

// Paginates through the Page's own post history via the `after` cursor, rather than
// re-parsing the full `paging.next` URL Facebook returns - simpler, and callGraphApi
// already owns building the request URL (including re-adding the access token).
async function listFacebookPagePosts({ pageId, accessToken, sinceDate, untilDate, maxPages = 10 }) {
  const posts = []
  let after = null

  for (let page = 0; page < maxPages; page += 1) {
    const result = await callGraphApi(`${pageId}/posts`, {
      accessToken,
      params: {
        fields: 'id,message,created_time,permalink_url',
        since: sinceDate,
        until: untilDate,
        limit: '100',
        ...(after ? { after } : {}),
      },
    })

    const data = Array.isArray(result?.data) ? result.data : []
    posts.push(...data)

    after = result?.paging?.cursors?.after || null

    if (!after || data.length === 0) {
      break
    }
  }

  return posts
}

async function listInstagramMedia({ igUserId, accessToken, maxPages = 10 }) {
  const media = []
  let after = null

  for (let page = 0; page < maxPages; page += 1) {
    const result = await callGraphApi(`${igUserId}/media`, {
      accessToken,
      params: {
        fields: 'id,caption,timestamp,permalink,media_type,like_count,comments_count',
        limit: '100',
        ...(after ? { after } : {}),
      },
    })

    const data = Array.isArray(result?.data) ? result.data : []
    media.push(...data)

    after = result?.paging?.cursors?.after || null

    if (!after || data.length === 0) {
      break
    }
  }

  return media
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

// --- Finding existing Facebook posts made outside this app ------------------
//
// createSocialPost/refreshSocialPostMetrics only know about posts published through
// this app's own composer. An admin posting directly on Facebook has no such record,
// so the only way to surface those posts for an invoice is to search the Page's own
// post history and match by whether the property is mentioned - Facebook has no
// "this post is about this listing" tag to query by instead.

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeCompactSearchText(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9]+/g, '')
}

// Matches on whole phrases (full property name, full slug/URL) rather than individual
// words, so a short/common word in a property name ("The Nest") can't match unrelated
// posts on its own.
function getPropertyMatchTerms(property) {
  const propertyPath = property?.path || (property?.slug ? `/rental-properties/${property.slug}` : '')
  const terms = [property?.name, property?.slug, property?.adminOriginalSlug, propertyPath]
    .map((term) => normalizeSearchText(term))
    .filter((term) => term.length > 2)

  const compactTerms = terms
    .map((term) => normalizeCompactSearchText(term))
    .filter((term) => term.length > 2)

  return Array.from(new Set([...terms, ...compactTerms]))
}

function postMentionsProperty(post, matchTerms) {
  const haystack = normalizeSearchText(`${post?.message ?? ''} ${post?.caption ?? ''} ${post?.permalink_url ?? ''} ${post?.permalink ?? ''}`)
  const compactHaystack = normalizeCompactSearchText(haystack)

  return matchTerms.some((term) => {
    const normalizedTerm = normalizeSearchText(term)
    const compactTerm = normalizeCompactSearchText(term)

    return haystack.includes(normalizedTerm) || (compactTerm.length > 2 && compactHaystack.includes(compactTerm))
  })
}

function normalizeFoundFacebookPost(post, metrics) {
  return {
    platform: 'facebook',
    externalId: String(post?.id ?? '').trim(),
    message: String(post?.message ?? '').trim(),
    permalinkUrl: String(post?.permalink_url ?? '').trim(),
    createdTime: normalizeTimestampValue(post?.created_time) || String(post?.created_time ?? '').trim(),
    ...metrics,
  }
}

function normalizeFoundInstagramPost(media) {
  return {
    platform: 'instagram',
    externalId: String(media?.id ?? '').trim(),
    message: String(media?.caption ?? '').trim(),
    permalinkUrl: String(media?.permalink ?? '').trim(),
    createdTime: normalizeTimestampValue(media?.timestamp) || String(media?.timestamp ?? '').trim(),
    mediaType: String(media?.media_type ?? '').trim(),
    likes: Number(media?.like_count) || 0,
    comments: Number(media?.comments_count) || 0,
  }
}

function normalizeStoredSocialPostResult(post, result, metrics = {}) {
  const platform = String(result?.platform ?? '').trim().toLowerCase()
  const externalId = String(result?.externalId ?? '').trim()

  if (!ALLOWED_PLATFORMS.has(platform) || !externalId) {
    return null
  }

  return {
    platform,
    externalId,
    message: post.message,
    permalinkUrl: String(metrics?.permalinkUrl ?? '').trim(),
    createdTime: metrics.createdTime || post.createdAt || post.updatedAt,
    imageUrl: post.imageUrl,
    mediaType: String(metrics?.mediaType ?? '').trim(),
    views: metrics.views ?? result.metrics?.views ?? null,
    viewers: metrics.viewers ?? result.metrics?.viewers ?? null,
    clicks: metrics.clicks ?? result.metrics?.clicks ?? null,
    likes: metrics.likes ?? result.metrics?.likes ?? null,
    comments: metrics.comments ?? result.metrics?.comments ?? null,
    shares: metrics.shares ?? result.metrics?.shares ?? null,
  }
}

function postDateOnly(post) {
  const timestamp =
    normalizeTimestampValue(post?.created_time ?? post?.timestamp ?? post?.createdAt ?? post?.updatedAt)
    || String(post?.created_time ?? post?.timestamp ?? post?.createdAt ?? post?.updatedAt ?? '').trim()
  return timestamp.slice(0, 10)
}

function postIsWithinDateRange(post, dateRange) {
  const dateOnly = postDateOnly(post)

  if (!DATE_ONLY_PATTERN.test(dateOnly)) {
    return true
  }

  return dateOnly >= dateRange.startDate && dateOnly <= dateRange.endDate
}

async function findFacebookPostsForProperty(property, { startDate, endDate } = {}) {
  const dateRange = normalizeSummaryDateRange({ startDate, endDate })
  const connection = getSocialConnectionStatus()

  if (!connection.facebookConfigured) {
    return { status: 'not_connected', message: 'Facebook is not connected yet.', dateRange, posts: [] }
  }

  const matchTerms = getPropertyMatchTerms(property)

  if (matchTerms.length === 0) {
    return { status: 'ready', dateRange, posts: [] }
  }

  const config = getSocialMediaConfig()
  let candidatePosts

  try {
    const pageAccessToken = await resolveFacebookPageAccessToken({
      pageId: config.pageId,
      accessToken: config.pageAccessToken,
    })

    candidatePosts = await listFacebookPagePosts({
      pageId: config.pageId,
      accessToken: pageAccessToken,
      sinceDate: dateRange.startDate,
      // `until` is treated as an exclusive upper bound by the Graph API, so pad by a
      // day to include the invoice period's own end date.
      untilDate: addDays(dateRange.endDate, 1),
    })

    config.pageAccessToken = pageAccessToken
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Unable to search Facebook posts.',
      dateRange,
      posts: [],
    }
  }

  const matchedPosts = candidatePosts.filter((post) => postMentionsProperty(post, matchTerms))

  const posts = await Promise.all(
    matchedPosts.map(async (post) => {
      try {
        const metrics = await getFacebookPostMetrics({ postId: post.id, accessToken: config.pageAccessToken })
        return normalizeFoundFacebookPost(post, metrics)
      } catch {
        // Skip a post whose metrics can't be read rather than failing the whole search.
        return null
      }
    }),
  )

  return { status: 'ready', dateRange, posts: posts.filter(Boolean) }
}

async function findInstagramPostsForProperty(property, { startDate, endDate } = {}) {
  const dateRange = normalizeSummaryDateRange({ startDate, endDate })
  const connection = getSocialConnectionStatus()

  if (!connection.instagramConfigured) {
    return { status: 'not_connected', message: 'Instagram is not connected yet.', dateRange, posts: [] }
  }

  const matchTerms = getPropertyMatchTerms(property)

  if (matchTerms.length === 0) {
    return { status: 'ready', dateRange, posts: [] }
  }

  const config = getSocialMediaConfig()
  let candidateMedia

  try {
    const pageAccessToken = await resolveFacebookPageAccessToken({
      pageId: config.pageId,
      accessToken: config.pageAccessToken,
    })

    candidateMedia = await listInstagramMedia({
      igUserId: config.instagramBusinessAccountId,
      accessToken: pageAccessToken,
    })
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Unable to search Instagram posts.',
      dateRange,
      posts: [],
    }
  }

  const posts = candidateMedia
    .filter((media) => postIsWithinDateRange(media, dateRange))
    .filter((media) => postMentionsProperty(media, matchTerms))
    .map(normalizeFoundInstagramPost)
    .filter((post) => post.externalId)

  return { status: 'ready', dateRange, posts }
}

async function getStoredFacebookPostSnapshot({ post, result, accessToken }) {
  try {
    const [details, metrics] = await Promise.all([
      callGraphApi(result.externalId, { accessToken, params: { fields: 'id,message,created_time,permalink_url' } }),
      getFacebookPostMetrics({ postId: result.externalId, accessToken }),
    ])

    return normalizeStoredSocialPostResult(post, result, {
      ...metrics,
      createdTime: normalizeTimestampValue(details?.created_time) || String(details?.created_time ?? '').trim(),
      permalinkUrl: details?.permalink_url,
    })
  } catch {
    return normalizeStoredSocialPostResult(post, result)
  }
}

async function getStoredInstagramPostSnapshot({ post, result, accessToken }) {
  try {
    const details = await callGraphApi(result.externalId, {
      accessToken,
      params: { fields: 'id,caption,timestamp,permalink,media_type,like_count,comments_count' },
    })

    return normalizeStoredSocialPostResult(post, result, {
      createdTime: normalizeTimestampValue(details?.timestamp) || String(details?.timestamp ?? '').trim(),
      permalinkUrl: details?.permalink,
      mediaType: details?.media_type,
      likes: Number(details?.like_count) || 0,
      comments: Number(details?.comments_count) || 0,
    })
  } catch {
    return normalizeStoredSocialPostResult(post, result)
  }
}

async function findStoredSocialPostsForProperty(property, { startDate, endDate } = {}) {
  const dateRange = normalizeSummaryDateRange({ startDate, endDate })
  const storedPosts = await listSocialPostsForProperty(property.slug)
  const periodPosts = storedPosts.filter((post) => postIsWithinDateRange(post, dateRange))
  const config = getSocialMediaConfig()
  const connection = getSocialConnectionStatus()
  let pageAccessToken = config.pageAccessToken

  if ((connection.facebookConfigured || connection.instagramConfigured) && config.pageId && config.pageAccessToken) {
    try {
      pageAccessToken = await resolveFacebookPageAccessToken({
        pageId: config.pageId,
        accessToken: config.pageAccessToken,
      })
    } catch {
      pageAccessToken = config.pageAccessToken
    }
  }

  const snapshots = await Promise.all(
    periodPosts.flatMap((post) =>
      post.platformResults
        .filter((result) => result.status === 'published' && result.externalId)
        .map((result) => {
          if (result.platform === 'facebook' && pageAccessToken) {
            return getStoredFacebookPostSnapshot({ post, result, accessToken: pageAccessToken })
          }

          if (result.platform === 'instagram' && pageAccessToken) {
            return getStoredInstagramPostSnapshot({ post, result, accessToken: pageAccessToken })
          }

          return Promise.resolve(normalizeStoredSocialPostResult(post, result))
        }),
    ),
  )

  return snapshots.filter(Boolean)
}

async function findSocialPostsForProperty(property, { startDate, endDate } = {}) {
  const dateRange = normalizeSummaryDateRange({ startDate, endDate })
  const [facebook, instagram, storedPosts] = await Promise.all([
    findFacebookPostsForProperty(property, dateRange),
    findInstagramPostsForProperty(property, dateRange),
    findStoredSocialPostsForProperty(property, dateRange).catch(() => []),
  ])
  const platformResults = { facebook, instagram }
  const successfulResults = [facebook, instagram].filter((result) => result.status === 'ready')
  const postsByKey = new Map()

  ;[...successfulResults.flatMap((result) => (Array.isArray(result.posts) ? result.posts : [])), ...storedPosts].forEach((post) => {
    const key = `${post.platform}:${post.externalId}`

    if (post.externalId && !postsByKey.has(key)) {
      postsByKey.set(key, post)
    }
  })

  const posts = Array.from(postsByKey.values())
    .sort((a, b) => (a.createdTime < b.createdTime ? 1 : a.createdTime > b.createdTime ? -1 : 0))

  if (successfulResults.length > 0 || posts.length > 0) {
    return { status: 'ready', dateRange, posts, platformResults }
  }

  if ([facebook, instagram].every((result) => result.status === 'not_connected')) {
    return {
      status: 'not_connected',
      message: 'Facebook and Instagram are not connected yet.',
      dateRange,
      posts: [],
      platformResults,
    }
  }

  return {
    status: 'unavailable',
    message: [facebook.message, instagram.message].filter(Boolean).join(' ') || 'Unable to load social post stats.',
    dateRange,
    posts: [],
    platformResults,
  }
}

// Recognizes the post-id shapes that appear in the Facebook URLs an admin is likely to
// paste (a permalink, a photo/video permalink, or the old permalink.php?story_fbid=&id=
// form), plus a bare id typed in directly. Anything else is rejected with a message
// telling the admin what to paste instead, rather than guessing.
const FACEBOOK_POST_URL_ID_PATTERNS = [/\/posts\/(\d+)/, /\/videos\/(\d+)/, /\/photos\/[^/]+\/(\d+)/]

function extractFacebookPostReference(url) {
  const trimmed = String(url ?? '').trim()

  if (!trimmed) {
    throw new HttpError(400, 'A Facebook post URL is required.')
  }

  if (/^\d+(_\d+)?$/.test(trimmed)) {
    return trimmed
  }

  for (const pattern of FACEBOOK_POST_URL_ID_PATTERNS) {
    const match = trimmed.match(pattern)

    if (match) {
      return match[1]
    }
  }

  const storyIdMatch = trimmed.match(/story_fbid=(\d+)/)
  const pageIdMatch = trimmed.match(/[?&]id=(\d+)/)

  if (storyIdMatch && pageIdMatch) {
    return `${pageIdMatch[1]}_${storyIdMatch[1]}`
  }

  throw new HttpError(
    400,
    "Couldn't find a post id in that link. Paste the post's Facebook permalink, or its numeric post id directly.",
  )
}

async function lookupFacebookPostByUrl(url) {
  const connection = getSocialConnectionStatus()

  if (!connection.facebookConfigured) {
    throw new HttpError(400, 'Facebook is not connected yet.')
  }

  const config = getSocialMediaConfig()
  const reference = extractFacebookPostReference(url)
  const postId = reference.includes('_') ? reference : `${config.pageId}_${reference}`

  const [details, metrics] = await Promise.all([
    callGraphApi(postId, { accessToken: config.pageAccessToken, params: { fields: 'id,message,created_time,permalink_url' } }),
    getFacebookPostMetrics({ postId, accessToken: config.pageAccessToken }),
  ])

  return normalizeFoundFacebookPost({ ...details, permalink_url: details.permalink_url || String(url ?? '').trim() }, metrics)
}

exports.createSocialPost = createSocialPost
exports.findFacebookPostsForProperty = findFacebookPostsForProperty
exports.findInstagramPostsForProperty = findInstagramPostsForProperty
exports.findSocialPostsForProperty = findSocialPostsForProperty
exports.getPropertySocialSummary = getPropertySocialSummary
exports.getSocialConnectionStatus = getSocialConnectionStatus
exports.listSocialPostsForProperty = listSocialPostsForProperty
exports.lookupFacebookPostByUrl = lookupFacebookPostByUrl
exports.refreshSocialPostMetrics = refreshSocialPostMetrics
exports.SOCIAL_MEDIA_SECRETS = SOCIAL_MEDIA_SECRETS
exports._test = {
  computePostStatus,
  extractFacebookPostReference,
  getPropertyMatchTerms,
  normalizePlatforms,
  normalizePublishedProperty,
  normalizeSocialPostRecord,
  normalizeSummaryDateRange,
  postMentionsProperty,
  postIsWithinDateRange,
  sumInsightValue,
}
