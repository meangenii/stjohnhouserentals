import { buildRemoteImageUrl } from './remoteImage'

function resolveContentImage(image) {
  if (!image || image.kind !== 'image') {
    return image
  }

  return {
    ...image,
    src: String(image.url ?? '').trim(),
  }
}

export function resolveContentAssets(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveContentAssets(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  if (value.kind === 'image') {
    return resolveContentImage(value)
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveContentAssets(entry)]))
}

export function getContentImageSrc(image, options = {}) {
  if (!image) {
    return ''
  }

  if (image.url) {
    return buildRemoteImageUrl(image, options) || image.src || image.url
  }

  return image.src || ''
}
