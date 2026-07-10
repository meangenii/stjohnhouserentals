import {
  databaseResourceName,
  defaultSnapshotTime,
  describeFirestoreDatabase,
  isPitrEnabled,
  normalizeSnapshotTime,
  parseArgs,
  printJson,
  resolveProjectId,
  runFirebase,
  validateSnapshotTime,
} from './firestore-pitr-utils.mjs'

function exitWithUsage(message) {
  if (message) {
    process.stderr.write(`${message}\n\n`)
  }

  process.stderr.write(
    'Usage:\n' +
      '  npm run restore:firebase-data -- --clone-to=new-database-id [--source-database=(default)] [--snapshot-time=RFC3339]\n' +
      '\n' +
      'Restore is clone-first recovery. Use npm run import:firebase-data for an explicit managed import into an existing database.\n',
  )
  process.exit(1)
}

const options = parseArgs(process.argv.slice(2))
const cloneTo = String(options['clone-to'] ?? '').trim()

if (options.help || options.h) {
  exitWithUsage('')
}

if (!cloneTo) {
  exitWithUsage('A clone destination database id is required.')
}

const projectId = String(options.project ?? resolveProjectId()).trim()

if (!projectId) {
  exitWithUsage('No Firebase project id was found. Set the default project in .firebaserc or pass --project.')
}

const sourceDatabase = String(options['source-database'] ?? '(default)').trim() || '(default)'

if (cloneTo === sourceDatabase) {
  exitWithUsage('The clone destination must be a new database id, not the same database you are cloning from.')
}

const databaseMetadata = describeFirestoreDatabase({ projectId, database: sourceDatabase })

if (!isPitrEnabled(databaseMetadata)) {
  exitWithUsage(`PITR is disabled for ${sourceDatabase}. Enable PITR before using clone-based recovery.`)
}

const snapshotTime = normalizeSnapshotTime(options['snapshot-time'] || defaultSnapshotTime())
validateSnapshotTime({ snapshotTime, earliestVersionTime: databaseMetadata.earliestVersionTime })

const sourceDatabaseName = databaseResourceName(projectId, sourceDatabase)
const destinationDatabaseName = databaseResourceName(projectId, cloneTo)

runFirebase([
  'firestore:databases:clone',
  sourceDatabaseName,
  destinationDatabaseName,
  '--snapshot-time',
  snapshotTime,
])

printJson({
  mode: 'pitr-clone',
  projectId,
  sourceDatabase,
  destinationDatabase: cloneTo,
  snapshotTime,
})
