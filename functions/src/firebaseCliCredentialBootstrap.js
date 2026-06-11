const fs = require('fs')
const os = require('os')
const path = require('path')

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

function getFirebaseToolsConfigPaths() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  const appDataDir = process.env.APPDATA || ''

  return [
    path.resolve(homeDir, '.config', 'configstore', 'firebase-tools.json'),
    path.resolve(appDataDir, 'configstore', 'firebase-tools.json'),
  ].filter(Boolean)
}

function readFirebaseToolsConfig() {
  const configPath = getFirebaseToolsConfigPaths().find((candidatePath) => fs.existsSync(candidatePath))

  if (!configPath) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}

function primeApplicationDefaultCredentialsFromFirebaseCli() {
  const existingCredentialsPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim()

  if (existingCredentialsPath) {
    return existingCredentialsPath
  }

  const firebaseToolsConfig = readFirebaseToolsConfig()
  const refreshTokenValue = String(firebaseToolsConfig?.tokens?.refresh_token ?? '').trim()

  if (!refreshTokenValue) {
    return ''
  }

  const credentialPayload = {
    type: 'authorized_user',
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refreshTokenValue,
  }

  const credentialPath = path.resolve(os.tmpdir(), 'genericcms-firebase-cli-adc.json')
  fs.writeFileSync(credentialPath, `${JSON.stringify(credentialPayload, null, 2)}\n`, 'utf8')
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath
  return credentialPath
}

module.exports = {
  primeApplicationDefaultCredentialsFromFirebaseCli,
}
