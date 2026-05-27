const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?stjohnhouserentals\.com$/i

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
  const sourceHtml = typeof html === 'string' ? html : ''

  if (!sourceHtml.trim()) {
    return ''
  }

  return sourceHtml.replace(/href="([^"]+)"/gi, (_, href) => `href="${normalizeHrefValue(href)}"`)
}
