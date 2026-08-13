const DEVICE_CONFIGS = [
  { hiddenField: 'hideOnDesktop', label: 'Desktop', value: 'desktop' },
  { hiddenField: 'hideOnTablet', label: 'Tablet', value: 'tablet' },
  { hiddenField: 'hideOnMobile', label: 'Mobile', value: 'mobile' },
]

const NON_DESCRIPTIVE_LINK_LABELS = new Set(['click here', 'here', 'learn more', 'link', 'more', 'read more'])
const RICH_HTML_FIELDS = {
  'image-text-split': ['body'],
  'rich-text': ['html'],
  'two-column-text': ['left', 'right'],
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function decodeBasicEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function normalizeText(value = '') {
  return decodeBasicEntities(String(value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function addWarning(warnings, path, code, message) {
  warnings.push({ code, message, path })
}

function dedupeWarnings(warnings) {
  const seen = new Set()

  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.path.join('.')}:${warning.message}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function isBlockVisibleOnDevice(block, device) {
  if (block?.hidden === true) {
    return false
  }

  const config = DEVICE_CONFIGS.find((entry) => entry.value === device)
  return !config || block?.visibility?.[config.hiddenField] !== true
}

function collectHtmlAccessibility(html, path, headings, warnings) {
  const value = String(html ?? '')
  const headingPattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi
  const linkPattern = /<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi
  let match

  while ((match = headingPattern.exec(value))) {
    const text = normalizeText(match[2])

    if (!text) {
      addWarning(warnings, path, 'empty-rich-text-heading', 'Rich text contains an empty heading.')
      continue
    }

    headings.push({ level: Number(match[1]), path, text })
  }

  while ((match = linkPattern.exec(value))) {
    const label = normalizeText(match[1]).toLowerCase()

    if (!label) {
      addWarning(warnings, path, 'empty-rich-text-link', 'Rich text contains a link with no accessible text.')
    } else if (NON_DESCRIPTIVE_LINK_LABELS.has(label)) {
      addWarning(warnings, path, 'non-descriptive-link-label', `Rich text link text "${normalizeText(match[1])}" does not describe its destination.`)
    }
  }
}

function addHeading(headings, level, value, path) {
  const text = normalizeText(value)

  if (text) {
    headings.push({ level, path, text })
  }
}

function collectBlockHeadings(block, path, device, headings, warnings) {
  if (!isPlainObject(block) || !isBlockVisibleOnDevice(block, device)) {
    return
  }

  const type = String(block.type ?? '').trim()

  if (type === 'hero' || type === 'car-barge-hero') {
    addHeading(headings, 1, block.title, [...path, 'title'])
  }

  if (type === 'car-barge-operator') {
    addHeading(headings, 2, block.name, [...path, 'name'])
  }

  if (['business-list', 'contact-form', 'cta-band', 'directory-embed', 'feature-grid', 'image-text-split'].includes(type)) {
    addHeading(headings, 2, block.title, [...path, 'title'])
  }

  if (type === 'rate-table') {
    addHeading(headings, 2, block.heading, [...path, 'heading'])
  }

  if (type === 'schedule') {
    addHeading(headings, 2, block.title, [...path, 'title'])
    const columns = Array.isArray(block.columns) ? block.columns : []
    columns.forEach((column, index) => {
      addHeading(headings, 3, column?.heading, [...path, 'columns', index, 'heading'])
    })
  }

  if (type === 'feature-grid') {
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item, index) => {
      addHeading(headings, 3, item?.title, [...path, 'items', index, 'title'])
    })
  }

  if (type === 'group') {
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item, index) => {
      const itemPath = [...path, 'items', index]
      addHeading(headings, 2, item?.title, [...itemPath, 'title'])
      collectBlocks(item?.blocks, [...itemPath, 'blocks'], device, headings, warnings)
    })
  }

  if (type === 'row') {
    const columns = Array.isArray(block.columns) ? block.columns : []
    columns.forEach((column, index) => {
      collectBlocks(column?.blocks, [...path, 'columns', index, 'blocks'], device, headings, warnings)
    })
  }

  if (type === 'tabs') {
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item, index) => {
      collectBlocks(item?.blocks, [...path, 'items', index, 'blocks'], device, headings, warnings)
    })
  }

  const richHtmlFields = RICH_HTML_FIELDS[type] ?? []
  richHtmlFields.forEach((field) => {
    collectHtmlAccessibility(block[field], [...path, field], headings, warnings)
  })
}

function collectBlocks(blocks, path, device, headings, warnings) {
  if (!Array.isArray(blocks)) {
    return
  }

  blocks.forEach((block, index) => collectBlockHeadings(block, [...path, index], device, headings, warnings))
}

function auditHeadingOutline(headings, warnings, deviceConfig) {
  const pageHeadings = headings.filter((heading) => heading.level === 1)

  if (pageHeadings.length === 0) {
    addWarning(warnings, ['blocks'], 'missing-page-heading', `${deviceConfig.label} view has no level-one page heading.`)
  }

  pageHeadings.slice(1).forEach((heading) => {
    addWarning(
      warnings,
      heading.path,
      'multiple-page-headings',
      `${deviceConfig.label} view has more than one level-one page heading. Keep one clear page heading.`,
    )
  })

  let previousLevel = null

  headings.forEach((heading) => {
    if (previousLevel != null && heading.level > previousLevel + 1) {
      addWarning(
        warnings,
        heading.path,
        'heading-level-skip',
        `${deviceConfig.label} heading order skips from level ${previousLevel} to level ${heading.level}.`,
      )
    }

    previousLevel = heading.level
  })
}

export function auditBlockPageAccessibility(page) {
  const warnings = []

  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== 'block-page') {
    return warnings
  }

  DEVICE_CONFIGS.forEach((deviceConfig) => {
    const headings = []
    collectBlocks(page.blocks, ['blocks'], deviceConfig.value, headings, warnings)
    auditHeadingOutline(headings, warnings, deviceConfig)
  })

  return dedupeWarnings(warnings)
}
