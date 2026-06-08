import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getApps, initializeApp } from '../functions/node_modules/firebase-admin/lib/app/index.js'
import { FieldValue, getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js'
import { getStorage } from '../functions/node_modules/firebase-admin/lib/storage/index.js'
import {
  MEDIA_LIBRARY_COLLECTION,
  buildMediaManifest,
  getCanonicalLegacyMediaUrl,
  isLegacyMediaUrl,
  renderMediaManifestModule,
  rewriteStringWithMediaManifest,
  rewriteValueWithMediaManifest,
  slugifyMediaSegment,
} from '../shared/mediaLibrary.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const mediaCatalogFilePath = path.resolve(rootDir, 'shared', 'mediaCatalog.js')

const repoJsonFiles = [
  path.resolve(rootDir, 'public', 'livePropertyCatalog.json'),
  path.resolve(rootDir, 'public', 'livePropertySummaryCatalog.json'),
  path.resolve(rootDir, 'public', 'liveCharterCatalog.json'),
  path.resolve(rootDir, 'src', 'content', 'liveSiteSnapshot.json'),
]

const repoTextFiles = [
  path.resolve(rootDir, 'shared', 'siteContent.js'),
  path.resolve(rootDir, 'shared', 'migratedSnapshotContent.js'),
]

const firebaseToolsConfigPath = path.resolve(process.env.USERPROFILE || process.env.HOME || rootDir, '.config', 'configstore', 'firebase-tools.json')
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const firestoreCollections = {
  siteContent: 'cmsSiteContent',
  structuredPages: 'cmsStructuredPages',
  properties: 'cmsProperties',
  charters: 'cmsCharters',
}

function parseEnvFile(content) {
  return Object.fromEntries(
    String(content ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
      }),
  )
}

async function readOptionalText(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

async function resolveFirebaseConfig() {
  const env = parseEnvFile(await readOptionalText(path.resolve(rootDir, '.env')))
  const firebaserc = JSON.parse(await readFile(path.resolve(rootDir, '.firebaserc'), 'utf8'))
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? firebaserc?.projects?.default ?? '').trim()
  const storageBucket = String(env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() || `${projectId}.firebasestorage.app`

  if (!projectId) {
    throw new Error('Unable to resolve the Firebase project id from .env or .firebaserc.')
  }

  if (!storageBucket) {
    throw new Error('Unable to resolve the Firebase Storage bucket name from .env.')
  }

  return { projectId, storageBucket }
}

function getAdminApp(config) {
  return getApps()[0] ?? initializeApp(config)
}

async function createFirebaseCliCredential() {
  const firebaseToolsConfigText = await readOptionalText(firebaseToolsConfigPath)

  if (!firebaseToolsConfigText) {
    return null
  }

  const firebaseToolsConfig = JSON.parse(firebaseToolsConfigText)
  const refreshTokenValue = String(firebaseToolsConfig?.tokens?.refresh_token ?? '').trim()

  if (!refreshTokenValue) {
    return null
  }

  return {
    type: 'authorized_user',
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refreshTokenValue,
  }
}

async function primeApplicationDefaultCredentialsFromFirebaseCli() {
  if (String(process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '').trim()) {
    return false
  }

  const credentialPayload = await createFirebaseCliCredential()

  if (!credentialPayload) {
    return false
  }

  const credentialPath = path.resolve(tmpdir(), 'genericcms-firebase-cli-adc.json')
  await writeFile(credentialPath, `${JSON.stringify(credentialPayload, null, 2)}\n`, 'utf8')
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath
  return true
}

function createMediaId(canonicalSourceUrl) {
  return `media-${createHash('sha1').update(canonicalSourceUrl).digest('hex').slice(0, 20)}`
}

function stripFirestoreMetadata(record = {}) {
  if (!record || typeof record !== 'object') {
    return {}
  }

  const content = { ...record }
  delete content.updatedAt
  delete content.updatedBy
  return content
}

function createDeepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function collectLegacyMediaMatches(value) {
  return Array.from(
    String(value ?? '').matchAll(
      /https:\/\/static\.(?:[a-z]{3}static\.com|legacy-cdn\.invalid)\/media\/[^\s"'()<>]+|[a-z]{3}:image:\/\/v1\/[^\s"'()<>]+/gi,
    ),
  ).map((match) => match[0])
}

function pathToString(segments = []) {
  return segments.reduce((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`
    }

    if (!result) {
      return String(segment)
    }

    return `${result}.${String(segment)}`
  }, '')
}

function getOwnerPriority(ownerType) {
  switch (ownerType) {
    case 'property':
      return 0
    case 'charter':
      return 1
    case 'page':
      return 2
    case 'site-shell':
      return 3
    default:
      return 4
  }
}

function getFieldPriority(fieldPath) {
  if (fieldPath === 'heroImage' || fieldPath.endsWith('.hero.image')) {
    return 0
  }

  if (fieldPath.startsWith('gallery[') || fieldPath.includes('.gallery[')) {
    return 1
  }

  if (fieldPath.endsWith('.logo')) {
    return 2
  }

  if (fieldPath.endsWith('.image')) {
    return 3
  }

  if (fieldPath.startsWith('imageGallery[') || fieldPath.includes('.imageGallery[')) {
    return 4
  }

  if (fieldPath.toLowerCase().includes('html')) {
    return 6
  }

  return 5
}

function compareCandidates(left, right) {
  const ownerPriorityDifference = getOwnerPriority(left.ownerType) - getOwnerPriority(right.ownerType)

  if (ownerPriorityDifference !== 0) {
    return ownerPriorityDifference
  }

  const fieldPriorityDifference = getFieldPriority(left.fieldPath) - getFieldPriority(right.fieldPath)

  if (fieldPriorityDifference !== 0) {
    return fieldPriorityDifference
  }

  return left.fieldPath.localeCompare(right.fieldPath)
}

function extractFileName(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const match = candidate.match(/\/([^/?#]+)(?:[?#].*)?$/)

  if (!match) {
    return ''
  }

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function getFileExtensionFromContentType(contentType) {
  const candidate = String(contentType ?? '').split(';')[0].trim().toLowerCase()

  switch (candidate) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/gif':
      return 'gif'
    case 'image/svg+xml':
      return 'svg'
    default:
      return ''
  }
}

function getFileExtensionFromValue(value) {
  const fileName = extractFileName(value)
  const extension = path.extname(fileName).replace('.', '').toLowerCase()
  return extension
}

function normalizeExtension(extension) {
  const candidate = String(extension ?? '').replace('.', '').trim().toLowerCase()

  if (!candidate) {
    return ''
  }

  if (candidate === 'jpeg') {
    return 'jpg'
  }

  return candidate
}

function resolveFileExtension(candidate, contentType) {
  return (
    normalizeExtension(getFileExtensionFromValue(candidate.originalUrl)) ||
    normalizeExtension(getFileExtensionFromValue(candidate.title)) ||
    normalizeExtension(getFileExtensionFromValue(candidate.canonicalSourceUrl)) ||
    normalizeExtension(getFileExtensionFromContentType(contentType)) ||
    'jpg'
  )
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function deriveRoleName(candidate) {
  const fieldPath = candidate.fieldPath
  const match = fieldPath.match(/\[(\d+)\]/)
  const index = match ? Number(match[1]) : -1

  if (fieldPath === 'heroImage' || fieldPath.endsWith('.hero.image')) {
    return 'hero'
  }

  if (fieldPath.startsWith('gallery[') || fieldPath.includes('.gallery[')) {
    return `gallery-${padNumber(index + 1)}`
  }

  if (fieldPath.startsWith('imageGallery[') || fieldPath.includes('.imageGallery[')) {
    return `gallery-${padNumber(index + 1)}`
  }

  if (fieldPath.endsWith('.logo')) {
    return 'logo'
  }

  if (fieldPath.endsWith('.map.image')) {
    return 'map'
  }

  if (fieldPath.endsWith('.detailImage')) {
    return 'detail'
  }

  if (fieldPath.endsWith('.story.image')) {
    return 'story'
  }

  if (fieldPath.endsWith('.trust.image')) {
    return 'trust'
  }

  if (fieldPath.endsWith('.discover.image')) {
    return 'discover'
  }

  if (fieldPath.endsWith('.about.image')) {
    return 'about'
  }

  if (fieldPath.endsWith('.intro.image')) {
    return 'intro'
  }

  if (fieldPath.endsWith('.details.image')) {
    return 'details'
  }

  if (fieldPath.endsWith('.image')) {
    return slugifyMediaSegment(fieldPath.split('.').at(-2)) || 'image'
  }

  if (fieldPath.toLowerCase().includes('html')) {
    return `body-${padNumber(candidate.occurrenceIndex + 1)}`
  }

  return slugifyMediaSegment(fieldPath.replace(/\[\d+\]/g, '').replace(/\./g, '-')) || 'image'
}

function buildStoragePath(candidate, extension) {
  const ownerKey = slugifyMediaSegment(candidate.ownerKey || candidate.ownerName || candidate.ownerType) || candidate.ownerType
  const fileStem = `${ownerKey}-${deriveRoleName(candidate)}`
  const normalizedExtension = normalizeExtension(extension) || 'jpg'

  switch (candidate.ownerType) {
    case 'property':
      return `media/properties/${ownerKey}/${fileStem}.${normalizedExtension}`
    case 'charter':
      return `media/charters/${ownerKey}/${fileStem}.${normalizedExtension}`
    case 'page':
      return `media/pages/${ownerKey}/${fileStem}.${normalizedExtension}`
    case 'site-shell':
      return `media/site-shell/${fileStem}.${normalizedExtension}`
    default:
      return `media/misc/${fileStem}.${normalizedExtension}`
  }
}

function buildDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`
}

async function fetchBinary(url) {
  let lastError = null

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Image request failed with status ${response.status} for ${url}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())

      return {
        buffer,
        contentType: String(response.headers.get('content-type') ?? '').trim(),
      }
    } catch (error) {
      lastError = error

      if (attempt < 4) {
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 300)
        })
      }
    }
  }

  throw lastError
}

async function saveBufferToStorage(file, buffer, contentType, metadata) {
  let lastError = null

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      await file.save(buffer, {
        resumable: false,
        contentType,
        metadata,
      })
      return
    } catch (error) {
      lastError = error

      if (attempt < 4) {
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 500)
        })
      }
    }
  }

  throw lastError
}

function buildUsageList(candidates) {
  const uniqueUsages = new Map()

  candidates.forEach((candidate) => {
    const usageKey = `${candidate.ownerType}:${candidate.ownerKey}:${candidate.fieldPath}`

    if (!uniqueUsages.has(usageKey)) {
      uniqueUsages.set(usageKey, {
        ownerType: candidate.ownerType,
        ownerKey: candidate.ownerKey,
        ownerName: candidate.ownerName,
        fieldPath: candidate.fieldPath,
      })
    }
  })

  return Array.from(uniqueUsages.values())
}

function scanValueForLegacyMedia(value, context, candidates, pathSegments = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanValueForLegacyMedia(entry, context, candidates, [...pathSegments, index])
    })
    return
  }

  if (typeof value === 'string') {
    collectLegacyMediaMatches(value).forEach((match, occurrenceIndex) => {
      const canonicalSourceUrl = getCanonicalLegacyMediaUrl(match)

      if (!canonicalSourceUrl) {
        return
      }

      candidates.push({
        ownerType: context.ownerType,
        ownerKey: context.ownerKey,
        ownerName: context.ownerName,
        fieldPath: pathToString(pathSegments),
        originalUrl: match,
        canonicalSourceUrl,
        title: '',
        alt: '',
        occurrenceIndex,
      })
    })
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  if (typeof value.url === 'string') {
    const canonicalSourceUrl = getCanonicalLegacyMediaUrl(value.url)

    if (canonicalSourceUrl) {
      candidates.push({
        ownerType: context.ownerType,
        ownerKey: context.ownerKey,
        ownerName: context.ownerName,
        fieldPath: pathToString(pathSegments),
        originalUrl: String(value.url).trim(),
        canonicalSourceUrl,
        title: String(value.title ?? '').trim(),
        alt: String(value.alt ?? '').trim(),
        occurrenceIndex: 0,
      })
      return
    }
  }

  Object.entries(value).forEach(([key, entry]) => {
    scanValueForLegacyMedia(entry, context, candidates, [...pathSegments, key])
  })
}

async function loadFirestoreContent(db) {
  const siteShellSnapshot = await db.collection(firestoreCollections.siteContent).doc('site-shell').get()
  const structuredPagesSnapshot = await db.collection(firestoreCollections.structuredPages).get()
  const propertySnapshot = await db.collection(firestoreCollections.properties).get()
  const charterSnapshot = await db.collection(firestoreCollections.charters).get()

  return {
    siteShell: siteShellSnapshot.exists ? siteShellSnapshot.data() : null,
    structuredPages: structuredPagesSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    properties: propertySnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
    charters: charterSnapshot.docs.map((document) => ({ id: document.id, ...document.data() })),
  }
}

function collectAllCandidates(content) {
  const candidates = []

  if (content.siteShell) {
    scanValueForLegacyMedia(
      stripFirestoreMetadata(content.siteShell),
      {
        ownerType: 'site-shell',
        ownerKey: 'site-shell',
        ownerName: 'Site Shell',
      },
      candidates,
    )
  }

  content.structuredPages.forEach((page) => {
    scanValueForLegacyMedia(
      stripFirestoreMetadata(page),
      {
        ownerType: 'page',
        ownerKey: String(page.key ?? page.id ?? '').trim(),
        ownerName: String(page.navLabel ?? page.title ?? page.key ?? page.id ?? '').trim(),
      },
      candidates,
    )
  })

  content.properties.forEach((property) => {
    scanValueForLegacyMedia(
      stripFirestoreMetadata(property),
      {
        ownerType: 'property',
        ownerKey: String(property.slug ?? property.id ?? '').trim(),
        ownerName: String(property.name ?? property.slug ?? property.id ?? '').trim(),
      },
      candidates,
    )
  })

  content.charters.forEach((charter) => {
    scanValueForLegacyMedia(
      stripFirestoreMetadata(charter),
      {
        ownerType: 'charter',
        ownerKey: String(charter.slug ?? charter.id ?? '').trim(),
        ownerName: String(charter.name ?? charter.slug ?? charter.id ?? '').trim(),
      },
      candidates,
    )
  })

  return candidates
}

async function migrateAssets(db, bucket, candidates, projectId) {
  const mediaCollection = db.collection(MEDIA_LIBRARY_COLLECTION)
  const groupedCandidates = new Map()
  const existingMediaSnapshot = await mediaCollection.get()
  const existingMediaById = new Map(existingMediaSnapshot.docs.map((document) => [document.id, document.data()]))

  candidates.forEach((candidate) => {
    if (!groupedCandidates.has(candidate.canonicalSourceUrl)) {
      groupedCandidates.set(candidate.canonicalSourceUrl, [])
    }

    groupedCandidates.get(candidate.canonicalSourceUrl).push(candidate)
  })

  const stats = {
    scanned: candidates.length,
    unique: groupedCandidates.size,
    uploaded: 0,
    reused: 0,
  }

  for (const [canonicalSourceUrl, grouped] of groupedCandidates.entries()) {
    const sortedCandidates = [...grouped].sort(compareCandidates)
    const primaryCandidate = sortedCandidates[0]
    const mediaId = createMediaId(canonicalSourceUrl)
    const documentRef = mediaCollection.doc(mediaId)
    const existingData = existingMediaById.get(mediaId) ?? null
    const hasExistingRecord = Boolean(existingData)
    const usages = buildUsageList(sortedCandidates)
    let managedUrl = String(existingData?.managedUrl ?? '').trim()
    let storagePath = String(existingData?.storagePath ?? '').trim()
    let fileName = String(existingData?.fileName ?? '').trim()
    let contentType = String(existingData?.contentType ?? '').trim()
    let bytes = Number(existingData?.bytes ?? 0) || 0
    let downloadToken = String(existingData?.downloadToken ?? '').trim()
    const needsUpload = !managedUrl || !storagePath

    if (needsUpload) {
      const fetched = await fetchBinary(canonicalSourceUrl)
      const extension = resolveFileExtension(primaryCandidate, fetched.contentType)

      storagePath = buildStoragePath(primaryCandidate, extension)
      downloadToken = downloadToken || randomUUID()
      contentType = fetched.contentType || `image/${extension === 'jpg' ? 'jpeg' : extension}`
      bytes = fetched.buffer.length
      fileName = path.basename(storagePath)
      managedUrl = buildDownloadUrl(bucket.name, storagePath, downloadToken)

      await saveBufferToStorage(bucket.file(storagePath), fetched.buffer, contentType, {
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          canonicalSourceUrl,
          ownerType: primaryCandidate.ownerType,
          ownerKey: primaryCandidate.ownerKey,
        },
      })

      stats.uploaded += 1
    } else {
      stats.reused += 1
    }

    if (needsUpload || !hasExistingRecord) {
      await documentRef.set(
        {
          canonicalSourceUrl,
          originalSourceUrl: primaryCandidate.originalUrl,
          managedUrl,
          storagePath,
          fileName,
          downloadToken,
          bucket: bucket.name,
          ownerType: primaryCandidate.ownerType,
          ownerKey: primaryCandidate.ownerKey,
          ownerName: primaryCandidate.ownerName,
          fieldPath: primaryCandidate.fieldPath,
          contentType,
          bytes,
          alt: primaryCandidate.alt,
          title: primaryCandidate.title,
          sourceHost: 'legacy-static-host',
          usages,
          usageCount: usages.length,
          updatedAt: FieldValue.serverTimestamp(),
          migratedAt: hasExistingRecord ? existingData?.migratedAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  const mediaSnapshot = await mediaCollection.get()
  const mediaItems = mediaSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }))

  return {
    manifest: buildMediaManifest(mediaItems, {
      projectId,
      bucket: bucket.name,
    }),
    stats,
  }
}

async function rewriteFirestoreContent(db, content, manifest) {
  let updatedDocuments = 0
  const batch = db.batch()

  const maybeQueueUpdate = (documentRef, value, actor) => {
    const strippedValue = stripFirestoreMetadata(value)
    const rewrittenValue = rewriteValueWithMediaManifest(strippedValue, manifest)

    if (JSON.stringify(strippedValue) === JSON.stringify(rewrittenValue)) {
      return
    }

    batch.set(documentRef, {
      ...rewrittenValue,
      updatedBy: actor,
      updatedAt: FieldValue.serverTimestamp(),
    })
    updatedDocuments += 1
  }

  if (content.siteShell) {
    maybeQueueUpdate(
      db.collection(firestoreCollections.siteContent).doc('site-shell'),
      content.siteShell,
      'media-migration',
    )
  }

  content.structuredPages.forEach((page) => {
    maybeQueueUpdate(
      db.collection(firestoreCollections.structuredPages).doc(String(page.key ?? page.id ?? '').trim()),
      page,
      'media-migration',
    )
  })

  content.properties.forEach((property) => {
    maybeQueueUpdate(
      db.collection(firestoreCollections.properties).doc(String(property.slug ?? property.id ?? '').trim()),
      property,
      'media-migration',
    )
  })

  content.charters.forEach((charter) => {
    maybeQueueUpdate(
      db.collection(firestoreCollections.charters).doc(String(charter.slug ?? charter.id ?? '').trim()),
      charter,
      'media-migration',
    )
  })

  if (updatedDocuments > 0) {
    await batch.commit()
  }

  return updatedDocuments
}

async function rewriteJsonFile(filePath, manifest) {
  const originalText = await readOptionalText(filePath)

  if (!originalText) {
    return false
  }

  const originalValue = JSON.parse(originalText)
  const rewrittenValue = rewriteValueWithMediaManifest(originalValue, manifest)

  if (JSON.stringify(originalValue) === JSON.stringify(rewrittenValue)) {
    return false
  }

  await writeFile(filePath, `${JSON.stringify(rewrittenValue, null, 2)}\n`, 'utf8')
  return true
}

async function rewriteTextFile(filePath, manifest) {
  const originalText = await readOptionalText(filePath)

  if (!originalText) {
    return false
  }

  const rewrittenText = rewriteStringWithMediaManifest(originalText, manifest)

  if (rewrittenText === originalText) {
    return false
  }

  await writeFile(filePath, rewrittenText, 'utf8')
  return true
}

function countRemainingLegacyUrls(value) {
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countRemainingLegacyUrls(entry), 0)
  }

  if (typeof value === 'string') {
    return collectLegacyMediaMatches(value).length
  }

  if (!value || typeof value !== 'object') {
    return 0
  }

  return Object.values(value).reduce((total, entry) => total + countRemainingLegacyUrls(entry), 0)
}

async function main() {
  const config = await resolveFirebaseConfig()
  await primeApplicationDefaultCredentialsFromFirebaseCli()
  const adminApp = getAdminApp(config)
  const db = getFirestore(adminApp)
  const bucket = getStorage(adminApp).bucket(config.storageBucket)

  const firestoreContent = await loadFirestoreContent(db)
  const candidates = collectAllCandidates(firestoreContent).filter((candidate) => isLegacyMediaUrl(candidate.originalUrl))

  if (candidates.length === 0) {
    console.log('No legacy-hosted media references were found in Firestore.')
    return
  }

  const { manifest, stats } = await migrateAssets(db, bucket, candidates, config.projectId)
  const updatedFirestoreDocuments = await rewriteFirestoreContent(db, firestoreContent, manifest)

  await writeFile(mediaCatalogFilePath, renderMediaManifestModule(manifest), 'utf8')

  const rewrittenJsonFiles = []
  const rewrittenTextFiles = []

  for (const filePath of repoJsonFiles) {
    if (await rewriteJsonFile(filePath, manifest)) {
      rewrittenJsonFiles.push(path.relative(rootDir, filePath))
    }
  }

  for (const filePath of repoTextFiles) {
    if (await rewriteTextFile(filePath, manifest)) {
      rewrittenTextFiles.push(path.relative(rootDir, filePath))
    }
  }

  const refreshedFirestoreContent = await loadFirestoreContent(db)
  const remainingLegacyReferences =
    countRemainingLegacyUrls(stripFirestoreMetadata(refreshedFirestoreContent.siteShell)) +
    countRemainingLegacyUrls(refreshedFirestoreContent.structuredPages.map((page) => stripFirestoreMetadata(page))) +
    countRemainingLegacyUrls(refreshedFirestoreContent.properties.map((property) => stripFirestoreMetadata(property))) +
    countRemainingLegacyUrls(refreshedFirestoreContent.charters.map((charter) => stripFirestoreMetadata(charter)))

  console.log(`Scanned ${stats.scanned} legacy image references across ${stats.unique} unique source images.`)
  console.log(`Uploaded ${stats.uploaded} image files to gs://${bucket.name}/media and reused ${stats.reused} existing media records.`)
  console.log(`Updated ${updatedFirestoreDocuments} Firestore content documents.`)

  if (rewrittenJsonFiles.length > 0) {
    console.log(`Rewrote JSON files: ${rewrittenJsonFiles.join(', ')}`)
  }

  if (rewrittenTextFiles.length > 0) {
    console.log(`Rewrote source files: ${rewrittenTextFiles.join(', ')}`)
  }

  console.log(`Media manifest written to ${path.relative(rootDir, mediaCatalogFilePath)}`)
  console.log(`Remaining legacy references in live Firestore content: ${remainingLegacyReferences}`)
}

main().catch((error) => {
  console.error('Unable to migrate legacy-hosted media into Firebase Storage.')
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
