const { createHash } = require('node:crypto')
const { HttpError, getDb, getServerTimestamp } = require('./firebaseAdmin')

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)

  if (!Number.isFinite(number) || number <= 0) {
    return fallback
  }

  return Math.floor(number)
}

function hashKey(scope, value) {
  const normalizedValue = String(value ?? '').trim()

  if (!normalizedValue) {
    return ''
  }

  return createHash('sha256').update(`${scope}:${normalizedValue}`).digest('hex')
}

// Firebase Hosting/Cloud Functions front every request with a Google-managed proxy
// that documents the originating client's IP as the first entry of X-Forwarded-For
// (see https://firebase.google.com/docs/hosting/serve-dynamic-content#request_headers)
// - any extra entries a client appends to that header land after it, not before it,
// so they can't be used to shift a spoofed address into the first position. This is
// resolved explicitly here rather than relying on Express's implicit `req.ip`, whose
// value depends on trust-proxy configuration that isn't set anywhere in this codebase.
// Falls back to request.ip for local/emulator use, where no proxy sets this header.
function getRequestIp(request) {
  const forwardedFor = String(request?.headers?.['x-forwarded-for'] ?? '').trim()

  if (forwardedFor) {
    const [firstEntry] = forwardedFor.split(',')
    const normalized = firstEntry.trim()

    if (normalized) {
      return normalized
    }
  }

  return String(request?.ip ?? '').trim()
}

// Rate-limit tracking docs are one-per-key-ever-seen and otherwise live forever.
// Firestore TTL policies delete documents automatically once this field is in the
// past, but only after a TTL policy is configured on each rate-limit collection for
// this field (`gcloud firestore fields ttl-policies create --collection-group=<name>
// --field=expiresAt --enable-ttl`, once per collection) - this just makes that
// possible by stamping every doc with one.
function getExpiresAtDate(windowMs) {
  return new Date(Date.now() + windowMs * 4)
}

// Rate-limits on every identifying key it's given (e.g. request IP plus a
// per-visitor client token), not just the first one that resolves - a
// request is only left unthrottled when none of the keys resolve to
// anything, which callers should treat as a hard failure (see noKeyMessage)
// rather than a silent pass-through.
async function assertRateLimit({ collection, keys, maxRequests, windowMs, message, noKeyMessage }) {
  const rateLimitKeys = [...new Set((keys ?? []).filter(Boolean))]

  if (rateLimitKeys.length === 0) {
    throw new HttpError(400, noKeyMessage || 'Unable to verify this request.')
  }

  const db = getDb()
  const refs = rateLimitKeys.map((key) => db.collection(collection).doc(key))
  const now = Date.now()

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
    const blocked = snapshots.some((snapshot) => {
      const data = snapshot.exists ? snapshot.data() : null
      const windowStartedAtMs = Number(data?.windowStartedAtMs) || 0
      const count = Number(data?.count) || 0
      const withinWindow = windowStartedAtMs > 0 && now - windowStartedAtMs < windowMs

      return withinWindow && count >= maxRequests
    })

    if (blocked) {
      throw new HttpError(429, message)
    }

    refs.forEach((ref, index) => {
      const data = snapshots[index].exists ? snapshots[index].data() : null
      const windowStartedAtMs = Number(data?.windowStartedAtMs) || 0
      const count = Number(data?.count) || 0
      const withinWindow = windowStartedAtMs > 0 && now - windowStartedAtMs < windowMs

      transaction.set(
        ref,
        {
          count: withinWindow ? count + 1 : 1,
          lastRequestAtMs: now,
          updatedAt: getServerTimestamp(),
          windowMs,
          windowStartedAtMs: withinWindow ? windowStartedAtMs : now,
          expiresAt: getExpiresAtDate(windowMs),
        },
        { merge: true },
      )
    })
  })
}

exports.assertRateLimit = assertRateLimit
exports.getRequestIp = getRequestIp
exports.hashKey = hashKey
exports.normalizePositiveInteger = normalizePositiveInteger
