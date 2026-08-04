import { getLinkDestination, resolveLinkRenderConfig } from './linkRecords.js'

const PLACEHOLDER_TEXT_VALUES = new Set([
  'add your text here',
  'business name',
  'label',
  'new hero banner',
  'new section',
])
const NON_DESCRIPTIVE_LINK_LABELS = new Set(['click here', 'here', 'learn more', 'link', 'more', 'read more'])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function decodeBasicEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripHtml(value = '') {
  return decodeBasicEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
}

function normalizeText(value = '') {
  return stripHtml(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!:;\-\u2013\u2014\u2026]+$/g, '')
    .trim()
}

function hasMeaningfulText(value) {
  const normalized = normalizeText(value).toLowerCase()
  return Boolean(normalized) && !PLACEHOLDER_TEXT_VALUES.has(normalized)
}

function hasImageReference(image) {
  if (!isPlainObject(image)) {
    return false
  }

  return ['assetId', 'fileName', 'originalFileName', 'src', 'storagePath', 'url'].some((field) => String(image[field] ?? '').trim())
}

function addWarning(warnings, path, code, message) {
  warnings.push({ code, message, path })
}

function auditImage(warnings, image, path, label) {
  if (!hasImageReference(image)) {
    return
  }

  if (image?.decorative === true) {
    return
  }

  if (!String(image?.alt ?? '').trim()) {
    addWarning(warnings, [...path, 'alt'], 'missing-image-alt', `${label} is missing alt text.`)
  }
}

function getFirstTextFieldValue(source, fields = []) {
  return fields.map((field) => String(source?.[field] ?? '').trim()).find(Boolean) ?? ''
}

function auditLink(
  warnings,
  link,
  path,
  label,
  { defaultType = 'internal', destinationField = 'path', labelFields = ['label', 'value', 'name'] } = {},
) {
  if (!isPlainObject(link)) {
    return
  }

  const linkLabel = getFirstTextFieldValue(link, labelFields)
  const destination = getLinkDestination(link, { destinationField })

  if (linkLabel && !destination) {
    addWarning(warnings, path, 'link-missing-destination', `${label} has link text but no destination.`)
  }

  if (destination && !linkLabel) {
    addWarning(warnings, path, 'link-missing-label', `${label} has a destination but no link text.`)
  }

  if (destination && NON_DESCRIPTIVE_LINK_LABELS.has(normalizeText(linkLabel).toLowerCase())) {
    addWarning(warnings, path, 'non-descriptive-link-label', `${label} text "${linkLabel}" does not describe its destination.`)
  }

  if (destination) {
    const renderConfig = resolveLinkRenderConfig(link, { defaultType, destinationField })

    if (!renderConfig.destination) {
      addWarning(warnings, path, 'link-unsafe-destination', `${label} has an unsupported or unsafe link destination.`)
    }
  }
}

function auditText(warnings, value, path, label, code = 'empty-block-content') {
  if (!hasMeaningfulText(value)) {
    addWarning(warnings, path, code, `${label} needs meaningful content.`)
  }
}

function auditObjectList(warnings, items, path, label) {
  if (!Array.isArray(items) || items.length === 0) {
    addWarning(warnings, path, 'empty-block-content', `${label} has no items.`)
    return []
  }

  return items
}

function auditBlockStyle(warnings, block, path, label) {
  const background = isPlainObject(block?.style?.background) ? block.style.background : null

  if (background?.type === 'image') {
    auditImage(warnings, background.image, [...path, 'style', 'background', 'image'], `${label} background image`)
  }
}

function auditBlock(block, path, warnings) {
  if (!isPlainObject(block)) {
    return
  }

  const type = String(block.type ?? '').trim()
  const label = String(block.title ?? block.heading ?? block.name ?? type ?? 'Block').trim()

  auditBlockStyle(warnings, block, path, label)

  if (type === 'hero') {
    auditText(warnings, block.title, [...path, 'title'], 'Hero title', 'missing-heading-text')
    auditImage(warnings, block.image, [...path, 'image'], 'Hero image')
    auditLink(warnings, block.action, [...path, 'action'], 'Hero button', { defaultType: 'internal', destinationField: 'path' })
  }

  if (type === 'image-text-split') {
    auditText(warnings, block.title, [...path, 'title'], 'Image text split title', 'missing-heading-text')
    auditText(warnings, block.body, [...path, 'body'], 'Image text split body')
    auditImage(warnings, block.image, [...path, 'image'], 'Image text split image')
    auditLink(warnings, block.action, [...path, 'action'], 'Image text split link', { defaultType: 'internal', destinationField: 'path' })
  }

  if (type === 'feature-grid') {
    const items = auditObjectList(warnings, block.items, [...path, 'items'], 'Feature grid')
    items.forEach((item, index) => {
      auditText(warnings, item?.title, [...path, 'items', index, 'title'], `Feature ${index + 1} title`, 'missing-heading-text')
      auditText(warnings, item?.body, [...path, 'items', index, 'body'], `Feature ${index + 1} description`)
    })
  }

  if (type === 'rich-text') {
    auditText(warnings, block.html, [...path, 'html'], 'Rich text block')
  }

  if (type === 'image') {
    auditImage(warnings, block.image, [...path, 'image'], 'Image block')
  }

  if (type === 'cta-band') {
    auditText(warnings, block.title, [...path, 'title'], 'CTA title', 'missing-heading-text')
    auditLink(warnings, block.action, [...path, 'action'], 'CTA button', { defaultType: 'internal', destinationField: 'path' })
  }

  if (type === 'testimonials') {
    const items = auditObjectList(warnings, block.items, [...path, 'items'], 'Testimonials block')
    items.forEach((item, index) => {
      auditText(warnings, item?.quote, [...path, 'items', index, 'quote'], `Testimonial ${index + 1} quote`)
      auditText(warnings, item?.author, [...path, 'items', index, 'author'], `Testimonial ${index + 1} author`)
    })
  }

  if (type === 'image-gallery') {
    const images = auditObjectList(warnings, block.images, [...path, 'images'], 'Image gallery')
    images.forEach((image, index) => auditImage(warnings, image, [...path, 'images', index], `Gallery image ${index + 1}`))
  }

  if (type === 'contact-details') {
    const items = auditObjectList(warnings, block.items, [...path, 'items'], 'Contact details block')
    items.forEach((item, index) => {
      auditText(warnings, item?.label, [...path, 'items', index, 'label'], `Contact detail ${index + 1} label`)
      auditText(warnings, item?.value, [...path, 'items', index, 'value'], `Contact detail ${index + 1} value`)
      if (item?.type === 'link') {
        auditLink(warnings, item, [...path, 'items', index], `Contact detail ${index + 1} link`, {
          defaultType: 'external',
          destinationField: 'href',
          labelFields: ['value'],
        })
      }
    })
  }

  if (type === 'schedule') {
    auditObjectList(warnings, block.columns, [...path, 'columns'], 'Schedule block')
  }

  if (type === 'rate-table') {
    auditText(warnings, block.heading, [...path, 'heading'], 'Rate table heading', 'missing-heading-text')
    auditObjectList(warnings, block.rows, [...path, 'rows'], 'Rate table')
    auditLink(warnings, block.link, [...path, 'link'], 'Rate table link', { defaultType: 'external', destinationField: 'path' })
  }

  if (type === 'business-list') {
    const items = auditObjectList(warnings, block.items, [...path, 'items'], 'Business list')
    items.forEach((item, index) => {
      auditText(warnings, item?.name, [...path, 'items', index, 'name'], `Business ${index + 1} name`, 'missing-heading-text')
      auditLink(warnings, item, [...path, 'items', index], `Business ${index + 1} website`, {
        defaultType: 'external',
        destinationField: 'website',
        labelFields: ['name'],
      })
    })
  }

  if (type === 'group') {
    const items = auditObjectList(warnings, block.items, [...path, 'items'], 'Repeating cards block')
    items.forEach((item, index) => {
      const itemPath = [...path, 'items', index]
      auditText(warnings, item?.title, [...itemPath, 'title'], `Card ${index + 1} title`, 'missing-heading-text')
      auditImage(warnings, item?.image, [...itemPath, 'image'], `Card ${index + 1} image`)
      auditBlocks(item?.blocks, [...itemPath, 'blocks'], warnings)
    })
  }

  if (type === 'row') {
    const columns = auditObjectList(warnings, block.columns, [...path, 'columns'], 'Row block')
    columns.forEach((column, index) => {
      const columnBlocks = Array.isArray(column?.blocks) ? column.blocks : []

      if (columnBlocks.length === 0) {
        addWarning(warnings, [...path, 'columns', index, 'blocks'], 'empty-container', `Row column ${index + 1} is empty.`)
      }

      auditBlocks(columnBlocks, [...path, 'columns', index, 'blocks'], warnings)
    })
  }

  if (type === 'two-column-text') {
    auditText(warnings, block.left, [...path, 'left'], 'Left column text')
    auditText(warnings, block.right, [...path, 'right'], 'Right column text')
  }
}

function auditBlocks(blocks, path, warnings) {
  if (!Array.isArray(blocks)) {
    return
  }

  blocks.forEach((block, index) => auditBlock(block, [...path, index], warnings))
}

export function auditBlockPageContent(page) {
  const warnings = []

  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== 'block-page') {
    return warnings
  }

  auditBlocks(page.blocks, ['blocks'], warnings)
  return warnings
}
