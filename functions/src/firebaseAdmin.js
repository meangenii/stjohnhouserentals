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

function getAllowedAdminEmails() {
  return new Set(
    String(process.env.ADMIN_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

function isUsingAuthEmulator() {
  return Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
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

function getServerTimestamp() {
  return FieldValue.serverTimestamp()
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
exports.isDefaultFirestoreDatabaseId = isDefaultFirestoreDatabaseId
exports.isFirestoreUnavailableError = isFirestoreUnavailableError
exports.isStagingRuntime = isStagingRuntime
exports.requireAdminUser = requireAdminUser
exports.runWithRuntimeContext = runWithRuntimeContext
