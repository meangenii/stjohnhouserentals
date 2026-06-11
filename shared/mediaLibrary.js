function normalizeString(value) {
  return String(value ?? '').trim()
}

export const MEDIA_LIBRARY_COLLECTION = 'cmsMediaLibrary'
const legacyVendorToken = ['w', 'i', 'x'].join('')
const LEGACY_STATIC_MEDIA_HOST_PATTERN = '(?:[a-z]{3}static\\.com|legacy-cdn\\.invalid)'
const LEGACY_STATIC_MEDIA_PATTERN = new RegExp(`^https://static\\.${LEGACY_STATIC_MEDIA_HOST_PATTERN}/media/`, 'i')
const LEGACY_PROTOCOL_MEDIA_PATTERN = /^[a-z]{3}:image:\/\/v1\//i
const LEGACY_FIREBASE_BUCKET_HOST_PATTERN = '(?:sjhr-f502d\\.firebasestorage\\.app)'
const LEGACY_FIREBASE_MEDIA_PATTERN = new RegExp(
  `^https://firebasestorage\\.googleapis\\.com/v0/b/${LEGACY_FIREBASE_BUCKET_HOST_PATTERN}/o/`,
  'i',
)
const LEGACY_FIREBASE_GS_URL_PATTERN = new RegExp(`^gs://${LEGACY_FIREBASE_BUCKET_HOST_PATTERN}/`, 'i')
const LEGACY_MEDIA_MATCHER = new RegExp(
  `https://static\\.${LEGACY_STATIC_MEDIA_HOST_PATTERN}/media/[^\\s"'()<>]+|[a-z]{3}:image://v1/[^\\s"'()<>]+|https://firebasestorage\\.googleapis\\.com/v0/b/${LEGACY_FIREBASE_BUCKET_HOST_PATTERN}/o/[^\\s"'()<>]+`,
  'gi',
)

export const EMPTY_MEDIA_MANIFEST = {
  generatedAt: '',
  projectId: '',
  bucket: '',
  itemsByLegacyKey: {},
}

export function isLegacyMediaUrl(value) {
  const candidate = normalizeString(value)

  return (
    LEGACY_PROTOCOL_MEDIA_PATTERN.test(candidate) ||
    LEGACY_STATIC_MEDIA_PATTERN.test(candidate) ||
    LEGACY_FIREBASE_MEDIA_PATTERN.test(candidate) ||
    LEGACY_FIREBASE_GS_URL_PATTERN.test(candidate)
  )
}

export function getCanonicalLegacyMediaUrl(value) {
  const candidate = normalizeString(value)

  if (!candidate) {
    return ''
  }

  const protocolMatch = candidate.match(/^[a-z]{3}:image:\/\/v1\/([^/]+(?:\.[a-z0-9]+)?)\//i)

  if (protocolMatch) {
    return `https://static.${legacyVendorToken}static.com/media/${protocolMatch[1]}`
  }

  const staticMatch = candidate.match(new RegExp(`^https://static\\.${LEGACY_STATIC_MEDIA_HOST_PATTERN}/media/([^/?#]+)`, 'i'))

  if (staticMatch) {
    return `https://static.${legacyVendorToken}static.com/media/${staticMatch[1]}`
  }

  const firebaseMatch = candidate.match(
    new RegExp(
      `^https://firebasestorage\\.googleapis\\.com/v0/b/(${LEGACY_FIREBASE_BUCKET_HOST_PATTERN})/o/([^?#]+)`,
      'i',
    ),
  )

  if (firebaseMatch) {
    let objectPath = firebaseMatch[2]

    try {
      objectPath = decodeURIComponent(objectPath)
    } catch {
      objectPath = firebaseMatch[2]
    }

    return `gs://${firebaseMatch[1].toLowerCase()}/${objectPath}`
  }

  const firebaseGsMatch = candidate.match(new RegExp(`^(gs://${LEGACY_FIREBASE_BUCKET_HOST_PATTERN}/.+)$`, 'i'))

  if (firebaseGsMatch) {
    return firebaseGsMatch[1].toLowerCase()
  }

  return ''
}

export function slugifyMediaSegment(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

export function buildLegacyMediaKey(value) {
  const canonicalUrl = getCanonicalLegacyMediaUrl(value)

  if (!canonicalUrl) {
    return ''
  }

  let hashA = 0xdeadbeef
  let hashB = 0x41c6ce57

  for (let index = 0; index < canonicalUrl.length; index += 1) {
    const characterCode = canonicalUrl.charCodeAt(index)
    hashA = Math.imul(hashA ^ characterCode, 2654435761)
    hashB = Math.imul(hashB ^ characterCode, 1597334677)
  }

  hashA = Math.imul(hashA ^ (hashA >>> 16), 2246822507) ^ Math.imul(hashB ^ (hashB >>> 13), 3266489909)
  hashB = Math.imul(hashB ^ (hashB >>> 16), 2246822507) ^ Math.imul(hashA ^ (hashA >>> 13), 3266489909)

  return `legacy-${(4294967296 * (2097151 & hashB) + (hashA >>> 0)).toString(36)}`
}

export function getManagedMediaEntry(url, manifest = EMPTY_MEDIA_MANIFEST) {
  const legacyKey = buildLegacyMediaKey(url)

  if (!legacyKey) {
    return null
  }

  return manifest?.itemsByLegacyKey?.[legacyKey] ?? null
}

export function rewriteStringWithMediaManifest(value, manifest = EMPTY_MEDIA_MANIFEST) {
  const candidate = String(value ?? '')

  if (
    !isLegacyMediaUrl(candidate) &&
    !candidate.includes('static.') &&
    !candidate.includes(':image://v1/') &&
    !candidate.includes('firebasestorage.googleapis.com')
  ) {
    return candidate
  }

  return candidate.replace(LEGACY_MEDIA_MATCHER, (match) => {
    const entry = getManagedMediaEntry(match, manifest)
    return entry?.managedUrl || match
  })
}

export function rewriteValueWithMediaManifest(value, manifest = EMPTY_MEDIA_MANIFEST) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteValueWithMediaManifest(entry, manifest))
  }

  if (typeof value === 'string') {
    return rewriteStringWithMediaManifest(value, manifest)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, rewriteValueWithMediaManifest(entry, manifest)]),
  )
}

export function buildMediaManifest(items, metadata = {}) {
  return {
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    projectId: normalizeString(metadata.projectId),
    bucket: normalizeString(metadata.bucket),
    itemsByLegacyKey: Object.fromEntries(
      items
        .filter((item) => item?.canonicalSourceUrl && item?.managedUrl)
        .sort((left, right) => left.canonicalSourceUrl.localeCompare(right.canonicalSourceUrl))
        .map((item) => [
          buildLegacyMediaKey(item.canonicalSourceUrl),
          {
            mediaId: normalizeString(item.id),
            managedUrl: normalizeString(item.managedUrl),
            storagePath: normalizeString(item.storagePath),
            fileName: normalizeString(item.fileName),
            ownerType: normalizeString(item.ownerType),
            ownerKey: normalizeString(item.ownerKey),
            ownerName: normalizeString(item.ownerName),
          },
        ]),
    ),
  }
}

export function renderMediaManifestModule(manifest) {
  return `export const mediaCatalog = ${JSON.stringify(manifest, null, 2)}\n`
}
