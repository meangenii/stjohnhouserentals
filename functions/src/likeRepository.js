const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { recordSiteLikeEngagement } = require('./engagementRepository')
const { assertRateLimit, getRequestIp, hashKey, normalizePositiveInteger } = require('./rateLimiter')
const { normalizeItemType: normalizeTrackableItemType, normalizeItemId: normalizeTrackableItemId } = require('./trackableItem')

const LIKE_COLLECTION = 'siteLikes'
const LIKE_RATE_LIMIT_COLLECTION = 'siteLikeRateLimits'
const LIKE_SUMMARY_RATE_LIMIT_COLLECTION = 'siteLikeSummaryRateLimits'
const LIKER_SUBCOLLECTION = 'likers'
const CLIENT_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60
const DEFAULT_SUMMARY_RATE_LIMIT_MAX_REQUESTS = 300

function getLikeRateLimitConfig() {
  return {
    maxRequests: normalizePositiveInteger(process.env.SITE_LIKE_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    windowMs: normalizePositiveInteger(process.env.SITE_LIKE_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  }
}

function getLikeSummaryRateLimitConfig() {
  return {
    maxRequests: normalizePositiveInteger(process.env.SITE_LIKE_SUMMARY_RATE_LIMIT_MAX, DEFAULT_SUMMARY_RATE_LIMIT_MAX_REQUESTS),
    windowMs: normalizePositiveInteger(process.env.SITE_LIKE_SUMMARY_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  }
}

function normalizeItemType(value) {
  return normalizeTrackableItemType(value, { message: `Unsupported item type for likes: ${String(value ?? '').trim().toLowerCase() || 'unknown'}` })
}

function normalizeItemId(value) {
  return normalizeTrackableItemId(value, { message: 'A valid item id is required to like this item.' })
}

function normalizeClientToken(value) {
  const normalized = String(value ?? '').trim()

  if (!CLIENT_TOKEN_PATTERN.test(normalized)) {
    throw new HttpError(400, 'A valid client token is required.')
  }

  return normalized
}

function getLikeDocId(itemType, itemId) {
  return `${itemType}:${itemId}`
}

async function assertLikeRateLimit(request, clientToken) {
  const config = getLikeRateLimitConfig()

  await assertRateLimit({
    collection: LIKE_RATE_LIMIT_COLLECTION,
    keys: [hashKey('ip', getRequestIp(request)), hashKey('token', clientToken)],
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    message: 'Too many like requests. Please wait a bit and try again.',
    noKeyMessage: 'Unable to verify this request.',
  })
}

async function assertLikeSummaryRateLimit(request) {
  const config = getLikeSummaryRateLimitConfig()

  await assertRateLimit({
    collection: LIKE_SUMMARY_RATE_LIMIT_COLLECTION,
    keys: [hashKey('ip', getRequestIp(request))],
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    message: 'Too many requests. Please wait a bit and try again.',
    noKeyMessage: 'Unable to verify this request.',
  })
}

async function getLikeSummary({ itemType, itemId, clientToken }, request) {
  await assertLikeSummaryRateLimit(request)

  const normalizedItemType = normalizeItemType(itemType)
  const normalizedItemId = normalizeItemId(itemId)
  const likeRef = getDb().collection(LIKE_COLLECTION).doc(getLikeDocId(normalizedItemType, normalizedItemId))

  try {
    const likeSnapshot = await likeRef.get()
    const count = Math.max(0, Number(likeSnapshot.data()?.count) || 0)
    let liked = false

    if (clientToken) {
      const likerRef = likeRef.collection(LIKER_SUBCOLLECTION).doc(hashKey('liker', normalizeClientToken(clientToken)))
      const likerSnapshot = await likerRef.get()
      liked = likerSnapshot.exists
    }

    return { itemType: normalizedItemType, itemId: normalizedItemId, count, liked }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The like service is temporarily unavailable.')
    }

    throw error
  }
}

async function toggleLike({ itemType, itemId, clientToken }, request) {
  const normalizedItemType = normalizeItemType(itemType)
  const normalizedItemId = normalizeItemId(itemId)
  const normalizedClientToken = normalizeClientToken(clientToken)

  await assertLikeRateLimit(request, normalizedClientToken)

  const db = getDb()
  const likeRef = db.collection(LIKE_COLLECTION).doc(getLikeDocId(normalizedItemType, normalizedItemId))
  const likerRef = likeRef.collection(LIKER_SUBCOLLECTION).doc(hashKey('liker', normalizedClientToken))

  try {
    const result = await db.runTransaction(async (transaction) => {
      const [likeSnapshot, likerSnapshot] = await Promise.all([transaction.get(likeRef), transaction.get(likerRef)])
      const currentCount = Math.max(0, Number(likeSnapshot.data()?.count) || 0)
      const alreadyLiked = likerSnapshot.exists
      const nextCount = alreadyLiked ? Math.max(0, currentCount - 1) : currentCount + 1

      if (alreadyLiked) {
        transaction.delete(likerRef)
      } else {
        transaction.set(likerRef, { likedAt: getServerTimestamp() })
      }

      transaction.set(
        likeRef,
        {
          itemType: normalizedItemType,
          itemId: normalizedItemId,
          count: nextCount,
          updatedAt: getServerTimestamp(),
        },
        { merge: true },
      )

      return { liked: !alreadyLiked, count: nextCount }
    })

    if (result.liked) {
      await recordSiteLikeEngagement(normalizedItemType, normalizedItemId)
    }

    return { itemType: normalizedItemType, itemId: normalizedItemId, ...result }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The like service is temporarily unavailable.')
    }

    throw error
  }
}

exports.getLikeSummary = getLikeSummary
exports.toggleLike = toggleLike
