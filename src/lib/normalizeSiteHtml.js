const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?stjohnhouserentals\.com$/i

function repairSnapshotText(text = '') {
  return text
    .replaceAll('\u00e2\u20ac\u2122', '\u2019')
    .replaceAll('\u00e2\u20ac\u0153', '\u201c')
    .replaceAll('\u00e2\u20ac\u009d', '\u201d')
    .replaceAll('\u00e2\u20ac\u201c', '\u2013')
    .replaceAll('\u00e2\u20ac\u201d', '\u2014')
    .replaceAll('\u00c2\u00a0', ' ')
    .replaceAll('\u00c2', '')
}

function normalizeLegacyPath(pathname) {
  const trimmedPath = String(pathname ?? '').trim()

  if (!trimmedPath) {
    return trimmedPath
  }

  if (/^\/car-rental-ferry-boat-info\/?$/i.test(trimmedPath)) {
    return '/car-barge-information'
  }

  const bedroomAliasMatch = trimmedPath.match(/^\/\d+bedroom\/([^/]+)\/?$/i)

  if (bedroomAliasMatch) {
    return `/rental-properties/${bedroomAliasMatch[1]}`
  }

  return trimmedPath.replace(/\/+$/, '') || '/'
}

function normalizeHrefValue(href) {
  const trimmedHref = String(href ?? '').trim()

  if (!trimmedHref) {
    return trimmedHref
  }

  if (trimmedHref.startsWith('/')) {
    const [pathnameAndSearch, hash = ''] = trimmedHref.split('#')
    const [pathname, search = ''] = pathnameAndSearch.split('?')
    const normalizedPath = normalizeLegacyPath(pathname)
    return `${normalizedPath}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
  }

  if (!/^https?:\/\//i.test(trimmedHref)) {
    return trimmedHref
  }

  let parsedUrl

  try {
    parsedUrl = new URL(trimmedHref)
  } catch {
    return trimmedHref
  }

  if (!SITE_ORIGIN_PATTERN.test(parsedUrl.origin)) {
    return trimmedHref
  }

  const normalizedPath = normalizeLegacyPath(parsedUrl.pathname)
  return `${normalizedPath}${parsedUrl.search}${parsedUrl.hash}`
}

export function normalizeSiteHtml(html) {
  const sourceHtml = repairSnapshotText(typeof html === 'string' ? html : '')

  if (!sourceHtml.trim()) {
    return ''
  }

  return sourceHtml.replace(/href="([^"]+)"/gi, (_, href) => `href="${normalizeHrefValue(href)}"`)
}
