import {
  parseArgs,
  printJson,
  resolveProjectId,
  runGcloud,
  splitCsv,
} from './firestore-pitr-utils.mjs'

function exitWithUsage(message) {
  if (message) {
    process.stderr.write(`${message}\n\n`)
  }

  process.stderr.write(
    'Usage:\n' +
      '  npm run import:firebase-data -- --import-uri=gs://bucket/path [--database=(default)] [--collection-ids=a,b] [--yes] [--async]\n' +
      '\n' +
      'This command performs an explicit managed Firestore import into an existing database.\n',
  )
  process.exit(1)
}

const options = parseArgs(process.argv.slice(2))

if (options.help || options.h) {
  exitWithUsage('')
}

const importUri = String(options['import-uri'] ?? '').trim()

if (!importUri) {
  exitWithUsage('A managed import URI is required.')
}

const projectId = String(options.project ?? resolveProjectId()).trim()

if (!projectId) {
  exitWithUsage('No Firebase project id was found. Set the default project in .firebaserc or pass --project.')
}

const database = String(options.database ?? '(default)').trim() || '(default)'

if (database === '(default)' && !options.yes) {
  exitWithUsage(
    'Importing into the live default database requires --yes so the command cannot overwrite current documents by accident.',
  )
}

const collectionIds = splitCsv(options['collection-ids'])
const importArgs = ['firestore', 'import', importUri, `--database=${database}`, `--project=${projectId}`, '--format=json']

if (collectionIds.length > 0) {
  importArgs.push(`--collection-ids=${collectionIds.join(',')}`)
}

if (options.async) {
  importArgs.push('--async')
}

const importResult = runGcloud(importArgs, { captureOutput: true })
let operation = null

try {
  operation = JSON.parse(importResult.stdout)
} catch {
  process.stdout.write(importResult.stdout)
}

printJson({
  mode: 'managed-import',
  projectId,
  database,
  importUri,
  collectionIds,
  operation,
})
