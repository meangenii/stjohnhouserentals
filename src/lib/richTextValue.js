import { normalizeSiteHtml } from './normalizeSiteHtml'

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const BLOCK_HTML_PATTERN = /<\/?(?:blockquote|div|h[1-6]|li|ol|p|ul)\b/i

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
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

export function richTextValueToPlainText(value) {
  const sourceValue = String(value ?? '')

  if (!sourceValue.trim()) {
    return ''
  }

  if (!hasRichTextMarkup(sourceValue)) {
    return sourceValue.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  if (typeof DOMParser === 'undefined') {
    return sourceValue
      .replace(/<\/p>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const normalizedHtml = normalizeSiteHtml(sourceValue)
  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')

  return (documentNode.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function richTextValueToLines(value) {
  const sourceValue = String(value ?? '')

  if (!sourceValue.trim()) {
    return []
  }

  if (!hasRichTextMarkup(sourceValue)) {
    return sourceValue
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (typeof DOMParser === 'undefined') {
    return sourceValue
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\r?\n+/)
      .map((line) => normalizeSiteHtml(line).trim())
      .filter(Boolean)
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
      const text = node.textContent?.trim()

      if (text) {
        lines.push(text)
      }

      return
    }

    if (node.nodeType !== 1) {
      return
    }

    const tagName = node.nodeName.toUpperCase()

    if (tagName === 'BR') {
      return
    }

    lines.push(...blockInnerHtmlToLines(node.innerHTML))
  })

  return lines.filter(Boolean)
}

export function richTextLinesToHtml(values = []) {
  return values
    .map((value) => richTextValueToHtml(value).trim())
    .filter(Boolean)
    .map((value) => `<p>${value}</p>`)
    .join('')
}
