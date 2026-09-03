const { createHash } = require('node:crypto')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { recordSiteLikeEngagement } = require('./engagementRepository')

const LIKE_COLLECTION = 'siteLikes'
const LIKE_RATE_LIMIT_COLLECTION = 'siteLikeRateLimits'
const LIKER_SUBCOLLECTION = 'likers'
const ALLOWED_ITEM_TYPES = new Set(['property', 'charter'])
const ITEM_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/
const CLIENT_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return fallback
  }

  return Math.floor(number)
}

function getLikeRateLimitConfig() {
  return {
    maxRequests: normalizePositiveInteger(process.env.SITE_LIKE_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    windowMs: normalizePositiveInteger(process.env.SITE_LIKE_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  }
}

function hashKey(scope, value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return ''
  }

  return createHash('sha256').update(`${scope}:${normalizedValue}`).digest('hex')
}

function normalizeItemType(value) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!ALLOWED_ITEM_TYPES.has(normalized)) {
    throw new HttpError(400, `Unsupported item type for likes: ${normalized || 'unknown'}`)
  }

  return normalized
}

function normalizeItemId(value) {
  const normalized = String(value ?? '').trim()

  if (!ITEM_ID_PATTERN.test(normalized)) {
    throw new HttpError(400, 'A valid item id is required to like this item.')
  }

  return normalized
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

async function assertLikeRateLimit(request) {
  const config = getLikeRateLimitConfig()
  const key = hashKey('ip', request?.ip)

  if (!key) {
    return
  }

  const db = getDb()
  const ref = db.collection(LIKE_RATE_LIMIT_COLLECTION).doc(key)
  const now = Date.now()

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const data = snapshot.exists ? snapshot.data() : null
    const windowStartedAtMs = Number(data?.windowStartedAtMs) || 0
    const count = Number(data?.count) || 0
    const withinWindow = windowStartedAtMs > 0 && now - windowStartedAtMs < config.windowMs

    if (withinWindow && count >= config.maxRequests) {
      throw new HttpError(429, 'Too many like requests. Please wait a bit and try again.')
    }

    transaction.set(
      ref,
      {
        count: withinWindow ? count + 1 : 1,
        lastRequestAtMs: now,
        updatedAt: getServerTimestamp(),
        windowMs: config.windowMs,
        windowStartedAtMs: withinWindow ? windowStartedAtMs : now,
      },
      { merge: true },
    )
  })
}

async function getLikeSummary({ itemType, itemId, clientToken }) {
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

  await assertLikeRateLimit(request)

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
