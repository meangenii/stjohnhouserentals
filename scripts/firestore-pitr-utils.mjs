import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(SCRIPT_DIR, '..')

function exitWithMessage(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

export function parseArgs(argv) {
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (!arg.startsWith('--')) {
      continue
    }

    const separatorIndex = arg.indexOf('=')

    if (separatorIndex !== -1) {
      const key = arg.slice(2, separatorIndex)
      const value = arg.slice(separatorIndex + 1)
      options[key] = value
      continue
    }

    const key = arg.slice(2)
    const nextArg = argv[index + 1]

    if (!nextArg || nextArg.startsWith('--')) {
      options[key] = true
      continue
    }

    options[key] = nextArg
    index += 1
  }

  return options
}

export function resolveProjectId(rootDir = ROOT_DIR) {
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

function resolveCliCommand(baseName) {
  if (process.platform === 'win32') {
    return `${baseName}.cmd`
  }

  return baseName
}

function formatSpawnFailure(commandName, error) {
  if (error?.code === 'ENOENT') {
    return `${commandName} is not installed or is not on PATH.`
  }

  return error instanceof Error ? error.message : `Failed to run ${commandName}.`
}

function runCommand(command, args, { captureOutput = false } = {}) {
  const result = spawnSync(command, args, {
    stdio: captureOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: false,
  })

  if (result.error) {
    exitWithMessage(formatSpawnFailure(command, result.error))
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    if (captureOutput && result.stderr) {
      process.stderr.write(result.stderr)
    }

    process.exit(result.status)
  }

  return result
}

export function runGcloud(args, options = {}) {
  return runCommand(resolveCliCommand('gcloud'), args, options)
}

export function runFirebase(args, options = {}) {
  return runCommand(resolveCliCommand('firebase'), args, options)
}

export function describeFirestoreDatabase({ projectId, database = '(default)' }) {
  const result = runGcloud(
    ['firestore', 'databases', 'describe', `--database=${database}`, `--project=${projectId}`, '--format=json'],
    { captureOutput: true },
  )

  try {
    return JSON.parse(result.stdout)
  } catch {
    exitWithMessage('Unable to parse Firestore database metadata from gcloud.')
  }
}

export function isPitrEnabled(databaseMetadata) {
  return databaseMetadata?.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED'
}

export function splitCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function truncateToMinute(input) {
  const date = new Date(input)
  date.setUTCSeconds(0, 0)
  return date
}

export function ceilToMinute(input) {
  const date = new Date(input)
  const truncated = truncateToMinute(date)

  if (truncated.getTime() === date.getTime()) {
    return truncated
  }

  truncated.setUTCMinutes(truncated.getUTCMinutes() + 1)
  return truncated
}

export function formatSnapshotTime(input) {
  return truncateToMinute(input).toISOString()
}

export function defaultSnapshotTime() {
  return formatSnapshotTime(Date.now() - 60_000)
}

export function normalizeSnapshotTime(value) {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    exitWithMessage(`Invalid snapshot time: ${value}`)
  }

  return formatSnapshotTime(parsedDate)
}

export function validateSnapshotTime({ snapshotTime, earliestVersionTime }) {
  if (!earliestVersionTime) {
    exitWithMessage('Firestore did not return earliestVersionTime for this database.')
  }

  const requestedSnapshot = new Date(snapshotTime)
  const earliestAllowedSnapshot = ceilToMinute(earliestVersionTime)

  if (requestedSnapshot.getTime() < earliestAllowedSnapshot.getTime()) {
    exitWithMessage(
      `Snapshot time ${snapshotTime} is older than the earliest recoverable minute for this database. ` +
        `Use ${earliestAllowedSnapshot.toISOString()} or later.`,
    )
  }

  const latestStableSnapshot = truncateToMinute(Date.now() - 60_000)

  if (requestedSnapshot.getTime() > latestStableSnapshot.getTime()) {
    exitWithMessage(
      `Snapshot time ${snapshotTime} is newer than the latest stable recoverable minute. ` +
        `Use ${latestStableSnapshot.toISOString()} or earlier.`,
    )
  }
}

export function appendSnapshotSuffix(uri, snapshotTime) {
  const normalizedUri = String(uri ?? '').trim().replace(/\/+$/, '')
  const slug = snapshotTime.replace(/[:.]/g, '-')
  return `${normalizedUri}/snapshot-${slug}`
}

export function databaseResourceName(projectId, databaseId) {
  return `projects/${projectId}/databases/${databaseId}`
}

export function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}
