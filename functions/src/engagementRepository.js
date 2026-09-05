const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { assertRateLimit, getRequestIp, hashKey, normalizePositiveInteger } = require('./rateLimiter')
const { normalizeItemType: normalizeTrackableItemType, normalizeItemId: normalizeTrackableItemId } = require('./trackableItem')

const ENGAGEMENT_COLLECTION = 'siteEngagementEvents'
const EVENTS_SUBCOLLECTION = 'events'
const RATE_LIMIT_COLLECTION = 'siteEngagementRateLimits'
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// The date this engagement-tracking feature went live. No events exist before
// it, so invoice periods are never reported as covering time before it -
// override with SITE_ENGAGEMENT_TRACKING_START_DATE if the actual deploy date
// differs from this default. Update this constant to the real go-live date at
// deploy time.
const DEFAULT_ENGAGEMENT_TRACKING_START_DATE = '2026-09-03'

// Every trackable (channel, action) pair, and the invoice-facing count key it
// rolls up into. Only positive engagement signals are tracked - there's no
// reliable way to confirm an external share actually completed (Facebook,
// Pinterest, etc. don't report that back to us), so these count clicks/likes,
// not confirmed posts.
const CHANNEL_ACTION_TO_COUNT_KEY = new Map([
  ['site:like', 'siteLikes'],
  ['facebook:like', 'facebookLikes'],
  ['facebook:share_click', 'facebookShareClicks'],
  ['pinterest:share_click', 'pinterestShareClicks'],
  ['twitter:share_click', 'twitterShareClicks'],
  ['whatsapp:share_click', 'whatsappShareClicks'],
  ['email:share_click', 'emailShareClicks'],
  ['native:share_click', 'nativeShareClicks'],
])

function getEngagementRateLimitConfig() {
  return {
    maxRequests: normalizePositiveInteger(process.env.SITE_ENGAGEMENT_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    windowMs: normalizePositiveInteger(process.env.SITE_ENGAGEMENT_RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
  }
}

function normalizeItemType(value) {
  return normalizeTrackableItemType(value, { message: `Unsupported item type for engagement tracking: ${String(value ?? '').trim().toLowerCase() || 'unknown'}` })
}

function normalizeItemId(value) {
  return normalizeTrackableItemId(value, { message: 'A valid item id is required to record engagement.' })
}

function normalizeChannelAction(channel, action) {
  const normalizedChannel = String(channel ?? '').trim().toLowerCase()
  const normalizedAction = String(action ?? '').trim().toLowerCase()
  const key = `${normalizedChannel}:${normalizedAction}`

  if (!CHANNEL_ACTION_TO_COUNT_KEY.has(key)) {
    throw new HttpError(400, `Unsupported engagement channel/action: ${key}`)
  }

  return { normalizedChannel, normalizedAction }
}

function normalizeDateOnly(value) {
  const normalized = String(value ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function getEngagementTrackingStartDate() {
  return normalizeDateOnly(process.env.SITE_ENGAGEMENT_TRACKING_START_DATE) || DEFAULT_ENGAGEMENT_TRACKING_START_DATE
}

function getEngagementDocId(itemType, itemId) {
  return `${itemType}:${itemId}`
}

async function assertEngagementRateLimit(request) {
  const config = getEngagementRateLimitConfig()

  await assertRateLimit({
    collection: RATE_LIMIT_COLLECTION,
    keys: [hashKey('ip', getRequestIp(request))],
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    message: 'Too many engagement events. Please wait a bit and try again.',
    noKeyMessage: 'Unable to verify this request.',
  })
}

async function writeEngagementEvent(itemType, itemId, channel, action) {
  const eventRef = getDb()
    .collection(ENGAGEMENT_COLLECTION)
    .doc(getEngagementDocId(itemType, itemId))
    .collection(EVENTS_SUBCOLLECTION)
    .doc()

  await eventRef.set({ channel, action, createdAt: getServerTimestamp() })
}

async function recordEngagementEvent({ itemType, itemId, channel, action }, request) {
  const normalizedItemType = normalizeItemType(itemType)
  const normalizedItemId = normalizeItemId(itemId)
  const { normalizedChannel, normalizedAction } = normalizeChannelAction(channel, action)

  await assertEngagementRateLimit(request)

  try {
    await writeEngagementEvent(normalizedItemType, normalizedItemId, normalizedChannel, normalizedAction)
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The engagement service is temporarily unavailable.')
    }

    throw error
  }

  return {
    itemType: normalizedItemType,
    itemId: normalizedItemId,
    channel: normalizedChannel,
    action: normalizedAction,
    recorded: true,
  }
}

// Called internally by likeRepository once a like toggle results in a fresh
// "like" (not an unlike) - already validated and rate-limited by that caller,
// so this only logs the event and never fails the like toggle itself.
async function recordSiteLikeEngagement(itemType, itemId) {
  try {
    await writeEngagementEvent(itemType, itemId, 'site', 'like')
  } catch {
    // Best-effort only.
  }
}

function createEmptyEngagementCounts() {
  return Array.from(new Set(CHANNEL_ACTION_TO_COUNT_KEY.values())).reduce((counts, key) => {
    counts[key] = 0
    return counts
  }, {})
}

async function getPropertyEngagementSummary({ itemType, itemId, startDate, endDate }) {
  const normalizedItemType = normalizeItemType(itemType)
  const normalizedItemId = normalizeItemId(itemId)
  const requestedStartDate = normalizeDateOnly(startDate)
  const requestedEndDate = normalizeDateOnly(endDate)
  const trackingStartDate = getEngagementTrackingStartDate()
  const counts = createEmptyEngagementCounts()

  if (!requestedStartDate || !requestedEndDate) {
    return {
      itemType: normalizedItemType,
      itemId: normalizedItemId,
      dateRange: { startDate: requestedStartDate, endDate: requestedEndDate },
      requestedDateRange: { startDate: requestedStartDate, endDate: requestedEndDate },
      trackingStartDate,
      clamped: false,
      counts,
      totalEvents: 0,
    }
  }

  // No events exist before tracking launched, so never report a period as
  // covering time before that date - e.g. a property's first invoice after
  // this feature ships may cover a full subscription year, but engagement was
  // only ever tracked for the tail end of it. Once trackingStartDate is in
  // the past relative to the whole requested period (every later invoice),
  // this is a no-op.
  const effectiveStartDate = requestedStartDate < trackingStartDate ? trackingStartDate : requestedStartDate
  const clamped = effectiveStartDate !== requestedStartDate

  if (effectiveStartDate > requestedEndDate) {
    return {
      itemType: normalizedItemType,
      itemId: normalizedItemId,
      dateRange: { startDate: '', endDate: '' },
      requestedDateRange: { startDate: requestedStartDate, endDate: requestedEndDate },
      trackingStartDate,
      clamped: true,
      counts,
      totalEvents: 0,
    }
  }

  const startTimestamp = new Date(`${effectiveStartDate}T00:00:00.000Z`)
  const endTimestamp = new Date(`${requestedEndDate}T23:59:59.999Z`)

  try {
    const eventsRef = getDb()
      .collection(ENGAGEMENT_COLLECTION)
      .doc(getEngagementDocId(normalizedItemType, normalizedItemId))
      .collection(EVENTS_SUBCOLLECTION)

    const snapshot = await eventsRef.where('createdAt', '>=', startTimestamp).where('createdAt', '<=', endTimestamp).get()
    let totalEvents = 0

    snapshot.forEach((document) => {
      const data = document.data()
      const key = CHANNEL_ACTION_TO_COUNT_KEY.get(`${data?.channel}:${data?.action}`)

      if (key) {
        counts[key] += 1
        totalEvents += 1
      }
    })

    return {
      itemType: normalizedItemType,
      itemId: normalizedItemId,
      dateRange: { startDate: effectiveStartDate, endDate: requestedEndDate },
      requestedDateRange: { startDate: requestedStartDate, endDate: requestedEndDate },
      trackingStartDate,
      clamped,
      counts,
      totalEvents,
    }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The engagement service is temporarily unavailable.')
    }

    throw error
  }
}

exports.getPropertyEngagementSummary = getPropertyEngagementSummary
exports.recordEngagementEvent = recordEngagementEvent
exports.recordSiteLikeEngagement = recordSiteLikeEngagement
