function getHostedAssetBase(url) {
  return String(url ?? '').match(/^(https:\/\/static\.[a-z]{3}static\.com\/media\/[^/]+(?:\.[a-zA-Z0-9]+)?)/i)?.[1] ?? ''
}

function normalizeFileName(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  try {
    return decodeURIComponent(candidate)
  } catch {
    return candidate
  }
}

function getHostedAssetFileName(url, title) {
  const normalizedTitle = normalizeFileName(title)

  if (normalizedTitle) {
    return normalizedTitle
  }

  const transformedFileName = String(url ?? '').match(/\/([^/?#]+)(?:[?#].*)?$/)?.[1] ?? ''
  const normalizedTransformedFileName = normalizeFileName(transformedFileName)

  if (normalizedTransformedFileName) {
    return normalizedTransformedFileName
  }

  return getHostedAssetBase(url).split('/').pop() ?? 'image'
}

export function buildRemoteImageUrl(asset, options = {}) {
  const image = typeof asset === 'string' ? { url: asset, title: '' } : asset ?? {}
  const width = Number(options.width) || 0
  const height = Number(options.height) || 0
  const mode = options.mode === 'fit' ? 'fit' : 'fill'
  const quality = Number(options.quality) || 90
  const baseUrl = getHostedAssetBase(image.url)

  if (!baseUrl || !width || !height) {
    return String(image.url ?? '').trim()
  }

  const fileName = encodeURIComponent(getHostedAssetFileName(image.url, image.title)).replace(/%2F/g, '/')

  return `${baseUrl}/v1/${mode}/w_${Math.round(width)},h_${Math.round(height)},al_c,q_${quality},usm_0.66_1.00_0.01,enc_avif,quality_auto/${fileName}`
}
