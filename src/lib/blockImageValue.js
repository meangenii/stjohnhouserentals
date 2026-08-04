const IMAGE_SOURCE_FIELDS = ['assetId', 'fileName', 'originalFileName', 'src', 'storagePath', 'url']

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeDimension(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function withoutImageSourceFields(image) {
  const nextImage = { ...getPlainObject(image) }
  IMAGE_SOURCE_FIELDS.forEach((field) => delete nextImage[field])
  return nextImage
}

export function selectManagedBlockImage(image, nextUrl, entry = {}) {
  const currentImage = getPlainObject(image)
  const normalizedUrl = String(nextUrl ?? '').trim()
  const originalWidth = normalizeDimension(entry?.width)
  const originalHeight = normalizeDimension(entry?.height)

  return {
    ...withoutImageSourceFields(currentImage),
    alt: String(currentImage.alt ?? '').trim() || String(entry?.alt ?? '').trim(),
    height: null,
    kind: 'image',
    originalHeight,
    originalWidth,
    title: String(currentImage.title ?? '').trim() || String(entry?.title ?? '').trim(),
    url: normalizedUrl,
    width: null,
  }
}

export function clearBlockImageSource(image) {
  return {
    ...withoutImageSourceFields(image),
    height: null,
    kind: 'image',
    originalHeight: null,
    originalWidth: null,
    width: null,
  }
}

export function getBlockImageAltText(image) {
  return image?.decorative === true ? '' : String(image?.alt ?? '')
}
