import { getAdminIdToken } from './adminAuth'
import { deleteJson, postJson } from './api'
import mediaUploadConfig from '../../shared/mediaUploadConfig.json'

export const MAX_ADMIN_MEDIA_UPLOAD_BYTES = Number(mediaUploadConfig.maxBinaryUploadBytes) || 6291456
const MAX_ADMIN_MEDIA_UPLOAD_LABEL = String(mediaUploadConfig.maxBinaryUploadLabel ?? '6 MB').trim() || '6 MB'
const SUPPORTED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
])

function inferImageContentType(file) {
  const normalizedType = String(file?.type ?? '').trim().toLowerCase()

  if (normalizedType.startsWith('image/')) {
    if (normalizedType === 'image/jpg') {
      return 'image/jpeg'
    }

    if (normalizedType === 'image/x-png') {
      return 'image/png'
    }

    return normalizedType
  }

  const normalizedName = String(file?.name ?? '').trim().toLowerCase()

  if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }

  if (normalizedName.endsWith('.png')) {
    return 'image/png'
  }

  if (normalizedName.endsWith('.webp')) {
    return 'image/webp'
  }

  if (normalizedName.endsWith('.gif')) {
    return 'image/gif'
  }

  if (normalizedName.endsWith('.svg')) {
    return 'image/svg+xml'
  }

  if (normalizedName.endsWith('.avif')) {
    return 'image/avif'
  }

  return ''
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64Payload = result.includes(',') ? result.slice(result.indexOf(',') + 1) : ''

      if (!base64Payload) {
        reject(new Error('Unable to read the selected image.'))
        return
      }

      resolve(base64Payload)
    }

    reader.onerror = () => {
      reject(reader.error || new Error('Unable to read the selected image.'))
    }

    reader.readAsDataURL(file)
  })
}

async function requireAdminAuthToken() {
  const authToken = await getAdminIdToken()

  if (!authToken) {
    throw new Error('Sign in again before changing the media library.')
  }

  return authToken
}

export async function createAdminMediaFolder({ folderName, parentPath }) {
  const authToken = await requireAdminAuthToken()
  return postJson(
    '/admin/media/folders',
    {
      folderName,
      parentPath,
    },
    { authToken },
  )
}

export async function uploadAdminMediaFile({
  alt = '',
  file,
  folderPath,
  ownerKey = '',
  ownerName = '',
  ownerType = '',
  title = '',
}) {
  if (!(file instanceof File)) {
    throw new Error('Choose an image file before uploading.')
  }

  const contentType = inferImageContentType(file)

  if (!SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error('Only image files can be uploaded to the media library.')
  }

  if (file.size > MAX_ADMIN_MEDIA_UPLOAD_BYTES) {
    throw new Error(`Images larger than ${MAX_ADMIN_MEDIA_UPLOAD_LABEL} are not supported in this uploader yet.`)
  }

  const authToken = await requireAdminAuthToken()
  const dataBase64 = await readFileAsBase64(file)

  return postJson(
    '/admin/media/upload',
    {
      alt,
      contentType,
      dataBase64,
      fileName: file.name,
      folderPath,
      ownerKey,
      ownerName,
      ownerType,
      title,
    },
    { authToken },
  )
}

export async function deleteAdminMediaFile(mediaId) {
  const normalizedMediaId = String(mediaId ?? '').trim()

  if (!normalizedMediaId) {
    throw new Error('Choose an image before deleting it.')
  }

  const authToken = await requireAdminAuthToken()
  return deleteJson(`/admin/media/library/${encodeURIComponent(normalizedMediaId)}`, { authToken })
}
