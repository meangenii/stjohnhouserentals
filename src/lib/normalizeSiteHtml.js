import { normalizeRichTextFontSize } from './richTextFormatting'

const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?stjohnhouserentals\.com$/i
const EMPTY_PRUNABLE_INLINE_TAGS = new Set(['A', 'B', 'EM', 'I', 'SPAN', 'STRONG', 'U'])
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
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL',
])
const DROP_TAGS = new Set(['BASE', 'BUTTON', 'EMBED', 'FORM', 'IFRAME', 'INPUT', 'LINK', 'META', 'OBJECT', 'SCRIPT', 'SELECT', 'STYLE', 'TEXTAREA'])
const BLANK_LINE_PLACEHOLDER_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])
const ALLOWED_CLASS_NAMES = new Set([
  'property-description-section',
  'property-description-section--booking',
  'property-description-section--policy',
  'property-description-section--rates',
  'property-description-section--rates-table',
  'property-compact-block',
  'property-compact-group',
  'property-compact-group--pair',
  'property-compact-group--section',
  'property-compact-group--single',
  'property-compact-line',
  'property-rate-block',
  'property-rate-footer',
  'property-rate-group',
  'property-rate-line',
  'property-rate-line--auto',
  'property-rate-line--date',
  'property-rate-line--fee',
  'property-rate-line--heading',
  'property-rate-line--minimum',
  'property-rate-line--note',
  'property-rate-line--price',
  'property-rate-line--title',
  'property-rate-spacer',
  'property-rate-subgroup',
  'property-review-body',
  'property-review-entry',
  'property-review-list',
  'property-review-title',
  'property-section-list',
])
const ESCAPED_SITE_HTML_TAG_PATTERN =
  /&(?:lt|#60|#x3c);\s*\/?\s*(?:a|b|blockquote|br|div|em|h[1-6]|hr|i|li|ol|p|span|strong|table|tbody|td|th|thead|tr|u|ul)\b/i
const HTML_ENTITY_DECODE_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&#60;': '<',
  '&#x3c;': '<',
  '&gt;': '>',
  '&#62;': '>',
  '&#x3e;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
}

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

export function decodeEscapedSiteHtml(value = '') {
  const source = String(value ?? '')

  if (!ESCAPED_SITE_HTML_TAG_PATTERN.test(source)) {
    return source
  }

  return source.replace(/&(?:nbsp|amp|lt|gt|quot|#39|#x27|#60|#x3c|#62|#x3e|apos);/gi, (match) => {
    return HTML_ENTITY_DECODE_MAP[match.toLowerCase()] ?? match
  })
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

function isInternalSiteHref(href) {
  return href.startsWith('/') || href.startsWith('?') || href.startsWith('#')
}

function stripUnsafeHtmlFallback(html = '') {
  return String(html ?? '')
    .replace(/<\s*(script|style|iframe|object|embed|form|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(base|button|input|link|meta)\b[^>]*>/gi, '')
}

function stripComments(node) {
  Array.from(node.childNodes).forEach((child) => {
    if (child.nodeType === 8) {
      child.remove()
      return
    }

    if (child.nodeType === 1) {
      stripComments(child)
    }
  })
}

function isPrunableEmptyInlineElement(element) {
  const tagName = element.tagName.toUpperCase()

  if (!EMPTY_PRUNABLE_INLINE_TAGS.has(tagName)) {
    return false
  }

  return element.children.length === 0 && element.textContent.replace(/[ \t\r\n\f\v]/g, '').length === 0
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

function sanitizeStyleAttribute(element) {
  if (element.tagName.toUpperCase() !== 'SPAN') {
    return ''
  }

  const rawStyle = String(element.getAttribute('style') ?? '')
  const declarations = rawStyle
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const safeDeclarations = []

  declarations.forEach((declaration) => {
    const separatorIndex = declaration.indexOf(':')

    if (separatorIndex <= 0) {
      return
    }

    const propertyName = declaration.slice(0, separatorIndex).trim().toLowerCase()
    const propertyValue = declaration.slice(separatorIndex + 1).trim().toLowerCase()

    if (propertyName === 'font-size') {
      const normalizedFontSize = normalizeRichTextFontSize(propertyValue)

      if (normalizedFontSize) {
        safeDeclarations.push(`font-size: ${normalizedFontSize}`)
      }

      return
    }

    if (propertyName === 'font-style' && propertyValue === 'italic') {
      safeDeclarations.push('font-style: italic')
      return
    }

    if (propertyName === 'font-weight' && ['bold', 'bolder', '600', '700', '800', '900'].includes(propertyValue)) {
      safeDeclarations.push('font-weight: bold')
      return
    }

    if (propertyName === 'text-decoration' && propertyValue.includes('underline')) {
      safeDeclarations.push('text-decoration: underline')
      return
    }

    if (propertyName === 'text-decoration-line' && propertyValue === 'underline') {
      safeDeclarations.push('text-decoration: underline')
    }
  })

  if (safeDeclarations.length === 0) {
    return ''
  }

  return `${Array.from(new Set(safeDeclarations)).join('; ')};`
}

function sanitizeClassAttribute(element) {
  const safeClassNames = String(element.getAttribute('class') ?? '')
    .split(/\s+/)
    .map((className) => className.trim())
    .filter((className) => ALLOWED_CLASS_NAMES.has(className))

  return Array.from(new Set(safeClassNames)).join(' ')
}

const NBSP_CHARACTER = String.fromCharCode(160)

function isNbspOnlyPlaceholderText(text) {
  const normalizedText = String(text ?? '')

  return normalizedText.length > 0 && normalizedText.includes(NBSP_CHARACTER) && normalizedText.replace(/\s/g, '').length === 0
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

    if (BLANK_LINE_PLACEHOLDER_TAGS.has(tagName) && element.children.length === 0 && isNbspOnlyPlaceholderText(element.textContent)) {
      element.textContent = ''
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase()

      if (attributeName.startsWith('on')) {
        element.removeAttribute(attribute.name)
        return
      }

      if (attributeName === 'style') {
        const safeStyle = sanitizeStyleAttribute(element)

        if (safeStyle) {
          element.setAttribute('style', safeStyle)
        } else {
          element.removeAttribute(attribute.name)
        }

        return
      }

      if (attributeName === 'class') {
        const safeClass = sanitizeClassAttribute(element)

        if (safeClass) {
          element.setAttribute('class', safeClass)
        } else {
          element.removeAttribute(attribute.name)
        }

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

      if (!isInternalSiteHref(safeHref) && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noreferrer noopener')
      } else {
        element.removeAttribute('target')
        element.removeAttribute('rel')
      }
    }

    if (isPrunableEmptyInlineElement(element)) {
      element.remove()
    }
  })
}

export function normalizeSiteHtml(html) {
  const sourceHtml = decodeEscapedSiteHtml(repairSnapshotText(typeof html === 'string' ? html : ''))

  if (!sourceHtml.trim()) {
    return ''
  }

  if (typeof DOMParser === 'undefined') {
    return stripUnsafeHtmlFallback(sourceHtml).replace(/href="([^"]+)"/gi, (_, href) => {
      const safeHref = normalizeHrefValue(href)
      return safeHref ? `href="${safeHref}"` : ''
    })
  }

  const documentNode = new DOMParser().parseFromString(`<div>${sourceHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return ''
  }

  stripComments(root)

  sanitizeHtmlTree(root)
  return root.innerHTML.trim()
}
