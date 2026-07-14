const fs = require('fs')
const path = require('path')
const { Timestamp } = require('firebase-admin/firestore')
const { getDb } = require('../src/firebaseAdmin')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('../src/firebaseCliCredentialBootstrap')
const { BACKED_UP_COLLECTIONS } = require('./firestoreBackupCollections')
const { exportToDirectory } = require('./export-firestore-json')
const {
  formatFirebaseDoctorReport,
  hasBlockingFirebaseIssues,
  runFirebaseDoctor,
} = require('../../scripts/firebaseProjectChecks.cjs')

const BATCH_WRITE_LIMIT = 500
const SHRINK_GUARD_RATIO = 0.5

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
    if (arg === '--replace') {
      return { ...options, replace: true }
    }

    if (arg === '--yes') {
      return { ...options, confirmed: true }
    }

    if (arg === '--force') {
      return { ...options, force: true }
    }

    if (arg === '--dry-run') {
      return { ...options, dryRun: true }
    }

    const equalsIndex = arg.indexOf('=')
    const key = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex)
    const value = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1)

    if (key === '--dir' && value) {
      return { ...options, dir: value }
    }

    return options
  }, {})
}

function isTargetingEmulator() {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST)
}

function readManifest(importDir) {
  const manifestPath = path.join(importDir, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

function deserializeFirestoreValue(value) {
  if (value && typeof value === 'object' && typeof value.__timestamp__ === 'string') {
    return Timestamp.fromDate(new Date(value.__timestamp__))
  }

  if (Array.isArray(value)) {
    return value.map(deserializeFirestoreValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, deserializeFirestoreValue(entryValue)]),
    )
  }

  return value
}

async function writeInBatches(db, collectionRef, documents, { merge = false } = {}) {
  for (let offset = 0; offset < documents.length; offset += BATCH_WRITE_LIMIT) {
    const batch = db.batch()
    const chunk = documents.slice(offset, offset + BATCH_WRITE_LIMIT)

    for (const document of chunk) {
      batch.set(collectionRef.doc(document.id), deserializeFirestoreValue(document.data), merge ? { merge: true } : {})
    }

    await batch.commit()
  }
}

async function deleteRefsInBatches(db, refs) {
  for (let offset = 0; offset < refs.length; offset += BATCH_WRITE_LIMIT) {
    const batch = db.batch()
    const chunk = refs.slice(offset, offset + BATCH_WRITE_LIMIT)

    for (const ref of chunk) {
      batch.delete(ref)
    }

    await batch.commit()
  }
}

async function planCollectionImport(db, collectionName, importDir, { replace, manifest }) {
  const filePath = path.join(importDir, `${collectionName}.json`)

  if (!fs.existsSync(filePath)) {
    return { skipped: true }
  }

  const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const manifestCount = manifest?.collections?.[collectionName]
  const manifestMismatch = replace && typeof manifestCount === 'number' && manifestCount !== documents.length

  const collectionRef = db.collection(collectionName)
  const existingRefs = await collectionRef.listDocuments()
  const existingIds = new Set(existingRefs.map((ref) => ref.id))
  const backupIds = new Set(documents.map((document) => document.id))

  const created = [...backupIds].filter((id) => !existingIds.has(id)).length
  const updated = documents.length - created

  let toDeleteRefs = []
  let shrinkGuardTriggered = false

  if (replace) {
    toDeleteRefs = existingRefs.filter((ref) => !backupIds.has(ref.id))
    const shrinkRatio = existingRefs.length === 0 ? 0 : toDeleteRefs.length / existingRefs.length
    shrinkGuardTriggered = toDeleteRefs.length > 0 && shrinkRatio > SHRINK_GUARD_RATIO
  }

  return {
    skipped: false,
    collectionRef,
    documents,
    manifestCount,
    manifestMismatch,
    created,
    updated,
    toDeleteRefs,
    shrinkGuardTriggered,
  }
}

async function applyCollectionImport(db, plan, { replace, force }) {
  if (plan.skipped) {
    return { restored: 0, deleted: 0, deleteSkipped: false, skipped: true }
  }

  if (plan.manifestMismatch && !force) {
    throw new Error(
      `Refusing to import into "${plan.collectionRef.id}": manifest.json recorded ${plan.manifestCount} ` +
        `document(s) but the JSON file has ${plan.documents.length}. The export looks corrupted or ` +
        'incomplete. Re-run with --force to override.',
    )
  }

  // Outside --replace, imports are meant to be additive/safe: merge fields from the
  // backup into existing docs instead of overwriting them wholesale, so fields added
  // to the live data after the backup was taken aren't silently destroyed.
  await writeInBatches(db, plan.collectionRef, plan.documents, { merge: !replace })

  let deleted = 0
  let deleteSkipped = false

  if (replace) {
    if (plan.shrinkGuardTriggered && !force) {
      deleteSkipped = true
    } else {
      await deleteRefsInBatches(db, plan.toDeleteRefs)
      deleted = plan.toDeleteRefs.length
    }
  }

  return { restored: plan.documents.length, deleted, deleteSkipped, skipped: false }
}

function planToPreview(plan, replace) {
  if (plan.skipped) {
    return { skipped: true }
  }

  return {
    wouldCreate: plan.created,
    wouldUpdate: plan.updated,
    wouldDelete: replace ? plan.toDeleteRefs.length : 0,
    manifestMismatch: plan.manifestMismatch,
    deleteWouldBeSkippedByShrinkGuard: replace ? plan.shrinkGuardTriggered : false,
  }
}

async function main() {
  const { dir, replace = false, confirmed = false, force = false, dryRun = false } = parseArgs(process.argv.slice(2))

  if (!dir) {
    process.stderr.write(
      'Usage: node ./scripts/import-firestore-json.js --dir=<path/to/export> [--replace] [--yes] [--force] [--dry-run]\n',
    )
    process.exitCode = 1
    return
  }

  const importDir = path.resolve(path.resolve(__dirname, '..', '..'), dir)

  if (!fs.existsSync(importDir)) {
    process.stderr.write(`JSON export directory not found: ${importDir}\n`)
    process.exitCode = 1
    return
  }

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

  if (replace && !dryRun && !isTargetingEmulator() && !confirmed) {
    process.stderr.write(
      `--replace targets the LIVE Firestore project "${projectId || '(unknown)'}", not the emulator.\n` +
        'This permanently deletes any documents in each collection that are not present in the JSON export.\n' +
        `Re-run with --yes if you intend to do this against "${projectId || '(unknown)'}".\n`,
    )
    process.exitCode = 1
    return
  }

  const manifest = readManifest(importDir)

  if (replace && !dryRun && !manifest && !force) {
    process.stderr.write(
      `Refusing --replace: no valid manifest.json found in ${importDir}.\n` +
        'The manifest records how many documents each collection had at export time, and is used to ' +
        "detect a truncated or tampered-with JSON export before deleting anything. Re-run with --force if this " +
        "export wasn't produced by export-firestore-json.js and you still want to proceed.\n",
    )
    process.exitCode = 1
    return
  }

  const db = getDb()
  const plans = {}

  for (const collectionName of BACKED_UP_COLLECTIONS) {
    plans[collectionName] = await planCollectionImport(db, collectionName, importDir, { replace, manifest })
  }

  if (dryRun) {
    const preview = {}

    for (const [collectionName, plan] of Object.entries(plans)) {
      preview[collectionName] = planToPreview(plan, replace)
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          importDir,
          projectId: process.env.GCLOUD_PROJECT || '',
          replace,
          dryRun: true,
          manifestFound: Boolean(manifest),
          collections: preview,
        },
        null,
        2,
      )}\n`,
    )

    const wouldNeedForce =
      (replace && !manifest) ||
      Object.values(preview).some((result) => result.manifestMismatch || result.deleteWouldBeSkippedByShrinkGuard)

    if (wouldNeedForce) {
      process.stderr.write(
        '\nNote: the real run would be blocked (missing/mismatched manifest.json, or a collection where ' +
          'deleting would remove more than half of its documents) unless --force is also passed.\n',
      )
    }

    return
  }

  if (replace) {
    const safetyExportDir = path.join(importDir, '..', `pre-import-safety-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    const resolvedSafetyExportDir = path.resolve(safetyExportDir)
    await exportToDirectory(db, resolvedSafetyExportDir)
    process.stdout.write(
      `Took an automatic safety JSON export of the current state before importing: ${resolvedSafetyExportDir}\n`,
    )
  }

  const summary = {}

  for (const collectionName of BACKED_UP_COLLECTIONS) {
    summary[collectionName] = await applyCollectionImport(db, plans[collectionName], { replace, force })
  }

  const shrinkGuardTriggered = Object.values(summary).some((result) => result.deleteSkipped)

  process.stdout.write(
    `${JSON.stringify(
      {
        importDir,
        projectId: process.env.GCLOUD_PROJECT || '',
        replace,
        collections: summary,
      },
      null,
      2,
    )}\n`,
  )

  if (shrinkGuardTriggered) {
    process.stderr.write(
      '\nWarning: for one or more collections above ("deleteSkipped": true), the JSON export would have deleted ' +
        'more than half of the documents currently in that collection, so the delete step was skipped and ' +
        'those extra documents were left in place. Verify the export is the one you intend to import, then ' +
        're-run with --force to complete the deletion.\n',
    )
    process.exitCode = 1
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Firestore JSON import failed.'}\n`)
  process.exitCode = 1
})
