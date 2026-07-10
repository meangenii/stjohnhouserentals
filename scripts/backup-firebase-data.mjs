import {
  appendSnapshotSuffix,
  defaultSnapshotTime,
  describeFirestoreDatabase,
  isPitrEnabled,
  normalizeSnapshotTime,
  parseArgs,
  printJson,
  resolveProjectId,
  runGcloud,
  splitCsv,
  validateSnapshotTime,
} from './firestore-pitr-utils.mjs'

function exitWithUsage(message) {
  if (message) {
    process.stderr.write(`${message}\n\n`)
  }

  process.stderr.write(
    'Usage: npm run backup:firebase-data -- --uri=gs://bucket/path [--database=(default)] ' +
      '[--snapshot-time=RFC3339] [--collection-ids=a,b] [--enable-pitr] [--exact-uri] [--async]\n',
  )
  process.exit(1)
}

const options = parseArgs(process.argv.slice(2))

if (options.help || options.h) {
  exitWithUsage('')
}

const outputUriBase = String(options.uri ?? options.out ?? '').trim()

if (!outputUriBase) {
  exitWithUsage('A managed export destination is required.')
}

const projectId = String(options.project ?? resolveProjectId()).trim()

if (!projectId) {
  exitWithUsage('No Firebase project id was found. Set the default project in .firebaserc or pass --project.')
}

const database = String(options.database ?? '(default)').trim() || '(default)'
let databaseMetadata = describeFirestoreDatabase({ projectId, database })

if (!isPitrEnabled(databaseMetadata)) {
  if (!options['enable-pitr']) {
    exitWithUsage(
      `PITR is disabled for ${database}. Re-run with --enable-pitr to enable it before taking managed exports.`,
    )
  }

  runGcloud(['firestore', 'databases', 'update', `--database=${database}`, `--project=${projectId}`, '--enable-pitr'])
  databaseMetadata = describeFirestoreDatabase({ projectId, database })
}

const snapshotTime = normalizeSnapshotTime(options['snapshot-time'] || defaultSnapshotTime())
validateSnapshotTime({ snapshotTime, earliestVersionTime: databaseMetadata.earliestVersionTime })

const outputUriPrefix = options['exact-uri'] ? outputUriBase : appendSnapshotSuffix(outputUriBase, snapshotTime)
const collectionIds = splitCsv(options['collection-ids'])
const exportArgs = [
  'firestore',
  'export',
  outputUriPrefix,
  `--database=${database}`,
  `--project=${projectId}`,
  `--snapshot-time=${snapshotTime}`,
  '--format=json',
]

if (collectionIds.length > 0) {
  exportArgs.push(`--collection-ids=${collectionIds.join(',')}`)
}

if (options.async) {
  exportArgs.push('--async')
}

const exportResult = runGcloud(exportArgs, { captureOutput: true })
let operation = null

try {
  operation = JSON.parse(exportResult.stdout)
} catch {
  process.stdout.write(exportResult.stdout)
}

printJson({
  mode: 'pitr-export',
  projectId,
  database,
  pointInTimeRecoveryEnablement: databaseMetadata.pointInTimeRecoveryEnablement || 'POINT_IN_TIME_RECOVERY_UNKNOWN',
  earliestVersionTime: databaseMetadata.earliestVersionTime || null,
  snapshotTime,
  outputUriPrefix,
  operation,
})
