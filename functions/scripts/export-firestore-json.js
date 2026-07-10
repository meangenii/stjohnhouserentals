const fs = require('fs')
const path = require('path')
const { getDb } = require('../src/firebaseAdmin')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('../src/firebaseCliCredentialBootstrap')
const { BACKED_UP_COLLECTIONS } = require('./firestoreBackupCollections')
const {
  formatFirebaseDoctorReport,
  hasBlockingFirebaseIssues,
  runFirebaseDoctor,
} = require('../../scripts/firebaseProjectChecks.cjs')

function resolveProjectId() {
  if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) {
    return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  }

  const firebasercPath = path.resolve(__dirname, '..', '..', '.firebaserc')

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

function parseArgs(argv) {
  return argv.reduce((options, arg) => {
    const [key, value] = arg.split('=')

    if (key === '--out' && value) {
      return { ...options, outDir: value }
    }

    return options
  }, {})
}

function serializeFirestoreValue(value) {
  if (value && typeof value.toDate === 'function') {
    return { __timestamp__: value.toDate().toISOString() }
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, serializeFirestoreValue(entryValue)]),
    )
  }

  return value
}

async function exportCollection(db, collectionName) {
  const snapshot = await db.collection(collectionName).get()
  const documents = snapshot.docs.map((doc) => ({
    id: doc.id,
    data: serializeFirestoreValue(doc.data()),
  }))

  return documents
}

function defaultExportDir(timestamp = new Date().toISOString().replace(/[:.]/g, '-')) {
  return path.resolve(__dirname, '..', '..', 'backups', 'firestore', timestamp)
}

async function exportToDirectory(db, outDir) {
  fs.mkdirSync(outDir, { recursive: true })

  const summary = {}

  for (const collectionName of BACKED_UP_COLLECTIONS) {
    const documents = await exportCollection(db, collectionName)
    fs.writeFileSync(path.join(outDir, `${collectionName}.json`), `${JSON.stringify(documents, null, 2)}\n`, 'utf8')
    summary[collectionName] = documents.length
  }

  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        projectId: process.env.GCLOUD_PROJECT || '',
        collections: summary,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return summary
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2))
  const projectId = resolveProjectId()
  primeApplicationDefaultCredentialsFromFirebaseCli()
  const doctorReport = await runFirebaseDoctor({ rootDir: path.resolve(__dirname, '..', '..') })

  if (hasBlockingFirebaseIssues(doctorReport)) {
    process.stderr.write(`${formatFirebaseDoctorReport(doctorReport)}\n`)
    process.exitCode = 1
    return
  }

  if (projectId) {
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || projectId
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || projectId
  }

  const resolvedOutDir = outDir ? path.resolve(__dirname, '..', '..', outDir) : defaultExportDir()
  const db = getDb()
  const summary = await exportToDirectory(db, resolvedOutDir)

  process.stdout.write(
    `${JSON.stringify(
      {
        outDir: resolvedOutDir,
        projectId: process.env.GCLOUD_PROJECT || '',
        collections: summary,
      },
      null,
      2,
    )}\n`,
  )
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Firestore JSON export failed.'}\n`)
    process.exitCode = 1
  })
}

module.exports = {
  defaultExportDir,
  exportToDirectory,
}
