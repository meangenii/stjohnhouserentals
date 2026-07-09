import { normalizeSiteHtml } from './normalizeSiteHtml'

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const BLOCK_HTML_PATTERN = /<\/?(?:blockquote|div|h[1-6]|li|ol|p|ul)\b/i

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizePlainTextForHtml(value) {
  return escapeHtml(value)
    .replace(/\r?\n\r?\n+/g, '<br /><br />')
    .replace(/\r?\n/g, '<br />')
}

const HTML_ENTITY_DECODE_MAP = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function decodeBasicHtmlEntities(value) {
  return String(value ?? '').replace(/&(?:nbsp|amp|lt|gt|quot|#39|apos);/gi, (match) => HTML_ENTITY_DECODE_MAP[match.toLowerCase()] ?? match)
}

function blockInnerHtmlToLines(innerHtml = '') {
  return String(innerHtml ?? '')
    .split(/<br\s*\/?>/i)
    .map((line) => normalizeSiteHtml(line).trim())
    .filter(Boolean)
}

export function hasRichTextMarkup(value) {
  return HTML_TAG_PATTERN.test(String(value ?? ''))
}

export function richTextValueToHtml(value) {
  const sourceValue = String(value ?? '')

  if (!sourceValue.trim()) {
    return ''
  }

  return hasRichTextMarkup(sourceValue) ? normalizeSiteHtml(sourceValue) : normalizePlainTextForHtml(sourceValue)
}

export function richTextValueToInlineHtml(value) {
  const sourceValue = String(value ?? '')

  if (!sourceValue.trim()) {
    return ''
  }

  if (!hasRichTextMarkup(sourceValue)) {
    return normalizePlainTextForHtml(sourceValue)
  }

  const normalizedHtml = normalizeSiteHtml(sourceValue)

  if (!BLOCK_HTML_PATTERN.test(normalizedHtml)) {
    return normalizedHtml
  }

  return richTextValueToLines(normalizedHtml).join('<br />')
}

export function getClipboardRichTextHtml(clipboardData, { inline = false } = {}) {
  if (!clipboardData || typeof clipboardData.getData !== 'function') {
    return ''
  }

  const htmlValue = String(clipboardData.getData('text/html') ?? '').trim()
  const plainTextValue = String(clipboardData.getData('text/plain') ?? '').trim()
  const sourceValue = htmlValue || plainTextValue

  if (!sourceValue) {
    return ''
  }

  return inline ? richTextValueToInlineHtml(sourceValue) : richTextValueToHtml(sourceValue)
}

export function richTextValueToPlainText(value) {
  const sourceValue = String(value ?? '')

  if (!sourceValue.trim()) {
    return ''
  }

  if (!hasRichTextMarkup(sourceValue)) {
    return decodeBasicHtmlEntities(sourceValue).replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  if (typeof DOMParser === 'undefined') {
    return decodeBasicHtmlEntities(
      sourceValue
        .replace(/<\/p>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim()
  }

  const normalizedHtml = normalizeSiteHtml(sourceValue)
  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')

  return (documentNode.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function richTextValueToLines(value, { preserveBlankLines = false } = {}) {
  const sourceValue = String(value ?? '')
  const dropBlankLines = (lines) => (preserveBlankLines ? lines : lines.filter(Boolean))

  if (!sourceValue.trim()) {
    return []
  }

  if (!hasRichTextMarkup(sourceValue)) {
    return dropBlankLines(
      sourceValue
        .split(/\r?\n/)
        .map((line) => decodeBasicHtmlEntities(line).trim()),
    )
  }

  if (typeof DOMParser === 'undefined') {
    return dropBlankLines(
      sourceValue
        .replace(/<\/p>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .split(/\r?\n/)
        .map((line) => normalizeSiteHtml(line).trim()),
    )
  }

  const normalizedHtml = normalizeSiteHtml(sourceValue)
  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return []
  }

  const lines = []

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === 3) {
      const text = node.textContent?.trim() ?? ''
      lines.push(text)
      return
    }

    if (node.nodeType !== 1) {
      return
    }

    const tagName = node.nodeName.toUpperCase()

    if (tagName === 'BR') {
      lines.push('')
      return
    }

    lines.push(...blockInnerHtmlToLines(node.innerHTML))
  })

  return dropBlankLines(lines)
}

export function richTextLinesToHtml(values = [], { preserveBlankLines = false } = {}) {
  return values
    .map((value) => richTextValueToHtml(value).trim())
    .filter((value) => preserveBlankLines || Boolean(value))
    .map((value) => `<p>${value || '<br />'}</p>`)
    .join('')
}
