import { getAdminIdToken } from './adminAuth'
import { postJson } from './api'

export const MAX_ADMIN_MEDIA_UPLOAD_BYTES = 7864320

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

  if (!String(file.type ?? '').toLowerCase().startsWith('image/')) {
    throw new Error('Only image files can be uploaded to the media library.')
  }

  if (file.size > MAX_ADMIN_MEDIA_UPLOAD_BYTES) {
    throw new Error('Images larger than 7.5 MB are not supported in this uploader yet.')
  }

  const authToken = await requireAdminAuthToken()
  const dataBase64 = await readFileAsBase64(file)

  return postJson(
    '/admin/media/upload',
    {
      alt,
      contentType: file.type,
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
