const { createHash, randomUUID } = require('node:crypto')
const path = require('node:path')
const { HttpError, getDb, getServerTimestamp, getStorageBucket } = require('./firebaseAdmin')

const MEDIA_LIBRARY_COLLECTION = 'cmsMediaLibrary'
const MEDIA_FOLDER_COLLECTION = 'cmsMediaFolders'
const MAX_MEDIA_UPLOAD_BYTES = 7864320

function normalizeString(value) {
  return String(value ?? '').trim()
}

function slugifySegment(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function humanizeSegment(value) {
  return normalizeString(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function sanitizeFolderPath(value, { allowEmpty = false } = {}) {
  const rawSegments = normalizeString(value).split('/').map((segment) => segment.trim()).filter(Boolean)

  if (rawSegments.length === 0) {
    return allowEmpty ? '' : 'media'
  }

  const normalizedSegments = rawSegments.map((segment, index) => {
    if (index === 0 && segment.toLowerCase() === 'media') {
      return 'media'
    }

    return slugifySegment(segment)
  })

  if (normalizedSegments[0] !== 'media') {
    normalizedSegments.unshift('media')
  }

  if (normalizedSegments.some((segment) => !segment)) {
    throw new HttpError(400, 'Folder names may only contain letters, numbers, spaces, dashes, and underscores.')
  }

  return normalizedSegments.join('/')
}

function createFolderDocumentId(folderPath) {
  return `folder-${folderPath.replace(/\//g, '__')}`
}

function createMediaDocumentId(storagePath) {
  return `media-${createHash('sha1').update(storagePath).digest('hex').slice(0, 20)}`
}

function buildDownloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`
}

function inferContentType(fileName, contentType) {
  const normalizedContentType = normalizeString(contentType).toLowerCase()

  if (normalizedContentType.startsWith('image/')) {
    return normalizedContentType
  }

  const extension = path.extname(fileName).replace('.', '').toLowerCase()

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    default:
      throw new HttpError(400, 'Only image uploads are supported.')
  }
}

function sanitizeFileName(fileName, contentType) {
  const rawBaseName = path.basename(normalizeString(fileName))
  const providedExtension = path.extname(rawBaseName).replace('.', '').toLowerCase()
  const fileStem = slugifySegment(path.basename(rawBaseName, path.extname(rawBaseName))) || 'image'
  let extension = providedExtension

  if (!extension) {
    switch (contentType) {
      case 'image/jpeg':
        extension = 'jpg'
        break
      case 'image/png':
        extension = 'png'
        break
      case 'image/webp':
        extension = 'webp'
        break
      case 'image/gif':
        extension = 'gif'
        break
      case 'image/svg+xml':
        extension = 'svg'
        break
      case 'image/avif':
        extension = 'avif'
        break
      default:
        extension = 'jpg'
    }
  }

  if (extension === 'jpeg') {
    extension = 'jpg'
  }

  return `${fileStem}.${extension}`
}

async function resolveUniqueStoragePath(bucket, folderPath, sanitizedFileName) {
  const extension = path.extname(sanitizedFileName)
  const stem = sanitizedFileName.slice(0, sanitizedFileName.length - extension.length)

  for (let index = 0; index < 100; index += 1) {
    const candidateName = index === 0 ? sanitizedFileName : `${stem}-${String(index + 1).padStart(2, '0')}${extension}`
    const storagePath = `${folderPath}/${candidateName}`
    const [exists] = await bucket.file(storagePath).exists()

    if (!exists) {
      return {
        fileName: candidateName,
        storagePath,
      }
    }
  }

  throw new HttpError(409, 'Unable to find an available file name in this folder.')
}

async function ensureFolderRecords(folderPath, actor, displayName = '') {
  const db = getDb()
  const folderCollection = db.collection(MEDIA_FOLDER_COLLECTION)
  const segments = sanitizeFolderPath(folderPath).split('/').filter(Boolean)
  const timestamp = getServerTimestamp()
  const batch = db.batch()

  segments.forEach((segment, index) => {
    const currentPath = segments.slice(0, index + 1).join('/')
    const parentPath = index > 0 ? segments.slice(0, index).join('/') : ''
    const isTargetFolder = index === segments.length - 1

    batch.set(
      folderCollection.doc(createFolderDocumentId(currentPath)),
      {
        path: currentPath,
        parentPath,
        name: isTargetFolder ? normalizeString(displayName) || humanizeSegment(segment) : humanizeSegment(segment),
        updatedAt: timestamp,
        updatedBy: actor.email || actor.uid || 'admin',
        createdAt: timestamp,
        createdBy: actor.email || actor.uid || 'admin',
      },
      { merge: true },
    )
  })

  await batch.commit()
}

async function createMediaFolder(parentPath, folderName, actor) {
  const normalizedFolderName = normalizeString(folderName)
  const slug = slugifySegment(normalizedFolderName)

  if (!slug) {
    throw new HttpError(400, 'Enter a folder name before creating a folder.')
  }

  const normalizedParentPath = sanitizeFolderPath(parentPath || 'media')
  const folderPath = `${normalizedParentPath}/${slug}`
  await ensureFolderRecords(folderPath, actor, normalizedFolderName)

  return {
    name: normalizedFolderName,
    parentPath: normalizedParentPath,
    path: folderPath,
  }
}

async function uploadMediaAsset(draft, actor) {
  const folderPath = sanitizeFolderPath(draft?.folderPath || 'media')
  const contentType = inferContentType(draft?.fileName, draft?.contentType)
  const sanitizedFileName = sanitizeFileName(draft?.fileName, contentType)
  const base64Payload = normalizeString(draft?.dataBase64)

  if (!base64Payload) {
    throw new HttpError(400, 'Choose an image to upload.')
  }

  const buffer = Buffer.from(base64Payload, 'base64')

  if (!buffer.length) {
    throw new HttpError(400, 'The uploaded file is empty.')
  }

  if (buffer.length > MAX_MEDIA_UPLOAD_BYTES) {
    throw new HttpError(400, 'Images larger than 7.5 MB are not supported in this uploader yet.')
  }

  const bucket = getStorageBucket()
  const { fileName, storagePath } = await resolveUniqueStoragePath(bucket, folderPath, sanitizedFileName)
  const downloadToken = randomUUID()
  const mediaId = createMediaDocumentId(storagePath)
  const managedUrl = buildDownloadUrl(bucket.name, storagePath, downloadToken)
  const db = getDb()

  await ensureFolderRecords(folderPath, actor)

  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        ownerKey: normalizeString(draft?.ownerKey),
        ownerType: normalizeString(draft?.ownerType),
      },
    },
  })

  const mediaRecord = {
    alt: normalizeString(draft?.alt),
    bucket: bucket.name,
    bytes: buffer.length,
    contentType,
    downloadToken,
    fieldPath: '',
    fileName,
    managedUrl,
    migratedAt: getServerTimestamp(),
    originalSourceUrl: '',
    ownerKey: normalizeString(draft?.ownerKey),
    ownerName: normalizeString(draft?.ownerName),
    ownerType: normalizeString(draft?.ownerType),
    sourceHost: 'admin-upload',
    storagePath,
    title: normalizeString(draft?.title),
    updatedAt: getServerTimestamp(),
    updatedBy: actor.email || actor.uid || 'admin',
    usageCount: 0,
    usages: [],
  }

  await db.collection(MEDIA_LIBRARY_COLLECTION).doc(mediaId).set(mediaRecord, { merge: true })

  return {
    id: mediaId,
    ...mediaRecord,
    migratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

async function listMediaLibrary() {
  const [entrySnapshot, folderSnapshot] = await Promise.all([
    getDb().collection(MEDIA_LIBRARY_COLLECTION).orderBy('storagePath').get(),
    getDb().collection(MEDIA_FOLDER_COLLECTION).orderBy('path').get(),
  ])
  const bucket = entrySnapshot.docs.find((document) => document.data()?.bucket)?.data()?.bucket || getStorageBucket().name
  const generatedAt = entrySnapshot.docs.reduce((latest, document) => {
    const updatedAt = document.data()?.updatedAt ?? document.data()?.migratedAt
    const candidate =
      typeof updatedAt?.toDate === 'function' ? updatedAt.toDate().toISOString() : typeof updatedAt === 'string' ? updatedAt : ''
    return candidate > latest ? candidate : latest
  }, '')

  return {
    bucket,
    entries: entrySnapshot.docs.map((document) => ({
      mediaId: document.id,
      ...document.data(),
    })),
    folders: folderSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    })),
    generatedAt,
  }
}

exports.MAX_MEDIA_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_BYTES
exports.MEDIA_FOLDER_COLLECTION = MEDIA_FOLDER_COLLECTION
exports.MEDIA_LIBRARY_COLLECTION = MEDIA_LIBRARY_COLLECTION
exports.createMediaFolder = createMediaFolder
exports.listMediaLibrary = listMediaLibrary
exports.uploadMediaAsset = uploadMediaAsset
