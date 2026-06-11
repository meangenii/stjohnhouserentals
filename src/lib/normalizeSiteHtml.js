const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?stjohnhouserentals\.com$/i
const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'DIV',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'LI',
  'OL',
  'P',
  'SPAN',
  'STRONG',
  'U',
  'UL',
])
const DROP_TAGS = new Set(['BASE', 'BUTTON', 'EMBED', 'FORM', 'IFRAME', 'INPUT', 'LINK', 'META', 'OBJECT', 'SCRIPT', 'SELECT', 'STYLE', 'TEXTAREA'])

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

  if (trimmedHref.startsWith('#') || trimmedHref.startsWith('?')) {
    return trimmedHref
  }

  if (trimmedHref.startsWith('/')) {
    const [pathnameAndSearch, hash = ''] = trimmedHref.split('#')
    const [pathname, search = ''] = pathnameAndSearch.split('?')
    const normalizedPath = normalizeLegacyPath(pathname)
    return `${normalizedPath}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`
  }

  if (/^(mailto:|tel:)/i.test(trimmedHref)) {
    return trimmedHref
  }

  if (!/^https?:\/\//i.test(trimmedHref)) {
    return ''
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

function unwrapElement(element) {
  const parent = element.parentNode

  if (!parent) {
    return
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }

  parent.removeChild(element)
}

function sanitizeHtmlTree(root) {
  Array.from(root.children).forEach((element) => {
    sanitizeHtmlTree(element)

    const tagName = element.tagName.toUpperCase()

    if (DROP_TAGS.has(tagName)) {
      element.remove()
      return
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      unwrapElement(element)
      return
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase()

      if (attributeName.startsWith('on') || attributeName === 'style') {
        element.removeAttribute(attribute.name)
        return
      }

      if (tagName === 'A') {
        if (!['href', 'rel', 'target', 'title'].includes(attributeName)) {
          element.removeAttribute(attribute.name)
        }

        return
      }

      element.removeAttribute(attribute.name)
    })

    if (tagName === 'A') {
      const safeHref = normalizeHrefValue(element.getAttribute('href'))

      if (!safeHref) {
        unwrapElement(element)
        return
      }

      element.setAttribute('href', safeHref)

      if (element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noreferrer noopener')
      } else {
        element.removeAttribute('target')
        element.removeAttribute('rel')
      }
    }
  })
}

export function normalizeSiteHtml(html) {
  const sourceHtml = repairSnapshotText(typeof html === 'string' ? html : '')

  if (!sourceHtml.trim()) {
    return ''
  }

  if (typeof DOMParser === 'undefined') {
    return sourceHtml.replace(/href="([^"]+)"/gi, (_, href) => {
      const safeHref = normalizeHrefValue(href)
      return safeHref ? `href="${safeHref}"` : ''
    })
  }

  const documentNode = new DOMParser().parseFromString(`<div>${sourceHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return ''
  }

  sanitizeHtmlTree(root)
  return root.innerHTML.trim()
}
