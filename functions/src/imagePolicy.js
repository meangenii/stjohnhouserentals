const { HttpError } = require('./firebaseAdmin')

function getExpectedStorageBucket() {
  const firebaseConfigRaw = String(process.env.FIREBASE_CONFIG ?? '').trim()
  let projectId = ''

  if (firebaseConfigRaw) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigRaw)
      const bucket = String(parsedConfig?.storageBucket ?? '').trim()
      projectId = String(parsedConfig?.projectId ?? '').trim()

      if (bucket) {
        return bucket
      }
    } catch {
      // Ignore malformed config and fall through to other sources.
    }
  }

  const explicitBucket = String(process.env.FIREBASE_STORAGE_BUCKET ?? process.env.STORAGE_BUCKET ?? '').trim()

  if (explicitBucket) {
    return explicitBucket
  }

  const fallbackProjectId =
    projectId ||
    String(process.env.GCLOUD_PROJECT ?? process.env.PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? '').trim()

  return fallbackProjectId ? `${fallbackProjectId}.firebasestorage.app` : ''
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

  if (
    value.kind === 'image' ||
    Object.prototype.hasOwnProperty.call(value, 'assetId') ||
    Object.prototype.hasOwnProperty.call(value, 'src')
  ) {
    return true
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'url')) {
    return false
  }

  const imageOnlyKeys = new Set(['kind', 'url', 'alt', 'title', 'width', 'height'])
  const keys = Object.keys(value)

  if (keys.every((key) => imageOnlyKeys.has(key))) {
    return true
  }

  return ['alt', 'title', 'width', 'height'].some((key) => Object.prototype.hasOwnProperty.call(value, key))
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
