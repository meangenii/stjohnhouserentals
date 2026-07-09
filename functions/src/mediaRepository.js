const { createHash, randomUUID } = require('node:crypto')
const path = require('node:path')
const sharp = require('sharp')
const { HttpError, getDb, getServerTimestamp, getStorageBucket } = require('./firebaseAdmin')
const mediaUploadConfig = require('./mediaUploadConfig.json')

const MEDIA_LIBRARY_COLLECTION = 'cmsMediaLibrary'
const MEDIA_FOLDER_COLLECTION = 'cmsMediaFolders'
const MAX_MEDIA_UPLOAD_BYTES = Number(mediaUploadConfig.maxBinaryUploadBytes) || 6291456
const MAX_MEDIA_UPLOAD_LABEL = String(mediaUploadConfig.maxBinaryUploadLabel ?? '6 MB').trim() || '6 MB'
const AVIF_CONVERSION_CONTENT_TYPES = new Set(['image/jpeg', 'image/png'])
const AVIF_QUALITY = 60
const AVIF_EFFORT = 4

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

function getFolderPathFromStoragePath(storagePath) {
  const normalizedStoragePath = normalizeString(storagePath)

  if (!normalizedStoragePath.includes('/')) {
    return 'media'
  }

  return sanitizeFolderPath(normalizedStoragePath.slice(0, normalizedStoragePath.lastIndexOf('/')))
}

function getMediaRecordFolderPath(mediaRecord) {
  const explicitFolderPath = normalizeString(mediaRecord?.folderPath)

  if (explicitFolderPath) {
    return sanitizeFolderPath(explicitFolderPath)
  }

  return getFolderPathFromStoragePath(mediaRecord?.storagePath)
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

function sanitizeFileName(fileName, contentType, { forcedExtension = '' } = {}) {
  const rawBaseName = path.basename(normalizeString(fileName))
  const providedExtension = path.extname(rawBaseName).replace('.', '').toLowerCase()
  const fileStem = slugifySegment(path.basename(rawBaseName, path.extname(rawBaseName))) || 'image'
  let extension = normalizeString(forcedExtension).replace(/^\./, '').toLowerCase() || providedExtension

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

function normalizeDimension(value) {
  const dimension = Number.parseInt(String(value ?? '').trim(), 10)

  return Number.isFinite(dimension) && dimension > 0 ? dimension : null
}

async function readImageDimensions(buffer) {
  try {
    const metadata = await sharp(buffer, { animated: true }).metadata()

    return {
      height: normalizeDimension(metadata.height),
      width: normalizeDimension(metadata.width),
    }
  } catch {
    return {
      height: null,
      width: null,
    }
  }
}

async function normalizeUploadAsset(fileName, contentType, buffer) {
  const normalizedFileName = sanitizeFileName(fileName, contentType)

  if (!AVIF_CONVERSION_CONTENT_TYPES.has(contentType)) {
    const dimensions = await readImageDimensions(buffer)

    return {
      buffer,
      contentType,
      fileName: normalizedFileName,
      height: dimensions.height,
      originalContentType: '',
      originalFileName: '',
      wasConvertedToAvif: false,
      width: dimensions.width,
    }
  }

  try {
    const sourceImage = sharp(buffer, { animated: true })
    const metadata = await sourceImage.metadata()

    if ((metadata.pages ?? 1) > 1) {
      const dimensions = await readImageDimensions(buffer)

      return {
        buffer,
        contentType,
        fileName: normalizedFileName,
        height: dimensions.height,
        originalContentType: '',
        originalFileName: '',
        wasConvertedToAvif: false,
        width: dimensions.width,
      }
    }

    const convertedBuffer = await sourceImage
      .rotate()
      .avif({
        effort: AVIF_EFFORT,
        quality: AVIF_QUALITY,
      })
      .toBuffer()
    const dimensions = await readImageDimensions(convertedBuffer)

    return {
      buffer: convertedBuffer,
      contentType: 'image/avif',
      fileName: sanitizeFileName(normalizedFileName, 'image/avif', { forcedExtension: 'avif' }),
      height: dimensions.height,
      originalContentType: contentType,
      originalFileName: normalizedFileName,
      wasConvertedToAvif: true,
      width: dimensions.width,
    }
  } catch {
    throw new HttpError(400, 'Unable to convert the uploaded image to AVIF. Try a JPEG, PNG, or static WebP image.')
  }
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
  const originalContentType = inferContentType(draft?.fileName, draft?.contentType)
  const base64Payload = normalizeString(draft?.dataBase64)

  if (!base64Payload) {
    throw new HttpError(400, 'Choose an image to upload.')
  }

  const buffer = Buffer.from(base64Payload, 'base64')

  if (!buffer.length) {
    throw new HttpError(400, 'The uploaded file is empty.')
  }

  if (buffer.length > MAX_MEDIA_UPLOAD_BYTES) {
    throw new HttpError(400, `Images larger than ${MAX_MEDIA_UPLOAD_LABEL} are not supported in this uploader yet.`)
  }

  const normalizedUpload = await normalizeUploadAsset(draft?.fileName, originalContentType, buffer)
  const contentType = normalizedUpload.contentType
  const sanitizedFileName = normalizedUpload.fileName
  const storageBuffer = normalizedUpload.buffer
  const sourceHashSha256 = createHash('sha256').update(buffer).digest('hex')
  const storageHashSha256 = createHash('sha256').update(storageBuffer).digest('hex')

  const bucket = getStorageBucket()
  const { fileName, storagePath } = await resolveUniqueStoragePath(bucket, folderPath, sanitizedFileName)
  const downloadToken = randomUUID()
  const mediaId = createMediaDocumentId(storagePath)
  const managedUrl = buildDownloadUrl(bucket.name, storagePath, downloadToken)
  const db = getDb()

  await ensureFolderRecords(folderPath, actor)

  await bucket.file(storagePath).save(storageBuffer, {
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
    bytes: storageBuffer.length,
    contentType,
    downloadToken,
    fieldPath: '',
    fileName,
    folderPath,
    managedUrl,
    migratedAt: getServerTimestamp(),
    originalSourceUrl: '',
    originalBytes: normalizedUpload.wasConvertedToAvif ? buffer.length : 0,
    originalContentType: normalizedUpload.originalContentType,
    originalFileName: normalizedUpload.originalFileName,
    ownerKey: normalizeString(draft?.ownerKey),
    ownerName: normalizeString(draft?.ownerName),
    ownerType: normalizeString(draft?.ownerType),
    sourceHashSha256,
    sourceHost: 'admin-upload',
    storagePath,
    storageHashSha256,
    title: normalizeString(draft?.title),
    updatedAt: getServerTimestamp(),
    updatedBy: actor.email || actor.uid || 'admin',
    usageCount: 0,
    usages: [],
    wasConvertedToAvif: normalizedUpload.wasConvertedToAvif,
    width: normalizedUpload.width,
    height: normalizedUpload.height,
  }

  await db.collection(MEDIA_LIBRARY_COLLECTION).doc(mediaId).set(mediaRecord, { merge: true })

  return {
    id: mediaId,
    ...mediaRecord,
    migratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

async function deleteMediaAssets(mediaIds) {
  const normalizedMediaIds = [...new Set((Array.isArray(mediaIds) ? mediaIds : [mediaIds]).map((value) => normalizeString(value)).filter(Boolean))]

  if (!normalizedMediaIds.length) {
    throw new HttpError(400, 'Choose at least one media item before deleting it.')
  }

  const db = getDb()
  const mediaDocumentRefs = normalizedMediaIds.map((mediaId) => db.collection(MEDIA_LIBRARY_COLLECTION).doc(mediaId))
  const mediaDocuments = await Promise.all(mediaDocumentRefs.map((reference) => reference.get()))
  const missingDocument = mediaDocuments.find((document) => !document.exists)

  if (missingDocument) {
    throw new HttpError(404, 'One or more selected media items no longer exist.')
  }

  const deletedMedia = []

  for (const mediaDocument of mediaDocuments) {
    const mediaRecord = mediaDocument.data() ?? {}
    const storagePath = normalizeString(mediaRecord.storagePath)

    if (!storagePath) {
      throw new HttpError(409, 'A selected media item is missing its storage path and cannot be deleted safely.')
    }

    const bucket = getStorageBucket(normalizeString(mediaRecord.bucket))

    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true })
    } catch (error) {
      const statusCode = Number(error?.code ?? error?.statusCode ?? 0)

      if (statusCode !== 404) {
        throw error
      }
    }

    deletedMedia.push({
      bucket: normalizeString(mediaRecord.bucket) || bucket.name,
      fileName: normalizeString(mediaRecord.fileName),
      folderPath: getMediaRecordFolderPath(mediaRecord),
      id: mediaDocument.id,
      managedUrl: normalizeString(mediaRecord.managedUrl),
      storagePath,
    })
  }

  for (let index = 0; index < mediaDocumentRefs.length; index += 400) {
    const batch = db.batch()
    mediaDocumentRefs.slice(index, index + 400).forEach((reference) => batch.delete(reference))
    await batch.commit()
  }

  return deletedMedia
}

async function deleteMediaAsset(mediaId) {
  const normalizedMediaId = normalizeString(mediaId)

  if (!normalizedMediaId) {
    throw new HttpError(400, 'Choose a media item before deleting it.')
  }

  const [deletedMedia] = await deleteMediaAssets([normalizedMediaId])
  return deletedMedia
}

async function moveMediaAssets(mediaIds, folderPath, actor) {
  const normalizedMediaIds = [...new Set((Array.isArray(mediaIds) ? mediaIds : [mediaIds]).map((value) => normalizeString(value)).filter(Boolean))]

  if (!normalizedMediaIds.length) {
    throw new HttpError(400, 'Choose at least one media item before moving it.')
  }

  const normalizedFolderPath = sanitizeFolderPath(folderPath || 'media')
  const db = getDb()
  const mediaDocumentRefs = normalizedMediaIds.map((mediaId) => db.collection(MEDIA_LIBRARY_COLLECTION).doc(mediaId))
  const mediaDocuments = await Promise.all(mediaDocumentRefs.map((reference) => reference.get()))
  const missingDocument = mediaDocuments.find((document) => !document.exists)

  if (missingDocument) {
    throw new HttpError(404, 'One or more selected media items no longer exist.')
  }

  await ensureFolderRecords(normalizedFolderPath, actor)

  const moved = []
  const skipped = []

  for (const mediaDocument of mediaDocuments) {
    const mediaRecord = mediaDocument.data() ?? {}
    const currentFolderPath = getMediaRecordFolderPath(mediaRecord)

    if (currentFolderPath === normalizedFolderPath) {
      skipped.push({
        fileName: normalizeString(mediaRecord.fileName),
        folderPath: currentFolderPath,
        id: mediaDocument.id,
        managedUrl: normalizeString(mediaRecord.managedUrl),
        storagePath: normalizeString(mediaRecord.storagePath),
      })
      continue
    }

    await mediaDocument.ref.set(
      {
        folderPath: normalizedFolderPath,
        updatedAt: getServerTimestamp(),
        updatedBy: actor.email || actor.uid || 'admin',
      },
      { merge: true },
    )

    moved.push({
      fileName: normalizeString(mediaRecord.fileName),
      folderPath: normalizedFolderPath,
      id: mediaDocument.id,
      managedUrl: normalizeString(mediaRecord.managedUrl),
      storagePath: normalizeString(mediaRecord.storagePath),
      updatedAt: new Date().toISOString(),
    })
  }

  return {
    moved,
    movedCount: moved.length,
    skipped,
    skippedCount: skipped.length,
    targetFolderPath: normalizedFolderPath,
  }
}

async function deleteMediaFolder(folderPath, actor) {
  const normalizedFolderPath = sanitizeFolderPath(folderPath)

  if (normalizedFolderPath === 'media') {
    throw new HttpError(400, 'The root media folder cannot be deleted.')
  }

  const db = getDb()
  const folderCollection = db.collection(MEDIA_FOLDER_COLLECTION)
  const mediaCollection = db.collection(MEDIA_LIBRARY_COLLECTION)
  const folderDocument = await folderCollection.doc(createFolderDocumentId(normalizedFolderPath)).get()

  if (!folderDocument.exists) {
    throw new HttpError(404, 'The selected folder no longer exists.')
  }

  const prefix = `${normalizedFolderPath}/`
  const [folderSnapshot, mediaSnapshot] = await Promise.all([folderCollection.get(), mediaCollection.get()])
  const folderDocsToDelete = folderSnapshot.docs.filter((document) => {
    const documentPath = normalizeString(document.data()?.path)
    return documentPath === normalizedFolderPath || documentPath.startsWith(prefix)
  })
  const mediaDocsToDelete = mediaSnapshot.docs.filter((document) => {
    const mediaFolderPath = getMediaRecordFolderPath(document.data())
    return mediaFolderPath === normalizedFolderPath || mediaFolderPath.startsWith(prefix)
  })

  if (mediaDocsToDelete.length > 0) {
    await deleteMediaAssets(mediaDocsToDelete.map((document) => document.id))
  }

  for (let index = 0; index < folderDocsToDelete.length; index += 400) {
    const batch = db.batch()
    folderDocsToDelete.slice(index, index + 400).forEach((document) => batch.delete(document.ref))
    await batch.commit()
  }

  return {
    deletedFolderCount: folderDocsToDelete.length,
    deletedMediaCount: mediaDocsToDelete.length,
    deletedBy: actor.email || actor.uid || 'admin',
    path: normalizedFolderPath,
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
exports.deleteMediaAsset = deleteMediaAsset
exports.deleteMediaAssets = deleteMediaAssets
exports.deleteMediaFolder = deleteMediaFolder
exports.listMediaLibrary = listMediaLibrary
exports.moveMediaAssets = moveMediaAssets
exports.uploadMediaAsset = uploadMediaAsset
