const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const { AsyncLocalStorage } = require('node:async_hooks')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('./firebaseCliCredentialBootstrap')

const DEFAULT_FIRESTORE_DATABASE_ID = '(default)'
const runtimeContext = new AsyncLocalStorage()

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}

let adminCredentialsPrimed = false

function ensureLocalAdminCredentials() {
  if (adminCredentialsPrimed) {
    return
  }

  adminCredentialsPrimed = true
  primeApplicationDefaultCredentialsFromFirebaseCli()
}

function getAdminApp() {
  ensureLocalAdminCredentials()
  return getApps()[0] ?? initializeApp()
}

function normalizeBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim())
}

function isDefaultFirestoreDatabaseId(databaseId) {
  return String(databaseId ?? '').trim() === '' || String(databaseId ?? '').trim() === DEFAULT_FIRESTORE_DATABASE_ID
}

function getFallbackFirestoreDatabaseId() {
  const configuredId = String(process.env.FIRESTORE_DATABASE_ID ?? '').trim()
  return configuredId || DEFAULT_FIRESTORE_DATABASE_ID
}

function getLiveFirestoreDatabaseId() {
  const configuredId = String(process.env.FIRESTORE_LIVE_DATABASE_ID ?? '').trim()
  return configuredId || DEFAULT_FIRESTORE_DATABASE_ID
}

function getStagingFirestoreDatabaseId() {
  return String(process.env.FIRESTORE_STAGING_DATABASE_ID ?? '').trim()
}

function assertFirestoreDatabaseSelection(databaseId) {
  if (normalizeBoolean(process.env.FIRESTORE_ENFORCE_NON_DEFAULT) && isDefaultFirestoreDatabaseId(databaseId)) {
    throw new Error(
      'FIRESTORE_ENFORCE_NON_DEFAULT=true requires FIRESTORE_DATABASE_ID to be set to a non-default Firestore database.',
    )
  }
}

function getRuntimeContext() {
  return runtimeContext.getStore() ?? null
}

function getFirestoreDatabaseId() {
  return getRuntimeContext()?.databaseId || getFallbackFirestoreDatabaseId()
}

function isStagingRuntime() {
  return getRuntimeContext()?.mode === 'staging'
}

function runWithRuntimeContext(context, callback) {
  return runtimeContext.run({ ...(getRuntimeContext() ?? {}), ...(context ?? {}) }, callback)
}

function getDb(databaseId = getFirestoreDatabaseId()) {
  assertFirestoreDatabaseSelection(databaseId)
  return getFirestore(getAdminApp(), databaseId)
}

function getStorageBucket(bucketName) {
  const storage = getStorage(getAdminApp())
  return bucketName ? storage.bucket(bucketName) : storage.bucket()
}

function getAdminAuthClient() {
  return getAuth(getAdminApp())
}

function getAllowedEmailSet(environmentVariableName) {
  return new Set(
    String(process.env[environmentVariableName] ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

function getAllowedAdminEmails() {
  return getAllowedEmailSet('ADMIN_ALLOWED_EMAILS')
}

function getAllowedOwnerEmails() {
  return getAllowedEmailSet('ADMIN_OWNER_EMAILS')
}

function isUsingAuthEmulator() {
  // Require both signals so a stray FIREBASE_AUTH_EMULATOR_HOST left set in a
  // deployed environment can't alone grant every signed-in user admin access.
  // FUNCTIONS_EMULATOR is set automatically by the Firebase emulator runtime
  // and is never present in deployed Cloud Functions.
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) && normalizeBoolean(process.env.FUNCTIONS_EMULATOR)
}

async function requireAdminUser(request) {
  const authHeader = String(request.headers.authorization ?? '').trim()

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    throw new HttpError(401, 'A Firebase ID token is required to access admin write endpoints.')
  }

  const idToken = authHeader.slice(7).trim()

  if (!idToken) {
    throw new HttpError(401, 'A Firebase ID token is required to access admin write endpoints.')
  }

  let decodedToken

  try {
    decodedToken = await getAdminAuthClient().verifyIdToken(idToken)
  } catch {
    throw new HttpError(401, 'The Firebase ID token could not be verified.')
  }

  const email = String(decodedToken.email ?? '').trim().toLowerCase()
  const allowedAdminEmails = getAllowedAdminEmails()
  const hasAdminClaim = decodedToken.cmsAdmin === true
  const allowedByEmail = email && allowedAdminEmails.has(email)
  const allowedInEmulator = isUsingAuthEmulator() && Boolean(email)

  if (!hasAdminClaim && !allowedByEmail && !allowedInEmulator) {
    throw new HttpError(
      403,
      'This Firebase user is not allowed to edit content. Add the email to ADMIN_ALLOWED_EMAILS or grant cmsAdmin=true.',
    )
  }

  return {
    uid: decodedToken.uid,
    email,
    claims: decodedToken,
  }
}

async function requireOwnerUser(request) {
  const adminUser = await requireAdminUser(request)
  const ownerEmails = getAllowedOwnerEmails()
  const hasOwnerClaim = adminUser.claims.cmsOwner === true
  const allowedByOwnerEmail = adminUser.email && ownerEmails.has(adminUser.email)
  const allowedInEmulator = isUsingAuthEmulator() && Boolean(adminUser.email)

  if (!hasOwnerClaim && !allowedByOwnerEmail && !allowedInEmulator) {
    throw new HttpError(
      403,
      'This Firebase user is not allowed to run owner-only recovery operations. Add the email to ADMIN_OWNER_EMAILS or grant cmsOwner=true.',
    )
  }

  return {
    ...adminUser,
    owner: true,
  }
}

function getServerTimestamp() {
  return FieldValue.serverTimestamp()
}

function hasExpectedUpdatedAt(value) {
  return value !== null && value !== undefined && value !== ''
}

function toEpochMillis(value) {
  if (value && typeof value.toMillis === 'function') {
    const millis = value.toMillis()
    return Number.isFinite(millis) ? millis : null
  }

  if (value instanceof Date) {
    const millis = value.getTime()
    return Number.isFinite(millis) ? millis : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string' && value.trim()) {
    const millis = Number(value)
    return Number.isFinite(millis) ? millis : null
  }

  if (value && typeof value === 'object') {
    const seconds = value.seconds ?? value._seconds
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0

    if (Number.isFinite(Number(seconds)) && Number.isFinite(Number(nanoseconds))) {
      return Number(seconds) * 1000 + Math.floor(Number(nanoseconds) / 1000000)
    }
  }

  return null
}

function assertExpectedUpdatedAtMatches(actualUpdatedAt, expectedUpdatedAt, createConflictError) {
  if (!hasExpectedUpdatedAt(expectedUpdatedAt)) {
    return
  }

  const actualMillis = toEpochMillis(actualUpdatedAt)
  const expectedMillis = toEpochMillis(expectedUpdatedAt)

  if (actualMillis === null || expectedMillis === null || Number(actualMillis) !== Number(expectedMillis)) {
    throw createConflictError()
  }
}

function isFirestoreUnavailableError(error) {
  const message = String(error?.message ?? '')
  const code = String(error?.code ?? '')

  return (
    /database\s+(\(default\)|[a-z0-9-]+)\s+does\s+not\s+exist/i.test(message) ||
    /create the firestore database/i.test(message) ||
    /create.*cloud datastore or cloud firestore database/i.test(message) ||
    /cloud firestore api has not been used/i.test(message) ||
    /service.*firestore\.googleapis\.com/i.test(message) ||
    /firestore.*disabled/i.test(message) ||
    code === '5' ||
    code === '5 NOT_FOUND' ||
    code === 'NOT_FOUND'
  )
}

exports.HttpError = HttpError
exports.getDb = getDb
exports.getFirestoreDatabaseId = getFirestoreDatabaseId
exports.getLiveFirestoreDatabaseId = getLiveFirestoreDatabaseId
exports.getStagingFirestoreDatabaseId = getStagingFirestoreDatabaseId
exports.getStorageBucket = getStorageBucket
exports.getServerTimestamp = getServerTimestamp
exports.hasExpectedUpdatedAt = hasExpectedUpdatedAt
exports.isDefaultFirestoreDatabaseId = isDefaultFirestoreDatabaseId
exports.isFirestoreUnavailableError = isFirestoreUnavailableError
exports.isStagingRuntime = isStagingRuntime
exports.requireAdminUser = requireAdminUser
exports.requireOwnerUser = requireOwnerUser
exports.runWithRuntimeContext = runWithRuntimeContext
exports.assertExpectedUpdatedAtMatches = assertExpectedUpdatedAtMatches
exports.toEpochMillis = toEpochMillis
