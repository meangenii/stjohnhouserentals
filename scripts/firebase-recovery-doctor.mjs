import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { parseArgs, printJson, resolveProjectId } from './firestore-pitr-utils.mjs'

function resolveCliCommand(baseName) {
  return process.platform === 'win32' ? `${baseName}.cmd` : baseName
}

function runCapture(command, args, { env = {}, timeout = 20000 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
    },
    timeout,
  })

  return {
    ok: !result.error && result.status === 0,
    status: typeof result.status === 'number' ? result.status : null,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
    error: result.error instanceof Error ? result.error.message : '',
  }
}

function usage(message = '') {
  if (message) {
    process.stderr.write(`${message}\n\n`)
  }

  process.stderr.write(
    'Usage:\n' +
      '  npm run firebase:doctor:recovery -- [--project=my-project] [--database=(default)] [--uri=gs://bucket/path]\n',
  )
  process.exit(message ? 1 : 0)
}

function parseBucketUri(uri) {
  const trimmed = String(uri ?? '').trim()

  if (!trimmed) {
    return ''
  }

  const match = trimmed.match(/^gs:\/\/([^/]+)/i)
  return match ? `gs://${match[1]}` : ''
}

function addCheck(checks, name, status, summary, details = []) {
  checks.push({ name, status, summary, details })
}

const options = parseArgs(process.argv.slice(2))

if (options.help || options.h) {
  usage()
}

const projectId = String(options.project ?? resolveProjectId()).trim()
const database = String(options.database ?? '(default)').trim() || '(default)'
const managedExportUri = String(options.uri ?? '').trim()
const bucketUri = parseBucketUri(managedExportUri)
const checks = []

if (!projectId) {
  addCheck(checks, 'Target project', 'error', 'No Firebase project id was found.', [
    'Set a default project in .firebaserc or pass --project.',
  ])
  printJson({ projectId: '', database, managedExportUri: managedExportUri || null, checks })
  process.exit(1)
}

const gcloudVersion = runCapture(resolveCliCommand('gcloud'), ['version', '--format=json'])

if (!gcloudVersion.ok) {
  addCheck(checks, 'gcloud CLI', 'error', 'Google Cloud CLI is unavailable.', [
    gcloudVersion.error || gcloudVersion.stderr || 'Install gcloud and ensure it is on PATH.',
  ])
} else {
  let versionPayload = null

  try {
    versionPayload = JSON.parse(gcloudVersion.stdout)
  } catch {
    versionPayload = null
  }

  addCheck(
    checks,
    'gcloud CLI',
    'ok',
    'Google Cloud CLI is available.',
    versionPayload?.['Google Cloud SDK'] ? [`Google Cloud SDK ${versionPayload['Google Cloud SDK']}`] : [],
  )
}

const activeProjectResult = gcloudVersion.ok
  ? runCapture(resolveCliCommand('gcloud'), ['config', 'get-value', 'project'])
  : { ok: false, stdout: '', stderr: '', error: '' }
const activeProject = activeProjectResult.ok ? activeProjectResult.stdout.trim() : ''

if (!gcloudVersion.ok) {
  addCheck(checks, 'gcloud active project', 'error', 'Skipped because gcloud is unavailable.')
} else if (!activeProject || activeProject === '(unset)') {
  addCheck(checks, 'gcloud active project', 'warning', 'gcloud has no active project configured.', [
    `The recovery scripts still pass --project=${projectId} explicitly, but you should align your gcloud config.`,
  ])
} else if (activeProject !== projectId) {
  addCheck(checks, 'gcloud active project', 'warning', 'gcloud is pointed at a different project.', [
    `Active: ${activeProject}`,
    `Target: ${projectId}`,
  ])
} else {
  addCheck(checks, 'gcloud active project', 'ok', 'gcloud is aligned with the target project.', [projectId])
}

const databaseDescribe = gcloudVersion.ok
  ? runCapture(resolveCliCommand('gcloud'), [
      'firestore',
      'databases',
      'describe',
      `--database=${database}`,
      `--project=${projectId}`,
      '--format=json',
    ])
  : { ok: false, stdout: '', stderr: '', error: '' }

let databaseMetadata = null

if (!gcloudVersion.ok) {
  addCheck(checks, 'Firestore database metadata', 'error', 'Skipped because gcloud is unavailable.')
} else if (!databaseDescribe.ok) {
  addCheck(checks, 'Firestore database metadata', 'error', 'Unable to describe the target Firestore database.', [
    databaseDescribe.error || databaseDescribe.stderr || 'Check IAM, project id, and Firestore database setup.',
  ])
} else {
  try {
    databaseMetadata = JSON.parse(databaseDescribe.stdout)
    addCheck(checks, 'Firestore database metadata', 'ok', 'The target Firestore database is reachable.', [
      String(databaseMetadata.name ?? ''),
    ])
  } catch {
    addCheck(checks, 'Firestore database metadata', 'error', 'gcloud returned unreadable Firestore metadata.')
  }
}

if (!databaseMetadata) {
  addCheck(checks, 'PITR status', 'error', 'Skipped because Firestore metadata could not be read.')
  addCheck(checks, 'earliestVersionTime', 'error', 'Skipped because Firestore metadata could not be read.')
} else {
  const pitrStatus = databaseMetadata.pointInTimeRecoveryEnablement

  if (pitrStatus === 'POINT_IN_TIME_RECOVERY_ENABLED') {
    addCheck(checks, 'PITR status', 'ok', 'Point-in-time recovery is enabled.')
  } else {
    addCheck(checks, 'PITR status', 'error', 'Point-in-time recovery is not enabled.', [
      'Enable PITR before relying on backup:firebase-data or restore:firebase-data.',
    ])
  }

  if (databaseMetadata.earliestVersionTime) {
    addCheck(checks, 'earliestVersionTime', 'ok', 'The database reports the earliest recoverable timestamp.', [
      String(databaseMetadata.earliestVersionTime),
    ])
  } else {
    addCheck(checks, 'earliestVersionTime', 'error', 'The database did not report earliestVersionTime.')
  }
}

if (!managedExportUri) {
  addCheck(checks, 'Managed export bucket', 'warning', 'No managed export URI was provided.', [
    'Pass --uri=gs://bucket/path to verify the export bucket setup.',
  ])
} else if (!bucketUri) {
  addCheck(checks, 'Managed export bucket', 'error', 'The provided URI is not a valid gs:// URI.', [managedExportUri])
} else if (!gcloudVersion.ok) {
  addCheck(checks, 'Managed export bucket', 'error', 'Skipped because gcloud is unavailable.')
} else {
  const bucketDescribe = runCapture(resolveCliCommand('gcloud'), [
    'storage',
    'buckets',
    'describe',
    bucketUri,
    '--format=json',
    `--project=${projectId}`,
  ])

  if (!bucketDescribe.ok) {
    addCheck(checks, 'Managed export bucket', 'error', 'Unable to describe the export bucket.', [
      bucketDescribe.error || bucketDescribe.stderr || `Check that ${bucketUri} exists and is accessible.`,
    ])
  } else {
    addCheck(checks, 'Managed export bucket', 'ok', 'The export bucket is reachable.', [bucketUri])
  }
}

const firebaseVersion = runCapture(resolveCliCommand('firebase'), ['--version'])

if (!firebaseVersion.ok) {
  addCheck(checks, 'Firebase CLI', 'error', 'Firebase CLI is unavailable.', [
    firebaseVersion.error || firebaseVersion.stderr || 'Install firebase-tools and ensure it is on PATH.',
  ])
} else {
  addCheck(checks, 'Firebase CLI', 'ok', 'Firebase CLI is available.', [firebaseVersion.stdout])
}

const firebaseHelpEnv = {
  XDG_CONFIG_HOME: os.tmpdir(),
  HOME: os.tmpdir(),
}
const cloneHelp = firebaseVersion.ok
  ? runCapture(resolveCliCommand('firebase'), ['firestore:databases:clone', '--help'], {
      env: firebaseHelpEnv,
      timeout: 30000,
    })
  : { ok: false, stdout: '', stderr: '', error: '' }

if (!firebaseVersion.ok) {
  addCheck(checks, 'Firestore clone command', 'error', 'Skipped because Firebase CLI is unavailable.')
} else if (!cloneHelp.ok) {
  addCheck(checks, 'Firestore clone command', 'error', 'The Firebase CLI clone command is unavailable.', [
    cloneHelp.error || cloneHelp.stderr || 'Upgrade firebase-tools until firestore:databases:clone is present.',
  ])
} else {
  addCheck(checks, 'Firestore clone command', 'ok', 'The Firebase CLI clone command is available.')
}

const hasErrors = checks.some((check) => check.status === 'error')

printJson({
  projectId,
  database,
  managedExportUri: managedExportUri || null,
  checks,
})

process.exit(hasErrors ? 1 : 0)
