const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const env = {}
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)

  lines.forEach((line) => {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return
    }

    const separatorIndex = trimmedLine.indexOf('=')

    if (separatorIndex === -1) {
      return
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue

    env[key] = value
  })

  return env
}

function resolveProjectId(rootDir = path.resolve(__dirname, '..')) {
  const firebasercPath = path.join(rootDir, '.firebaserc')

  if (!fs.existsSync(firebasercPath)) {
    return ''
  }

  try {
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'))
    return String(firebaserc?.projects?.default ?? '').trim()
  } catch {
    return ''
  }
}

function loadFirebaseWebEnv(rootDir = path.resolve(__dirname, '..')) {
  return parseEnvFile(path.join(rootDir, '.env'))
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { raw: text }
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  }
}

async function checkFirestoreApi({ projectId, apiKey }) {
  if (!projectId) {
    return {
      name: 'Cloud Firestore API',
      status: 'error',
      summary: 'No Firebase project id was found.',
      details: ['Set a default project in `.firebaserc`.'],
    }
  }

  if (!apiKey) {
    return {
      name: 'Cloud Firestore API',
      status: 'error',
      summary: 'No Firebase web API key was found.',
      details: ['Set `VITE_FIREBASE_API_KEY` in `.env`.'],
    }
  }

  const endpoint = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/__healthcheck?pageSize=1&key=${apiKey}`
  const result = await requestJson(endpoint)
  const error = result.payload?.error ?? {}
  const details = Array.isArray(error.details) ? error.details : []
  const serviceDisabled = details.find((entry) => entry?.metadata?.service === 'firestore.googleapis.com')
  const message = String(error.message ?? '')

  if (result.ok) {
    return {
      name: 'Cloud Firestore API',
      status: 'ok',
      summary: 'Cloud Firestore API is reachable.',
      details: [],
    }
  }

  if (serviceDisabled?.metadata?.activationUrl) {
    return {
      name: 'Cloud Firestore API',
      status: 'error',
      summary: 'Cloud Firestore API is disabled for this project.',
      details: [serviceDisabled.metadata.activationUrl],
    }
  }

  if (result.status === 404 && /does not exist|not found/i.test(message)) {
    return {
      name: 'Cloud Firestore API',
      status: 'error',
      summary: 'The default Firestore database has not been created yet.',
      details: ['Create the Firestore database in the Firebase console, then rerun the seed.'],
    }
  }

  if (result.status === 403 && /permission/i.test(message)) {
    return {
      name: 'Cloud Firestore API',
      status: 'ok',
      summary: 'Cloud Firestore API is reachable.',
      details: ['The unauthenticated check is blocked by Firestore rules, which is expected.'],
    }
  }

  return {
    name: 'Cloud Firestore API',
    status: 'warning',
    summary: `Unexpected Firestore API response: ${message || `HTTP ${result.status}`}`,
    details: [],
  }
}

async function checkEmailPasswordAuth({ apiKey }) {
  if (!apiKey) {
    return {
      name: 'Firebase Auth Email/Password',
      status: 'error',
      summary: 'No Firebase web API key was found.',
      details: ['Set `VITE_FIREBASE_API_KEY` in `.env`.'],
    }
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
  const result = await requestJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'firebase-doctor@example.invalid',
      password: 'firebase-doctor',
      returnSecureToken: true,
    }),
  })

  const message = String(result.payload?.error?.message ?? '')

  if (result.ok || ['EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'USER_DISABLED'].includes(message)) {
    return {
      name: 'Firebase Auth Email/Password',
      status: 'ok',
      summary: 'Firebase Auth email/password appears to be configured.',
      details: [],
    }
  }

  if (message === 'CONFIGURATION_NOT_FOUND') {
    return {
      name: 'Firebase Auth Email/Password',
      status: 'error',
      summary: 'Firebase Auth is not configured for this project.',
      details: ['Open Firebase Authentication and enable Email/Password sign-in.'],
    }
  }

  if (message === 'OPERATION_NOT_ALLOWED') {
    return {
      name: 'Firebase Auth Email/Password',
      status: 'error',
      summary: 'Firebase Auth exists, but Email/Password sign-in is disabled.',
      details: ['Enable the Email/Password provider in Firebase Authentication.'],
    }
  }

  return {
    name: 'Firebase Auth Email/Password',
    status: 'warning',
    summary: `Unexpected Auth response: ${message || `HTTP ${result.status}`}`,
    details: [],
  }
}

async function checkAdminSdkCredentials() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return {
      name: 'Admin SDK credentials',
      status: 'ok',
      summary: 'Firestore emulator is configured.',
      details: [],
    }
  }

  const serviceAccountPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim()

  if (serviceAccountPath) {
    if (fs.existsSync(serviceAccountPath)) {
      return {
        name: 'Admin SDK credentials',
        status: 'ok',
        summary: 'A `GOOGLE_APPLICATION_CREDENTIALS` file is configured.',
        details: [serviceAccountPath],
      }
    }

    return {
      name: 'Admin SDK credentials',
      status: 'error',
      summary: '`GOOGLE_APPLICATION_CREDENTIALS` points to a missing file.',
      details: [serviceAccountPath],
    }
  }

  try {
    await execFileAsync('gcloud', ['auth', 'application-default', 'print-access-token'])
    return {
      name: 'Admin SDK credentials',
      status: 'ok',
      summary: 'Google application default credentials are available.',
      details: [],
    }
  } catch {
    return {
      name: 'Admin SDK credentials',
      status: 'error',
      summary: 'Google application default credentials are not usable on this machine.',
      details: [
        'Run `gcloud auth application-default login` or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account key.',
      ],
    }
  }
}

async function runFirebaseDoctor({ rootDir = path.resolve(__dirname, '..') } = {}) {
  const env = loadFirebaseWebEnv(rootDir)
  const projectId = resolveProjectId(rootDir) || String(env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
  const apiKey = String(env.VITE_FIREBASE_API_KEY ?? '').trim()
  const checks = await Promise.all([
    checkFirestoreApi({ projectId, apiKey }),
    checkEmailPasswordAuth({ apiKey }),
    checkAdminSdkCredentials(),
  ])

  return {
    projectId,
    checks,
  }
}

function hasBlockingFirebaseIssues(report) {
  return report.checks.some((check) => check.status === 'error')
}

function formatFirebaseDoctorReport(report) {
  const lines = [`Firebase project: ${report.projectId || '(missing)'}`, '']

  report.checks.forEach((check) => {
    lines.push(`${check.status.toUpperCase()}: ${check.name}`)
    lines.push(check.summary)
    check.details.forEach((detail) => lines.push(`- ${detail}`))
    lines.push('')
  })

  return lines.join('\n').trim()
}

module.exports = {
  formatFirebaseDoctorReport,
  hasBlockingFirebaseIssues,
  loadFirebaseWebEnv,
  resolveProjectId,
  runFirebaseDoctor,
}
