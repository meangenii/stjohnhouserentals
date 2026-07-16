import { decodeEscapedSiteHtml, normalizeSiteHtml } from './normalizeSiteHtml'

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i
const BLOCK_HTML_PATTERN = /<\/?(?:blockquote|div|h[1-6]|li|ol|p|ul)\b/i
const SEMANTIC_PASTE_HTML_PATTERN = /<\s*(?:a|li|ol|table|td|th|tr|ul)\b/i
const BLOCK_PASTE_TAGS = new Set(['BLOCKQUOTE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'OL', 'P', 'TABLE', 'UL'])
const INLINE_PASTE_TAGS = new Set(['A', 'B', 'BR', 'EM', 'I', 'SPAN', 'STRONG', 'U'])
const UNORDERED_LIST_LINE_PATTERN = /^\s*(?:[-*•‣▪◦]|–|—)\s+(.+)$/
const ORDERED_LIST_LINE_PATTERN = /^\s*\d+[.)]\s+(.+)$/
const AUTO_LINK_PATTERN =
  /https?:\/\/[^\s<>"']+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/gi

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

function normalizePasteTextSource(value = '') {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitPasteTextBlocks(value = '') {
  const blocks = []
  let currentBlock = []

  normalizePasteTextSource(value)
    .split('\n')
    .forEach((line) => {
      if (!line) {
        if (currentBlock.length > 0) {
          blocks.push(currentBlock)
          currentBlock = []
        }

        return
      }

      currentBlock.push(line)
    })

  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  return blocks
}

function stripTrailingLinkPunctuation(value = '') {
  const trailingMatch = String(value ?? '').match(/[),.;:!?]+$/)

  if (!trailingMatch) {
    return { linkText: value, trailingText: '' }
  }

  return {
    linkText: value.slice(0, -trailingMatch[0].length),
    trailingText: trailingMatch[0],
  }
}

function buildAutoLinkHtml(value = '') {
  const { linkText, trailingText } = stripTrailingLinkPunctuation(value)
  const normalizedLinkText = String(linkText ?? '').trim()

  if (!normalizedLinkText) {
    return escapeHtml(value)
  }

  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedLinkText)) {
    return `<a href="mailto:${escapeHtml(normalizedLinkText)}">${escapeHtml(normalizedLinkText)}</a>${escapeHtml(trailingText)}`
  }

  const phoneDigits = normalizedLinkText.replace(/\D/g, '')

  if (/^(?:1)?\d{10}$/.test(phoneDigits)) {
    return `<a href="tel:${escapeHtml(phoneDigits)}">${escapeHtml(normalizedLinkText)}</a>${escapeHtml(trailingText)}`
  }

  if (/^https?:\/\//i.test(normalizedLinkText)) {
    return `<a href="${escapeHtml(normalizedLinkText)}">${escapeHtml(normalizedLinkText)}</a>${escapeHtml(trailingText)}`
  }

  return escapeHtml(value)
}

function escapeAndLinkifyText(value = '', { trim = true } = {}) {
  const normalizedText = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\t\r\n ]+/g, ' ')
  const text = trim ? normalizedText.trim() : normalizedText

  if (!text) {
    return ''
  }

  let html = ''
  let cursor = 0

  text.replace(AUTO_LINK_PATTERN, (match, offset) => {
    html += escapeHtml(text.slice(cursor, offset))
    html += buildAutoLinkHtml(match)
    cursor = offset + match.length
    return match
  })

  html += escapeHtml(text.slice(cursor))
  return html
}

function isPlainTextTableBlock(lines = []) {
  if (lines.length < 2 || !lines.every((line) => line.includes('\t'))) {
    return false
  }

  const columnCounts = lines.map((line) => line.split('\t').length)
  const firstColumnCount = columnCounts[0]

  return firstColumnCount > 1 && columnCounts.every((count) => count === firstColumnCount)
}

function plainTextTableBlockToHtml(lines = []) {
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))

  return `<table><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeAndLinkifyText(cell) || '&nbsp;'}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`
}

function plainTextListBlockToHtml(lines = [], { ordered = false } = {}) {
  const matcher = ordered ? ORDERED_LIST_LINE_PATTERN : UNORDERED_LIST_LINE_PATTERN
  const tagName = ordered ? 'ol' : 'ul'

  return `<${tagName}>${lines
    .map((line) => {
      const itemText = line.match(matcher)?.[1] ?? line
      return `<li>${escapeAndLinkifyText(itemText)}</li>`
    })
    .join('')}</${tagName}>`
}

function plainTextBlockToHtml(lines = [], { inline = false } = {}) {
  if (inline) {
    return lines.map((line) => escapeAndLinkifyText(line)).filter(Boolean).join('<br />')
  }

  if (isPlainTextTableBlock(lines)) {
    return plainTextTableBlockToHtml(lines)
  }

  if (lines.length > 0 && lines.every((line) => ORDERED_LIST_LINE_PATTERN.test(line))) {
    return plainTextListBlockToHtml(lines, { ordered: true })
  }

  if (lines.length > 0 && lines.every((line) => UNORDERED_LIST_LINE_PATTERN.test(line))) {
    return plainTextListBlockToHtml(lines)
  }

  const paragraphHtml = lines.map((line) => escapeAndLinkifyText(line)).filter(Boolean).join('<br />')

  return paragraphHtml ? `<p>${paragraphHtml}</p>` : ''
}

function pastedPlainTextToHtml(value = '', { inline = false } = {}) {
  const blocks = splitPasteTextBlocks(value)

  if (blocks.length === 0) {
    return ''
  }

  return normalizeSiteHtml(blocks.map((block) => plainTextBlockToHtml(block, { inline })).filter(Boolean).join(inline ? '<br />' : '\n'))
}

function hasBlockPasteChild(element) {
  return Array.from(element?.children ?? []).some((child) => BLOCK_PASTE_TAGS.has(child.tagName.toUpperCase()))
}

function renderPastedInlineNode(node) {
  if (node.nodeType === 3) {
    return escapeAndLinkifyText(node.textContent ?? '', { trim: false })
  }

  if (node.nodeType !== 1) {
    return ''
  }

  const element = node
  const tagName = element.tagName.toUpperCase()

  if (tagName === 'BR') {
    return '<br />'
  }

  if (tagName === 'A') {
    const href = element.getAttribute('href') ?? ''
    const bodyHtml = renderPastedInlineChildren(element).trim() || escapeAndLinkifyText(href)

    return href ? `<a href="${escapeHtml(href)}">${bodyHtml}</a>` : bodyHtml
  }

  return renderPastedInlineChildren(element)
}

function renderPastedInlineChildren(root) {
  return Array.from(root.childNodes).map((child) => renderPastedInlineNode(child)).join('')
}

function renderPastedTable(element) {
  const rows = Array.from(element.querySelectorAll('tr'))

  if (rows.length === 0) {
    return ''
  }

  return `<table><tbody>${rows
    .map((row) => {
      const cells = Array.from(row.children).filter((cell) => ['TD', 'TH'].includes(cell.tagName.toUpperCase()))

      if (cells.length === 0) {
        return ''
      }

      return `<tr>${cells
        .map((cell) => {
          const tagName = cell.tagName.toUpperCase() === 'TH' ? 'th' : 'td'
          const cellHtml = renderPastedInlineChildren(cell).trim() || '&nbsp;'
          return `<${tagName}>${cellHtml}</${tagName}>`
        })
        .join('')}</tr>`
    })
    .filter(Boolean)
    .join('')}</tbody></table>`
}

function renderPastedList(element) {
  const tagName = element.tagName.toUpperCase() === 'OL' ? 'ol' : 'ul'
  const items = Array.from(element.children).filter((child) => child.tagName.toUpperCase() === 'LI')

  if (items.length === 0) {
    return ''
  }

  return `<${tagName}>${items
    .map((item) => {
      const itemHtml = hasBlockPasteChild(item) ? renderPastedBlockChildren(item) : renderPastedInlineChildren(item)
      return `<li>${itemHtml.trim()}</li>`
    })
    .join('')}</${tagName}>`
}

function renderPastedBlockNode(node) {
  if (node.nodeType === 3) {
    const html = escapeAndLinkifyText(node.textContent ?? '')
    return html ? `<p>${html}</p>` : ''
  }

  if (node.nodeType !== 1) {
    return ''
  }

  const element = node
  const tagName = element.tagName.toUpperCase()

  if (tagName === 'TABLE') {
    return renderPastedTable(element)
  }

  if (tagName === 'UL' || tagName === 'OL') {
    return renderPastedList(element)
  }

  if (tagName === 'BR') {
    return ''
  }

  if (hasBlockPasteChild(element)) {
    return renderPastedBlockChildren(element)
  }

  const inlineHtml = renderPastedInlineChildren(element).trim()

  return inlineHtml ? `<p>${inlineHtml}</p>` : ''
}

function renderPastedBlockChildren(root) {
  const fragments = []
  let inlineBuffer = []

  const flushInlineBuffer = () => {
    const inlineHtml = inlineBuffer.join('').trim()

    if (inlineHtml) {
      fragments.push(`<p>${inlineHtml}</p>`)
    }

    inlineBuffer = []
  }

  Array.from(root.childNodes).forEach((child) => {
    if (child.nodeType === 3 || (child.nodeType === 1 && INLINE_PASTE_TAGS.has(child.tagName.toUpperCase()))) {
      inlineBuffer.push(renderPastedInlineNode(child))
      return
    }

    flushInlineBuffer()
    fragments.push(renderPastedBlockNode(child))
  })

  flushInlineBuffer()
  return fragments.filter(Boolean).join('\n')
}

function pastedHtmlToEditorHtml(value = '', { inline = false } = {}) {
  const normalizedHtml = normalizeSiteHtml(value)

  if (!normalizedHtml.trim()) {
    return ''
  }

  if (typeof DOMParser === 'undefined') {
    return inline ? richTextValueToInlineHtml(normalizedHtml) : richTextValueToHtml(normalizedHtml)
  }

  const documentNode = new DOMParser().parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return ''
  }

  const renderedHtml = inline ? renderPastedInlineChildren(root).trim() : renderPastedBlockChildren(root)
  return normalizeSiteHtml(renderedHtml)
}

function getPastedEditorHtml({ htmlValue = '', plainTextValue = '', inline = false } = {}) {
  const normalizedPlainText = normalizePasteTextSource(plainTextValue)

  if (normalizedPlainText && (!htmlValue || !SEMANTIC_PASTE_HTML_PATTERN.test(htmlValue))) {
    return pastedPlainTextToHtml(normalizedPlainText, { inline })
  }

  if (htmlValue) {
    return pastedHtmlToEditorHtml(htmlValue, { inline })
  }

  return normalizedPlainText ? pastedPlainTextToHtml(normalizedPlainText, { inline }) : ''
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

function normalizeRichTextSource(value) {
  return decodeEscapedSiteHtml(String(value ?? ''))
}

export function hasRichTextMarkup(value) {
  return HTML_TAG_PATTERN.test(normalizeRichTextSource(value))
}

export function richTextValueToHtml(value) {
  const sourceValue = normalizeRichTextSource(value)

  if (!sourceValue.trim()) {
    return ''
  }

  return hasRichTextMarkup(sourceValue) ? normalizeSiteHtml(sourceValue) : normalizePlainTextForHtml(sourceValue)
}

export function richTextValueToInlineHtml(value) {
  const sourceValue = normalizeRichTextSource(value)

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

  if (!htmlValue && !plainTextValue) {
    return ''
  }

  return getPastedEditorHtml({ htmlValue, inline, plainTextValue })
}

export function richTextValueToPlainText(value) {
  const sourceValue = normalizeRichTextSource(value)

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

export function richTextValueToPlainTextLines(value, { preserveBlankLines = false } = {}) {
  const lines = richTextValueToLines(value, { preserveBlankLines: true }).map((line) => richTextValueToPlainText(line))

  return preserveBlankLines ? lines : lines.filter(Boolean)
}

export function richTextValueToPlainLineText(value, { preserveBlankLines = false } = {}) {
  return richTextValueToPlainTextLines(value, { preserveBlankLines }).join('\n')
}

export function richTextValueToLines(value, { preserveBlankLines = false } = {}) {
  const sourceValue = normalizeRichTextSource(value)
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
