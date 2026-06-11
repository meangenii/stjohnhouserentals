const { getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('./firebaseCliCredentialBootstrap')

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

function getDb() {
  return getFirestore(getAdminApp())
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
    /database\s+\(default\)\s+does\s+not\s+exist/i.test(message) ||
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
exports.getStorageBucket = getStorageBucket
exports.getServerTimestamp = getServerTimestamp
exports.isFirestoreUnavailableError = isFirestoreUnavailableError
exports.requireAdminUser = requireAdminUser
