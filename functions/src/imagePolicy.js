const { HttpError } = require('./firebaseAdmin')

function getExpectedStorageBucket() {
  const firebaseConfigRaw = String(process.env.FIREBASE_CONFIG ?? '').trim()

  if (firebaseConfigRaw) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigRaw)
      const bucket = String(parsedConfig?.storageBucket ?? '').trim()

      if (bucket) {
        return bucket
      }
    } catch {
      // Ignore malformed config and fall through to other sources.
    }
  }

  return String(process.env.FIREBASE_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET ?? '').trim()
}

function createStorageUrlError(label, bucketName) {
  return new HttpError(
    400,
    `${label} must use a Firebase Storage URL${bucketName ? ` from bucket ${bucketName}` : ''}.`,
  )
}

function isFirebaseStorageUrl(value) {
  const bucketName = getExpectedStorageBucket()
  const candidate = String(value ?? '').trim()

  if (!candidate || !bucketName) {
    return false
  }

  let parsedUrl

  try {
    parsedUrl = new URL(candidate)
  } catch {
    return false
  }

  if (parsedUrl.hostname === 'firebasestorage.googleapis.com') {
    const pathMatch = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\//)
    return decodeURIComponent(pathMatch?.[1] ?? '') === bucketName
  }

  if (parsedUrl.hostname === 'storage.googleapis.com') {
    return parsedUrl.pathname.startsWith(`/${bucketName}/`)
  }

  return false
}

function assertStorageUrl(value, label) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return
  }

  if (!isFirebaseStorageUrl(candidate)) {
    throw createStorageUrlError(label, getExpectedStorageBucket())
  }
}

function looksLikeManagedImageObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return (
    value.kind === 'image' ||
    Object.prototype.hasOwnProperty.call(value, 'url') ||
    Object.prototype.hasOwnProperty.call(value, 'assetId')
  )
}

function assertStorageManagedImage(asset, label) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return
  }

  if (asset.assetId || asset.src) {
    throw new HttpError(400, `${label} still references a bundled local image. Replace it with a Firebase Storage image.`)
  }

  assertStorageUrl(asset.url, label)
}

function assertStorageHtmlImages(value, label) {
  const html = String(value ?? '')
  const matches = html.matchAll(/<img\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/gi)

  for (const match of matches) {
    assertStorageUrl(match[1], label)
  }
}

function assertStorageImagesInValue(value, label = 'Image') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertStorageImagesInValue(entry, `${label} ${index + 1}`)
    })
    return
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /<img\b/i.test(value)) {
      assertStorageHtmlImages(value, label)
    }
    return
  }

  if (looksLikeManagedImageObject(value)) {
    assertStorageManagedImage(value, label)
  }

  Object.entries(value).forEach(([key, entry]) => {
    const nextLabel = `${label} ${key}`.trim()
    assertStorageImagesInValue(entry, nextLabel)
  })
}

exports.assertStorageManagedImage = assertStorageManagedImage
exports.assertStorageImagesInValue = assertStorageImagesInValue
exports.assertStorageUrl = assertStorageUrl
exports.getExpectedStorageBucket = getExpectedStorageBucket
exports.isFirebaseStorageUrl = isFirebaseStorageUrl
