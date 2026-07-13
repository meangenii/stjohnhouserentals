import { useState } from 'react'
import siteCssText from '../index.css?raw'
import {
  normalizeEditorStyleSettings,
  resetEditorStyleSettings,
  writeEditorStyleSettings,
} from '../lib/editorStyleSettings'
import { normalizeRichTextFontSizeAsPoints } from '../lib/richTextFormatting'
import {
  getDefaultSiteThemeSettings,
  getSiteThemeElementStylePresets,
  getSiteThemeCssProperties,
  getSiteThemeRuleOverrideCssText,
  getSiteThemeCssText,
  HEX_COLOR_PATTERN,
  normalizeSiteThemeSettings,
} from '../lib/siteThemeSettings'
import { useEditorStyleSettings } from '../lib/useEditorStyleSettings'
import blockCssText from '../styles/blocks.css?raw'

const SAFE_STYLE_VALUE_PATTERN = /^[#%(),./0-9a-z\s'"-]+$/i
const SAFE_RULE_OVERRIDE_VALUE_PATTERN = /^[^{};<>]{1,240}$/
const UNSAFE_RULE_OVERRIDE_VALUE_PATTERN = /(?:@import|expression\s*\(|javascript\s*:|url\s*\()/i
const CSS_LENGTH_GLOBAL_PATTERN = /(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|pt)\b/gi
const CSS_NUMBER_VALUE_PATTERN = /^-?(?:\d+\.?\d*|\.\d+)$/
const CSS_RESPONSIVE_FUNCTION_PATTERN = /\b(clamp|min|max)\(([^()]*)\)/gi
const PX_PER_REM = 16
const PT_PER_PX = 72 / 96

const COLOR_GROUPS = [
  {
    title: 'Brand & Links',
    fields: [
      { group: 'colors', key: 'brandNavy', label: 'Headings' },
      { group: 'colors', key: 'brandNavyDeep', label: 'Deep Header' },
      { group: 'colors', key: 'brandBlue', label: 'Links' },
      { group: 'colors', key: 'brandSky', label: 'Accent Blue' },
      { group: 'colors', key: 'action', label: 'Action Color' },
    ],
  },
  {
    title: 'Pages & Cards',
    fields: [
      { group: 'colors', key: 'surface', label: 'Page Surface' },
      { group: 'colors', key: 'surfaceSoft', label: 'Soft Surface' },
      { group: 'colors', key: 'surfacePale', label: 'Pale Surface' },
      { group: 'colors', key: 'cardBackground', label: 'Card Surface' },
      { group: 'colors', key: 'text', label: 'Body Text' },
      { group: 'colors', key: 'muted', label: 'Muted Text' },
      { group: 'colors', key: 'border', label: 'Borders' },
    ],
  },
  {
    title: 'Hero, CTA & Footer',
    fields: [
      { group: 'colors', key: 'homeBand', label: 'CTA Band' },
      { group: 'colors', key: 'heroText', label: 'Hero Title' },
      { group: 'colors', key: 'heroLeadText', label: 'Hero Copy' },
      { group: 'colors', key: 'footerBlue', label: 'Footer Bar' },
    ],
  },
]

const BUTTON_COLOR_FIELDS = [
  { group: 'colors', key: 'buttonPrimaryBackground', label: 'Primary Fill' },
  { group: 'colors', key: 'buttonPrimaryText', label: 'Primary Text' },
  { group: 'colors', key: 'buttonSecondaryBackground', label: 'Secondary Fill' },
  { group: 'colors', key: 'buttonSecondaryText', label: 'Secondary Text' },
  { group: 'colors', key: 'buttonGhostBackground', label: 'Ghost Fill' },
  { group: 'colors', key: 'buttonGhostText', label: 'Ghost Text' },
  { group: 'colors', key: 'buttonGhostBorder', label: 'Ghost Border' },
]

const BODY_FONT_OPTIONS = [
  { label: 'DM Sans', value: "'DM Sans', 'Segoe UI', sans-serif" },
  { label: 'System Sans', value: "'Segoe UI', Arial, sans-serif" },
  { label: 'Georgia Sans Mix', value: "Georgia, 'Times New Roman', serif" },
]

const DISPLAY_FONT_OPTIONS = [
  { label: 'Unna', value: "'Unna', Georgia, serif" },
  { label: 'Georgia', value: "Georgia, 'Times New Roman', serif" },
  { label: 'DM Sans', value: "'DM Sans', 'Segoe UI', sans-serif" },
]

const ACCENT_WEIGHT_OPTIONS = [
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Bold', value: '700' },
]

const HEADING_WEIGHT_OPTIONS = [
  { label: 'Regular', value: '400' },
  { label: 'Medium', value: '500' },
  { label: 'Bold', value: '700' },
]

const TEXT_SPACING_FIELDS = [
  { group: 'typography', key: 'bodyLineHeight', label: 'Line Height', property: 'line-height' },
]

const SITE_TEXT_SIZE_FIELDS = [
  { group: 'typography', key: 'bodySize', label: 'Body Text', fallback: '12' },
  { group: 'typography', key: 'accentSize', label: 'Accent/Eyebrow', fallback: '12' },
  { group: 'typography', key: 'heroTitleSize', label: 'Hero Title', fallback: '58' },
  { group: 'typography', key: 'sectionTitleSize', label: 'Section Title', fallback: '52' },
  { group: 'typography', key: 'cardTitleSize', label: 'Card Title', fallback: '18' },
]

const RICH_TEXT_TAG_SIZE_FIELDS = {
  h1: { fallback: '36', key: 'richTextH1Size' },
  h2: { fallback: '28', key: 'richTextH2Size' },
  h3: { fallback: '22.5', key: 'richTextH3Size' },
  h4: { fallback: '18', key: 'richTextH4Size' },
  h5: { fallback: '15', key: 'richTextH5Size' },
  h6: { fallback: '12', key: 'richTextH6Size' },
  p: { fallback: '12', key: 'richTextPSize' },
}

const LAYOUT_FIELDS = [
  { group: 'layout', key: 'pageWidth', label: 'Page Width', property: 'width' },
  { group: 'layout', key: 'wideWidth', label: 'Wide Width', property: 'width' },
  { group: 'layout', key: 'chromeWidth', label: 'Chrome Width', property: 'width' },
  { group: 'layout', key: 'heroHeight', label: 'Hero Height', property: 'height' },
  { group: 'layout', key: 'heroImageAspect', label: 'Hero Aspect', property: 'aspect-ratio' },
  { group: 'layout', key: 'shadow', label: 'Card Shadow', property: 'box-shadow', wide: true },
]

const COMPONENT_FIELDS = [
  { group: 'components', key: 'buttonRadius', label: 'Button Radius', property: 'border-radius' },
  { group: 'components', key: 'buttonPaddingY', label: 'Button Y Padding', property: 'padding-top' },
  { group: 'components', key: 'buttonPaddingX', label: 'Button X Padding', property: 'padding-left' },
  { group: 'components', key: 'buttonFontWeight', label: 'Button Weight', property: 'font-weight' },
  { group: 'components', key: 'buttonShadow', label: 'Button Shadow', property: 'box-shadow', wide: true },
  { group: 'components', key: 'cardRadius', label: 'Card Radius', property: 'border-radius' },
  { group: 'components', key: 'cardPadding', label: 'Card Padding', property: 'padding' },
  { group: 'components', key: 'mediaRadius', label: 'Media Radius', property: 'border-radius' },
  { group: 'components', key: 'bandRadius', label: 'Band Radius', property: 'border-radius' },
  { group: 'components', key: 'pillRadius', label: 'Pill Radius', property: 'border-radius' },
  { group: 'components', key: 'sectionPaddingTop', label: 'Section Top Spacing', property: 'padding-top' },
  { group: 'components', key: 'heroPaddingY', label: 'Hero Y Padding', property: 'padding-top' },
]

const BUTTON_COMPONENT_KEYS = new Set(['buttonRadius', 'buttonPaddingY', 'buttonPaddingX', 'buttonFontWeight', 'buttonShadow'])
const BUTTON_COMPONENT_FIELDS = COMPONENT_FIELDS.filter((field) => BUTTON_COMPONENT_KEYS.has(field.key))
const SECTION_COMPONENT_FIELDS = COMPONENT_FIELDS.filter((field) => !BUTTON_COMPONENT_KEYS.has(field.key))
const BLOCK_WIDTH_SELECT_OPTIONS = [
  { label: 'Full', value: 'full' },
  { label: 'Contained', value: 'contained' },
  { label: 'Narrow', value: 'narrow' },
]
const BLOCK_SPACING_SELECT_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
]
const BLOCK_ALIGN_SELECT_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
]
const BLOCK_BORDER_SELECT_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Thin', value: 'thin' },
  { label: 'Thick', value: 'thick' },
]
const BLOCK_RADIUS_SELECT_OPTIONS = [
  { label: 'Square', value: 'none' },
  { label: 'Rounded', value: 'small' },
  { label: 'Very rounded', value: 'large' },
]
const ELEMENT_STYLE_COLOR_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Page Surface', value: 'var(--surface)' },
  { label: 'Soft Surface', value: 'var(--surface-soft)' },
  { label: 'Pale Surface', value: 'var(--surface-pale)' },
  { label: 'Card Surface', value: 'var(--card-background)' },
  { label: 'Body Text', value: 'var(--text)' },
  { label: 'Muted Text', value: 'var(--muted)' },
  { label: 'Heading', value: 'var(--brand-navy)' },
  { label: 'Link Blue', value: 'var(--brand-blue)' },
  { label: 'CTA Band', value: 'var(--home-band)' },
  { label: 'Hero Text', value: 'var(--hero-text)' },
]
const STYLE_RULE_SOURCE_FILES = [
  { label: 'Core CSS', name: 'index.css', text: siteCssText },
  { label: 'Blocks CSS', name: 'blocks.css', text: blockCssText },
]
const IGNORED_SELECTOR_PATTERN = /(?:\.admin(?:-|[A-Z_a-z0-9])|\[data-admin|#root|:root|^html$|^body$|^\*$)/

function normalizeRuleValue(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function formatDecimal(value) {
  if (!Number.isFinite(value)) {
    return ''
  }

  if (Math.abs(value) < 0.005) {
    return '0'
  }

  return Number(value.toFixed(2)).toString()
}

function convertCssLengthValue(size, unit, targetUnit) {
  const numericSize = Number(size)

  if (!Number.isFinite(numericSize)) {
    return ''
  }

  const sourceUnit = String(unit ?? '').toLowerCase()
  let pixelValue = numericSize

  if (sourceUnit === 'rem' || sourceUnit === 'em') {
    pixelValue = numericSize * PX_PER_REM
  } else if (sourceUnit === 'pt') {
    pixelValue = numericSize / PT_PER_PX
  }

  if (targetUnit === 'pt') {
    return `${formatDecimal(pixelValue * PT_PER_PX)}pt`
  }

  return `${formatDecimal(pixelValue)}px`
}

function getPreferredStyleUnit(property) {
  const propertyName = String(property ?? '').trim().toLowerCase()

  if (!propertyName) {
    return ''
  }

  if (propertyName === 'font-size' || propertyName === 'font') {
    return 'pt'
  }

  if (
    propertyName === 'aspect-ratio' ||
    propertyName === 'display' ||
    propertyName === 'font-family' ||
    propertyName === 'font-weight' ||
    propertyName === 'line-height' ||
    propertyName === 'opacity' ||
    propertyName === 'order' ||
    propertyName === 'position' ||
    propertyName === 'visibility' ||
    propertyName === 'z-index' ||
    propertyName.includes('color')
  ) {
    return ''
  }

  if (
    propertyName === 'border' ||
    propertyName === 'box-shadow' ||
    propertyName === 'filter' ||
    propertyName === 'flex' ||
    propertyName === 'grid-auto-columns' ||
    propertyName === 'grid-auto-rows' ||
    propertyName === 'grid-template-columns' ||
    propertyName === 'grid-template-rows' ||
    propertyName === 'outline' ||
    propertyName === 'text-shadow' ||
    propertyName === 'transform' ||
    propertyName === 'translate' ||
    propertyName.includes('basis') ||
    propertyName.includes('border-width') ||
    propertyName.includes('column') ||
    propertyName.includes('gap') ||
    propertyName.includes('height') ||
    propertyName.includes('inset') ||
    propertyName.includes('left') ||
    propertyName.includes('margin') ||
    propertyName.includes('offset') ||
    propertyName.includes('padding') ||
    propertyName.includes('radius') ||
    propertyName.includes('right') ||
    propertyName.includes('shadow') ||
    propertyName.includes('spacing') ||
    propertyName.includes('top') ||
    propertyName.includes('width')
  ) {
    return 'px'
  }

  return ''
}

function shouldAppendUnitToNumber(property) {
  const propertyName = String(property ?? '').trim().toLowerCase()

  if (!propertyName || propertyName === 'font' || propertyName === 'flex') {
    return false
  }

  if (
    propertyName === 'border' ||
    propertyName === 'box-shadow' ||
    propertyName === 'filter' ||
    propertyName === 'grid-auto-columns' ||
    propertyName === 'grid-auto-rows' ||
    propertyName === 'grid-template-columns' ||
    propertyName === 'grid-template-rows' ||
    propertyName === 'outline' ||
    propertyName === 'text-shadow' ||
    propertyName === 'transform' ||
    propertyName === 'translate'
  ) {
    return false
  }

  return true
}

function getResponsiveFunctionFallbackValue(value, targetUnit) {
  const functionParts = splitCssList(value)

  for (let index = functionParts.length - 1; index >= 0; index -= 1) {
    const matches = Array.from(functionParts[index].matchAll(CSS_LENGTH_GLOBAL_PATTERN))
    const lastMatch = matches.length ? matches[matches.length - 1] : null

    if (lastMatch) {
      return convertCssLengthValue(lastMatch[1], lastMatch[2], targetUnit)
    }
  }

  return ''
}

function convertResponsiveFunctions(value, targetUnit) {
  return String(value ?? '').replace(CSS_RESPONSIVE_FUNCTION_PATTERN, (match, _functionName, functionValue) => {
    return getResponsiveFunctionFallbackValue(functionValue, targetUnit) || match
  })
}

function resolveCssVariablesForEditor(value, variables = {}) {
  return String(value ?? '').replace(/var\(\s*(--[-_a-z0-9]+)\s*(?:,\s*([^()]+))?\)/gi, (match, variableName, fallbackValue) => {
    if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
      return normalizeRuleValue(variables[variableName])
    }

    return fallbackValue ? normalizeRuleValue(fallbackValue) : match
  })
}

function formatCssValueForEditor(property, value, variables = {}) {
  const normalizedValue = normalizeRuleValue(value)
  const resolvedValue = normalizeRuleValue(resolveCssVariablesForEditor(normalizedValue, variables))
  const targetUnit = getPreferredStyleUnit(property)

  if (!resolvedValue || !targetUnit) {
    return resolvedValue
  }

  const convertedValue = convertResponsiveFunctions(resolvedValue, targetUnit).replace(
    CSS_LENGTH_GLOBAL_PATTERN,
    (_match, size, unit) => convertCssLengthValue(size, unit, targetUnit),
  )

  if (CSS_NUMBER_VALUE_PATTERN.test(convertedValue) && shouldAppendUnitToNumber(property)) {
    return `${formatDecimal(Number(convertedValue))}${targetUnit}`
  }

  return convertedValue
}

function normalizeCssValueFromEditor(property, value) {
  return formatCssValueForEditor(property, value)
}

function formatCssMediaForEditor(media) {
  return normalizeRuleValue(media).replace(
    CSS_LENGTH_GLOBAL_PATTERN,
    (_match, size, unit) => convertCssLengthValue(size, unit, 'px'),
  )
}

function isSafeRuleValue(value) {
  const normalizedValue = normalizeRuleValue(value)
  return Boolean(
    normalizedValue &&
      SAFE_RULE_OVERRIDE_VALUE_PATTERN.test(normalizedValue) &&
      !UNSAFE_RULE_OVERRIDE_VALUE_PATTERN.test(normalizedValue),
  )
}

function hashString(value) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}

function getLineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

function findMatchingBrace(text, openIndex) {
  let depth = 0
  let quote = ''

  for (let index = openIndex; index < text.length; index += 1) {
    const character = text[index]
    const previousCharacter = text[index - 1]

    if (quote) {
      if (character === quote && previousCharacter !== '\\') {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function splitCssList(value, separator = ',') {
  const parts = []
  let quote = ''
  let depth = 0
  let startIndex = 0

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const previousCharacter = value[index - 1]

    if (quote) {
      if (character === quote && previousCharacter !== '\\') {
        quote = ''
      }
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
      continue
    }

    if (character === '(' || character === '[') {
      depth += 1
      continue
    }

    if (character === ')' || character === ']') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (character === separator && depth === 0) {
      parts.push(value.slice(startIndex, index).trim())
      startIndex = index + 1
    }
  }

  parts.push(value.slice(startIndex).trim())
  return parts.filter(Boolean)
}

function splitCssDeclarations(value) {
  return splitCssList(value, ';')
    .map((declaration) => {
      const colonIndex = declaration.indexOf(':')

      if (colonIndex <= 0) {
        return null
      }

      return {
        property: declaration.slice(0, colonIndex).trim().toLowerCase(),
        value: normalizeRuleValue(declaration.slice(colonIndex + 1)),
      }
    })
    .filter((declaration) => declaration?.property && declaration.value && /^[a-z-]+$/i.test(declaration.property))
}

function isPublicSiteSelector(selector) {
  const normalizedSelector = String(selector ?? '').replace(/\s+/g, ' ').trim()

  if (!normalizedSelector || IGNORED_SELECTOR_PATTERN.test(normalizedSelector)) {
    return false
  }

  return !normalizedSelector.startsWith('@')
}

function getRuleArea(selector) {
  const normalizedSelector = selector.toLowerCase()

  if (normalizedSelector.includes('utility') || normalizedSelector.includes('masthead') || normalizedSelector.includes('site-nav')) {
    return 'Header'
  }

  if (normalizedSelector.includes('footer')) {
    return 'Footer'
  }

  if (normalizedSelector.includes('home')) {
    return 'Home'
  }

  if (normalizedSelector.includes('property') || normalizedSelector.includes('listing') || normalizedSelector.includes('rental')) {
    return 'Rentals'
  }

  if (normalizedSelector.includes('charter')) {
    return 'Charters'
  }

  if (normalizedSelector.includes('block-')) {
    return 'Blocks'
  }

  if (normalizedSelector.includes('about')) {
    return 'About'
  }

  if (normalizedSelector.includes('local')) {
    return 'Local'
  }

  if (normalizedSelector.includes('ferry') || normalizedSelector.includes('barge') || normalizedSelector.includes('car-rental')) {
    return 'Transport'
  }

  if (normalizedSelector.includes('button') || normalizedSelector.includes('card') || normalizedSelector.includes('page-section')) {
    return 'Shared'
  }

  return 'Global'
}

function parseCssRuleCatalogFromText(sourceFile) {
  const text = String(sourceFile.text ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  const entries = []
  const seenIds = new Set()

  function addEntry(entry) {
    let id = hashString(`${entry.source}:${entry.media}:${entry.selector}:${entry.property}:${entry.originalValue}`)
    let suffix = 1

    while (seenIds.has(id)) {
      suffix += 1
      id = `${id}-${suffix}`
    }

    seenIds.add(id)
    entries.push({ ...entry, id })
  }

  function parseBlock(blockText, media = '') {
    let index = 0

    while (index < blockText.length) {
      const openIndex = blockText.indexOf('{', index)

      if (openIndex === -1) {
        break
      }

      const prelude = blockText.slice(index, openIndex).trim()
      const closeIndex = findMatchingBrace(blockText, openIndex)

      if (closeIndex === -1) {
        break
      }

      const body = blockText.slice(openIndex + 1, closeIndex)
      const normalizedPrelude = prelude.replace(/\s+/g, ' ')

      if (/^@(media|supports)\b/i.test(normalizedPrelude)) {
        parseBlock(body, media || normalizedPrelude)
      } else if (!normalizedPrelude.startsWith('@')) {
        const selectors = splitCssList(normalizedPrelude).filter(isPublicSiteSelector)
        const declarations = splitCssDeclarations(body).filter((declaration) => isSafeRuleValue(declaration.value))
        const line = getLineNumber(text, index)

        selectors.forEach((selector) => {
          declarations.forEach((declaration) => {
            addEntry({
              area: getRuleArea(selector),
              line,
              media,
              originalValue: declaration.value,
              property: declaration.property,
              selector,
              source: sourceFile.name,
              sourceLabel: sourceFile.label,
            })
          })
        })
      }

      index = closeIndex + 1
    }
  }

  parseBlock(text)
  return entries
}

function buildSiteStyleRuleCatalog() {
  return STYLE_RULE_SOURCE_FILES.flatMap(parseCssRuleCatalogFromText).sort((leftRule, rightRule) => {
    const areaComparison = leftRule.area.localeCompare(rightRule.area)

    if (areaComparison !== 0) {
      return areaComparison
    }

    const sourceComparison = leftRule.source.localeCompare(rightRule.source)

    if (sourceComparison !== 0) {
      return sourceComparison
    }

    return leftRule.line - rightRule.line
  })
}

const SITE_STYLE_RULE_CATALOG = buildSiteStyleRuleCatalog()
const SITE_STYLE_RULE_AREAS = Array.from(new Set(SITE_STYLE_RULE_CATALOG.map((rule) => rule.area))).sort()

function isBusyStatus(status) {
  return status === 'saving' || status === 'publishing'
}

function moveRow(rows, index, offset) {
  const nextIndex = index + offset

  if (nextIndex < 0 || nextIndex >= rows.length) {
    return rows
  }

  const nextRows = [...rows]
  const [row] = nextRows.splice(index, 1)
  nextRows.splice(nextIndex, 0, row)
  return nextRows
}

function normalizeTypedFontSizeValue(value) {
  const trimmedValue = String(value ?? '').trim()

  if (!trimmedValue) {
    return ''
  }

  const valueWithUnit = /^\d+(?:\.\d+)?$/.test(trimmedValue) ? `${trimmedValue}pt` : trimmedValue
  return normalizeRichTextFontSizeAsPoints(valueWithUnit)
}

function createCustomFontSizeRowId(rows) {
  const existingIds = new Set(rows.map((row) => row.id))
  let index = 1

  while (existingIds.has(`font-custom-${index}`)) {
    index += 1
  }

  return `font-custom-${index}`
}

function getCustomFontSizeValue(rows) {
  const existingValues = new Set(rows.map((row) => row.value))
  const candidates = ['16pt', '20pt', '24pt', '30pt', '36pt']
  const candidate = candidates.find((value) => !existingValues.has(value))

  if (candidate) {
    return candidate
  }

  for (let size = 14; size <= 72; size += 2) {
    const value = `${size}pt`

    if (!existingValues.has(value)) {
      return value
    }
  }

  return '16pt'
}

function createCustomFontSizeRow(rows) {
  const value = getCustomFontSizeValue(rows)

  return {
    custom: true,
    enabled: true,
    id: createCustomFontSizeRowId(rows),
    label: 'Custom Size',
    required: false,
    value,
  }
}

function createCustomElementStyleId(rows) {
  const existingIds = new Set(rows.map((row) => row.id))
  let index = 1

  while (existingIds.has(`custom-element-style-${index}`)) {
    index += 1
  }

  return `custom-element-style-${index}`
}

function createCustomElementStyle(rows) {
  return {
    custom: true,
    enabled: true,
    id: createCustomElementStyleId(rows),
    label: 'Custom Element Style',
    style: {
      align: 'left',
      background: { color: 'var(--surface-soft)', type: 'color' },
      border: 'none',
      borderRadius: 'small',
      color: '',
      spacing: 'medium',
      width: 'full',
    },
  }
}

function hasDuplicateFontSizeValue(rows, index, value) {
  return rows.some((row, rowIndex) => rowIndex !== index && row.value === value)
}

function getRichTextTagSizeField(tag) {
  return RICH_TEXT_TAG_SIZE_FIELDS[String(tag ?? '').trim().toLowerCase()] ?? null
}

function getRichTextTagSizeValue(typography = {}, tag = '') {
  const field = getRichTextTagSizeField(tag)

  if (!field) {
    return ''
  }

  return normalizeTypedFontSizeValue(typography[field.key]) || `${field.fallback}pt`
}

function StyleSheet({ className = '', columns, minWidth = '36rem', rows }) {
  const columnTemplate = columns.map((column) => column.width ?? 'minmax(0, 1fr)').join(' ')

  return (
    <div
      className={`admin-style-sheet${className ? ` ${className}` : ''}`}
      style={{ '--admin-style-sheet-columns': columnTemplate, '--admin-style-sheet-min-width': minWidth }}
    >
      <div className="admin-style-sheet-row admin-style-sheet-header">
        {columns.map((column) => (
          <div className={`admin-style-sheet-cell${column.className ? ` ${column.className}` : ''}`} key={column.label}>
            {column.label}
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div className={`admin-style-sheet-row${row.className ? ` ${row.className}` : ''}`} key={row.key}>
          {row.cells.map((cell, index) => {
            const hasCellConfig = cell && typeof cell === 'object' && Object.prototype.hasOwnProperty.call(cell, 'content')
            const cellConfig = hasCellConfig ? cell : { content: cell }
            const column = columns[index] ?? {}
            const classNames = ['admin-style-sheet-cell', column.cellClassName, cellConfig.className].filter(Boolean).join(' ')

            return (
              <div className={classNames} data-label={column.label} key={`${row.key}:${column.label ?? index}`}>
                {cellConfig.content}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ColorField({ disabled, hideLabel = false, label, onChange, value }) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')

  function commitDraft() {
    const normalizedDraft = draft.trim().toLowerCase()

    if (!HEX_COLOR_PATTERN.test(normalizedDraft)) {
      setDraft(value)
      setError('Use a 6-digit hex color.')
      return
    }

    if (normalizedDraft === value.toLowerCase()) {
      setDraft(value.toLowerCase())
      setError('')
      return
    }

    setError('')
    onChange(normalizedDraft)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }

    if (event.key === 'Escape') {
      setDraft(value)
      setError('')
    }
  }

  return (
    <label className={`admin-style-token-field${hideLabel ? ' admin-style-field--label-hidden' : ''}`}>
      <span>{label}</span>
      <div className="admin-style-color-control">
        <input
          aria-label={`${label} color picker`}
          disabled={disabled}
          type="color"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value.toLowerCase()
            setDraft(nextValue)
            setError('')
            if (nextValue !== value.toLowerCase()) {
              onChange(nextValue)
            }
          }}
        />
        <input
          aria-label={`${label} hex value`}
          aria-invalid={error ? 'true' : undefined}
          disabled={disabled}
          type="text"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      {error ? <small className="admin-style-editor-error">{error}</small> : null}
    </label>
  )
}

function CssValueField({ disabled, hideLabel = false, label, onChange, property = '', value, wide = false }) {
  const fieldProperty = property || label
  const displayValue = formatCssValueForEditor(fieldProperty, value)
  const [draft, setDraft] = useState(displayValue)
  const [error, setError] = useState('')

  function commitDraft() {
    const normalizedDraft = normalizeCssValueFromEditor(fieldProperty, draft)

    if (!normalizedDraft || normalizedDraft.length > 120 || !SAFE_STYLE_VALUE_PATTERN.test(normalizedDraft)) {
      setDraft(displayValue)
      setError('Use a simple CSS value.')
      return
    }

    if (normalizedDraft === displayValue || normalizedDraft === normalizeRuleValue(value)) {
      setDraft(displayValue)
      setError('')
      return
    }

    setError('')
    onChange(normalizedDraft)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }

    if (event.key === 'Escape') {
      setDraft(displayValue)
      setError('')
    }
  }

  return (
    <label className={`admin-field admin-style-css-field${wide ? ' admin-style-css-field--wide' : ''}${hideLabel ? ' admin-style-field--label-hidden' : ''}`.trim()}>
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        disabled={disabled}
        type="text"
        value={draft}
        onBlur={commitDraft}
        onChange={(event) => {
          setDraft(event.target.value)
          setError('')
        }}
        onKeyDown={handleKeyDown}
      />
      {error ? <small className="admin-style-editor-error">{error}</small> : null}
    </label>
  )
}

function getPointDraftValue(value, fallback = '12') {
  const pointValue = normalizeTypedFontSizeValue(value)

  if (pointValue) {
    return pointValue.replace(/pt$/, '')
  }

  const matches = Array.from(String(value ?? '').matchAll(/(\d+(?:\.\d+)?)(px|rem|em|pt)/gi))
  const lastMatch = matches.length ? matches[matches.length - 1] : null

  if (lastMatch) {
    const convertedValue = normalizeTypedFontSizeValue(`${lastMatch[1]}${lastMatch[2]}`)

    if (convertedValue) {
      return convertedValue.replace(/pt$/, '')
    }
  }

  return fallback
}

function PointSizeField({ disabled, fallback = '12', hideLabel = false, label, onChange, value, wide = false }) {
  const [draft, setDraft] = useState(() => getPointDraftValue(value, fallback))
  const [error, setError] = useState('')

  function commitDraft() {
    const normalizedValue = normalizeTypedFontSizeValue(draft)

    if (!normalizedValue) {
      setDraft(getPointDraftValue(value, fallback))
      setError('Use a point size from 6 to 72.')
      return
    }

    const numericValue = Number(normalizedValue.replace(/pt$/, ''))

    if (!Number.isFinite(numericValue) || numericValue < 6 || numericValue > 72) {
      setDraft(getPointDraftValue(value, fallback))
      setError('Use a point size from 6 to 72.')
      return
    }

    setDraft(normalizedValue.replace(/pt$/, ''))
    setError('')
    onChange(normalizedValue)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }

    if (event.key === 'Escape') {
      setDraft(getPointDraftValue(value, fallback))
      setError('')
    }
  }

  return (
    <label className={`admin-field admin-style-css-field${wide ? ' admin-style-css-field--wide' : ''}${hideLabel ? ' admin-style-field--label-hidden' : ''}`.trim()}>
      <span>{label}</span>
      <div className="admin-style-point-control">
        <input
          aria-label={`${label} point size`}
          aria-invalid={error ? 'true' : undefined}
          disabled={disabled}
          max="72"
          min="6"
          step="0.5"
          type="number"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
        />
        <span>pt</span>
      </div>
      {error ? <small className="admin-style-editor-error">{error}</small> : null}
    </label>
  )
}

function SelectField({ disabled, hideLabel = false, label, onChange, options, value }) {
  return (
    <label className={`admin-field admin-style-css-field${hideLabel ? ' admin-style-field--label-hidden' : ''}`}>
      <span>{label}</span>
      <select aria-label={label} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function RangeField({ disabled, hideLabel = false, label, max, min, onChange, step, value }) {
  return (
    <label className={`admin-style-range-field${hideLabel ? ' admin-style-field--label-hidden' : ''}`}>
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          disabled={disabled}
          max={max}
          min={min}
          step={step}
          type="range"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <output>{value}</output>
      </div>
    </label>
  )
}

function RuleValueField({ disabled, label, onChange, property, value, variables }) {
  const displayValue = formatCssValueForEditor(property, value, variables)
  const [draft, setDraft] = useState(displayValue)
  const [error, setError] = useState('')

  function commitDraft() {
    const normalizedDraft = normalizeCssValueFromEditor(property, draft)

    if (!isSafeRuleValue(normalizedDraft)) {
      setDraft(displayValue)
      setError('Use a safe CSS value.')
      return
    }

    if (normalizedDraft === displayValue || normalizedDraft === normalizeRuleValue(value)) {
      setDraft(displayValue)
      setError('')
      return
    }

    setDraft(formatCssValueForEditor(property, normalizedDraft, variables))
    setError('')
    onChange(normalizedDraft)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }

    if (event.key === 'Escape') {
      setDraft(displayValue)
      setError('')
    }
  }

  if (HEX_COLOR_PATTERN.test(displayValue)) {
    const handleColorChange = (nextValue) => {
      if (nextValue === displayValue || nextValue === normalizeRuleValue(value)) {
        return
      }

      onChange(nextValue)
    }

    return <ColorField hideLabel disabled={disabled} label={label} value={displayValue} onChange={handleColorChange} />
  }

  return (
    <label className="admin-field admin-style-css-field admin-style-field--label-hidden">
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        disabled={disabled}
        type="text"
        value={draft}
        onBlur={commitDraft}
        onChange={(event) => {
          setDraft(event.target.value)
          setError('')
        }}
        onKeyDown={handleKeyDown}
      />
      {error ? <small className="admin-style-editor-error">{error}</small> : null}
    </label>
  )
}

function getRuleCurrentValue(theme, rule) {
  return normalizeRuleValue(theme.ruleOverrides?.[rule.id]?.value) || rule.originalValue
}

function SiteRuleEditor({ disabled, onResetRule, onRuleValueChange, theme }) {
  const [areaFilter, setAreaFilter] = useState('All')
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const overriddenCount = Object.keys(theme.ruleOverrides ?? {}).length
  const themeVariables = getSiteThemeCssProperties(theme)
  const visibleRules = SITE_STYLE_RULE_CATALOG.filter((rule) => {
    if (areaFilter !== 'All' && rule.area !== areaFilter) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    const searchableValue = formatCssValueForEditor(rule.property, rule.originalValue, themeVariables)
    const searchableMedia = formatCssMediaForEditor(rule.media)

    return `${rule.area} ${rule.selector} ${rule.property} ${rule.originalValue} ${searchableValue} ${searchableMedia}`
      .toLowerCase()
      .includes(normalizedQuery)
  })

  return (
    <section className="admin-style-control-group">
      <div className="admin-style-control-group-header">
        <div>
          <h4>Rules</h4>
          <p>
            {visibleRules.length} shown of {SITE_STYLE_RULE_CATALOG.length}. {overriddenCount} changed.
          </p>
        </div>
        <button className="button-link button-link--ghost admin-action" disabled={disabled || overriddenCount === 0} type="button" onClick={() => onResetRule()}>
          Reset Rules
        </button>
      </div>

      <div className="admin-style-rules-toolbar">
        <label className="admin-field admin-style-css-field">
          <span>Find</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="admin-field admin-style-css-field">
          <span>Area</span>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
            <option value="All">All</option>
            {SITE_STYLE_RULE_AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StyleSheet
        className="admin-style-sheet--rules"
        minWidth="78rem"
        columns={[
          { label: 'Area', width: 'minmax(7rem, 0.55fr)', cellClassName: 'admin-style-sheet-cell--name' },
          { label: 'Selector', width: 'minmax(18rem, 1.6fr)' },
          { label: 'Property', width: 'minmax(9rem, 0.8fr)' },
          { label: 'Value', width: 'minmax(16rem, 1.35fr)' },
          { label: 'Original', width: 'minmax(14rem, 1.1fr)' },
          { label: 'Source', width: 'minmax(9rem, 0.7fr)' },
          { label: '', width: 'minmax(6rem, 0.45fr)', cellClassName: 'admin-style-sheet-cell--actions' },
        ]}
        rows={visibleRules.map((rule) => {
          const currentValue = getRuleCurrentValue(theme, rule)
          const currentEditorValue = formatCssValueForEditor(rule.property, currentValue, themeVariables)
          const isOverridden = currentValue !== rule.originalValue

          return {
            className: isOverridden ? 'admin-style-rule-row admin-style-rule-row--changed' : 'admin-style-rule-row',
            key: rule.id,
            cells: [
              { content: <strong>{rule.area}</strong> },
              {
                content: (
                  <div className="admin-style-rule-selector">
                    <code>{rule.selector}</code>
                    {rule.media ? <span>{formatCssMediaForEditor(rule.media)}</span> : null}
                  </div>
                ),
              },
              { content: <code className="admin-style-rule-property">{rule.property}</code> },
              <RuleValueField
                disabled={disabled}
                key={`${rule.id}:${currentEditorValue}`}
                label={`${rule.selector} ${rule.property}`}
                property={rule.property}
                value={currentValue}
                variables={themeVariables}
                onChange={(nextValue) => onRuleValueChange(rule, nextValue)}
              />,
              {
                content: (
                  <code className="admin-style-rule-original">
                    {formatCssValueForEditor(rule.property, rule.originalValue, themeVariables)}
                  </code>
                ),
              },
              {
                content: (
                  <span className="admin-style-rule-source">
                    {rule.source}:{rule.line}
                  </span>
                ),
              },
              {
                className: 'admin-style-sheet-cell--actions',
                content: (
                  <button
                    className="button-link button-link--ghost admin-action admin-style-rule-reset"
                    disabled={disabled || !isOverridden}
                    type="button"
                    onClick={() => onResetRule(rule.id)}
                  >
                    Reset
                  </button>
                ),
              },
            ],
          }
        })}
      />
    </section>
  )
}

function ThemePreview({ theme }) {
  const style = getSiteThemeCssProperties(theme)
  const normalizedTheme = normalizeSiteThemeSettings(theme)
  const swatches = [
    { label: 'Primary', value: normalizedTheme.colors.buttonPrimaryBackground },
    { label: 'CTA', value: normalizedTheme.colors.homeBand },
    { label: 'Link', value: normalizedTheme.colors.brandBlue },
    { label: 'Card', value: normalizedTheme.colors.cardBackground },
  ]

  return (
    <section className="admin-style-preview" style={style}>
      <div className="admin-style-preview-swatches">
        {swatches.map((swatch) => (
          <span key={swatch.label}>
            <i style={{ backgroundColor: swatch.value }} />
            {swatch.label}
          </span>
        ))}
      </div>
      <div className="admin-style-preview-hero">
        <div>
          <p className="eyebrow">Featured Rental</p>
          <h3>Island homes with a calmer booking flow</h3>
          <p>
            See how the theme affects headings, body copy, links, action buttons, cards, borders, shadows, and content bands.
          </p>
          <div className="admin-style-preview-actions">
            <span className="button-link button-link--primary">Check Availability</span>
            <span className="button-link button-link--secondary">Contact Owner</span>
            <span className="button-link button-link--ghost">View Details</span>
          </div>
        </div>
      </div>
      <div className="admin-style-preview-grid">
        <article>
          <div className="admin-style-preview-media" />
          <span>Card Surface</span>
          <strong>Coral Bay Cottage</strong>
          <p>Muted supporting text, border color, and shadow treatment.</p>
          <em>Featured</em>
        </article>
        <article className="admin-style-preview-rich-text">
          <span>Rich Text</span>
          <h4>Content heading</h4>
          <h5>Subheading</h5>
          <p>Paragraph text follows the default P size used by editable page content.</p>
        </article>
        <article className="admin-style-preview-band">
          <span>CTA Band</span>
          <strong>Plan your stay</strong>
          <p>Primary band color with readable light text.</p>
        </article>
      </div>
    </section>
  )
}

function SiteThemeEditor({
  canPublish = false,
  disabled,
  editorStyleSettings,
  feedback = '',
  onEditorStyleChange,
  onChange,
  onPublish,
  onResetRichText,
  onSave,
  onTagSizeChange,
  publication,
  saveStatus = 'idle',
  siteShell,
  siteShellDirty = false,
}) {
  const theme = normalizeSiteThemeSettings(siteShell?.theme)
  const hasPendingPublication = canPublish && publication?.hasUnpublishedChanges === true
  const busy = isBusyStatus(saveStatus)
  const ruleOverrideCssText = getSiteThemeRuleOverrideCssText(theme)
  const cssText = [`.site-shell {\n${getSiteThemeCssText(theme)}\n}`, ruleOverrideCssText].filter(Boolean).join('\n\n')

  function updateThemeToken(group, key, nextValue) {
    if (!siteShell || disabled) {
      return
    }

    onChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)
      const nextTheme = normalizeSiteThemeSettings({
        ...currentTheme,
        [group]: {
          ...currentTheme[group],
          [key]: nextValue,
        },
      })

      return {
        ...shell,
        theme: nextTheme,
      }
    })
  }

  function resetTheme() {
    if (!siteShell || disabled) {
      return
    }

    onChange?.((currentShell) => ({
      ...(currentShell && typeof currentShell === 'object' ? currentShell : siteShell),
      theme: getDefaultSiteThemeSettings(),
    }))
  }

  function updateElementStylePresets(nextElementStyles) {
    if (!siteShell || disabled) {
      return
    }

    onChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)

      return {
        ...shell,
        theme: normalizeSiteThemeSettings({
          ...currentTheme,
          elementStyles: nextElementStyles,
        }),
      }
    })
  }

  function updateRuleOverride(rule, nextValue) {
    if (!siteShell || disabled) {
      return
    }

    const normalizedValue = normalizeRuleValue(nextValue)

    if (!isSafeRuleValue(normalizedValue)) {
      return
    }

    onChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)
      const themeVariables = getSiteThemeCssProperties(currentTheme)
      const nextRuleOverrides = { ...currentTheme.ruleOverrides }

      if (
        normalizedValue === rule.originalValue ||
        normalizedValue === formatCssValueForEditor(rule.property, rule.originalValue, themeVariables)
      ) {
        delete nextRuleOverrides[rule.id]
      } else {
        nextRuleOverrides[rule.id] = {
          media: rule.media,
          property: rule.property,
          selector: rule.selector,
          value: normalizedValue,
        }
      }

      return {
        ...shell,
        theme: normalizeSiteThemeSettings({
          ...currentTheme,
          ruleOverrides: nextRuleOverrides,
        }),
      }
    })
  }

  function resetRuleOverride(ruleId) {
    if (!siteShell || disabled) {
      return
    }

    onChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)

      if (!ruleId) {
        return {
          ...shell,
          theme: normalizeSiteThemeSettings({
            ...currentTheme,
            ruleOverrides: {},
          }),
        }
      }

      const nextRuleOverrides = { ...currentTheme.ruleOverrides }
      delete nextRuleOverrides[ruleId]

      return {
        ...shell,
        theme: normalizeSiteThemeSettings({
          ...currentTheme,
          ruleOverrides: nextRuleOverrides,
        }),
      }
    })
  }

  return (
    <section className="admin-style-editor-section admin-style-editor-section--theme">
      <div className="admin-style-editor-toolbar">
        <div>
          <p>Preview changes, then save or publish.</p>
        </div>
        <div className="admin-style-editor-actions">
          <button className="button-link button-link--ghost admin-action" disabled={disabled || busy} type="button" onClick={resetTheme}>
            Reset All
          </button>
          <button className="button-link button-link--secondary admin-action" disabled={disabled || busy || !siteShellDirty} type="button" onClick={onSave}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            className="button-link button-link--primary admin-action"
            disabled={disabled || busy || siteShellDirty || !hasPendingPublication}
            type="button"
            onClick={onPublish}
          >
            {saveStatus === 'publishing' ? 'Publishing...' : 'Publish Live'}
          </button>
        </div>
      </div>

      {feedback ? <p className={`admin-feedback admin-feedback--${saveStatus === 'publishing' ? 'saving' : saveStatus}`}>{feedback}</p> : null}

      {!siteShell ? (
        <p className="admin-empty">Load site data before editing.</p>
      ) : (
        <div className="admin-style-editor-layout">
          <div className="admin-style-editor-controls">
            <section className="admin-style-control-group">
              <div className="admin-style-control-group-header">
                <h4>Text</h4>
                <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={onResetRichText}>
                  Reset Text
                </button>
              </div>
              <div className="admin-style-control-stack">
                <div className="admin-style-control-subgroup">
                  <h5>Fonts</h5>
                  <StyleSheet
                    className="admin-style-sheet--text-fonts"
                    minWidth="60rem"
                    columns={[
                      { label: 'Body Font', width: 'minmax(12rem, 1.1fr)' },
                      { label: 'Heading Font', width: 'minmax(12rem, 1.1fr)' },
                      { label: 'Heading Weight', width: 'minmax(9rem, 0.75fr)' },
                      { label: 'Accent Weight', width: 'minmax(9rem, 0.75fr)' },
                      { label: 'Accent Spacing', width: 'minmax(9rem, 0.75fr)' },
                      ...TEXT_SPACING_FIELDS.map((field) => ({ label: field.label, width: 'minmax(8rem, 0.65fr)' })),
                    ]}
                    rows={[
                      {
                        key: 'text-fonts',
                        cells: [
                          <SelectField
                            hideLabel
                            disabled={disabled}
                            label="Body Font"
                            options={BODY_FONT_OPTIONS}
                            value={theme.typography.bodyFont}
                            onChange={(nextValue) => updateThemeToken('typography', 'bodyFont', nextValue)}
                          />,
                          <SelectField
                            hideLabel
                            disabled={disabled}
                            label="Heading Font"
                            options={DISPLAY_FONT_OPTIONS}
                            value={theme.typography.displayFont}
                            onChange={(nextValue) => updateThemeToken('typography', 'displayFont', nextValue)}
                          />,
                          <SelectField
                            hideLabel
                            disabled={disabled}
                            label="Heading Weight"
                            options={HEADING_WEIGHT_OPTIONS}
                            value={theme.typography.headingWeight}
                            onChange={(nextValue) => updateThemeToken('typography', 'headingWeight', nextValue)}
                          />,
                          <SelectField
                            hideLabel
                            disabled={disabled}
                            label="Accent Weight"
                            options={ACCENT_WEIGHT_OPTIONS}
                            value={theme.typography.accentWeight}
                            onChange={(nextValue) => updateThemeToken('typography', 'accentWeight', nextValue)}
                          />,
                          <CssValueField
                            hideLabel
                            disabled={disabled}
                            key={`accentSpacing:${theme.typography.accentSpacing}`}
                            label="Accent Spacing"
                            property="letter-spacing"
                            value={theme.typography.accentSpacing}
                            onChange={(nextValue) => updateThemeToken('typography', 'accentSpacing', nextValue)}
                          />,
                          ...TEXT_SPACING_FIELDS.map((field) => (
                            <CssValueField
                              hideLabel
                              disabled={disabled}
                              key={`${field.key}:${theme[field.group][field.key]}`}
                              label={field.label}
                              property={field.property}
                              value={theme[field.group][field.key]}
                              onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                            />
                          )),
                        ],
                      },
                    ]}
                  />
                </div>

                <div className="admin-style-control-subgroup">
                  <h5>Sizes</h5>
                  <StyleSheet
                    className="admin-style-sheet--text-sizes"
                    minWidth="42rem"
                    columns={SITE_TEXT_SIZE_FIELDS.map((field) => ({ label: field.label, width: 'minmax(8rem, 1fr)' }))}
                    rows={[
                      {
                        key: 'text-sizes',
                        cells: SITE_TEXT_SIZE_FIELDS.map((field) => (
                          <PointSizeField
                            hideLabel
                            disabled={disabled}
                            fallback={field.fallback}
                            key={`${field.key}:${theme[field.group][field.key]}`}
                            label={field.label}
                            value={theme[field.group][field.key]}
                            onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                          />
                        )),
                      },
                    ]}
                  />
                </div>

                <StyleRows
                  compact
                  disabled={disabled}
                  kind="blockStyles"
                  rows={editorStyleSettings.blockStyles}
                  tagSizeDisabled={!siteShell || !onChange}
                  title="Content Tags"
                  typography={theme.typography}
                  onTagSizeChange={onTagSizeChange}
                  onChange={onEditorStyleChange}
                />

                <StyleRows
                  compact
                  disabled={disabled}
                  kind="fontSizes"
                  rows={editorStyleSettings.fontSizes}
                  title="Inline Sizes"
                  onChange={onEditorStyleChange}
                />
              </div>
            </section>

            <section className="admin-style-control-group">
              <h4>Colors</h4>
              <div className="admin-style-control-stack">
                {COLOR_GROUPS.map((group) => (
                  <div className="admin-style-control-subgroup" key={group.title}>
                    <h5>{group.title}</h5>
                    <StyleSheet
                      className="admin-style-sheet--colors"
                      minWidth="32rem"
                      columns={[
                        { label: 'Token', width: 'minmax(10rem, 0.8fr)', cellClassName: 'admin-style-sheet-cell--name' },
                        { label: 'Value', width: 'minmax(13rem, 1fr)' },
                      ]}
                      rows={group.fields.map((field) => ({
                        key: field.key,
                        cells: [
                          { content: <strong>{field.label}</strong> },
                          <ColorField
                            hideLabel
                            disabled={disabled}
                            key={`${field.key}:${theme[field.group][field.key]}`}
                            label={field.label}
                            value={theme[field.group][field.key]}
                            onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                          />,
                        ],
                      }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-style-control-group">
              <h4>Buttons</h4>
              <div className="admin-style-control-stack">
                <div className="admin-style-control-subgroup">
                  <h5>Colors</h5>
                  <StyleSheet
                    className="admin-style-sheet--colors"
                    minWidth="32rem"
                    columns={[
                      { label: 'Token', width: 'minmax(10rem, 0.8fr)', cellClassName: 'admin-style-sheet-cell--name' },
                      { label: 'Value', width: 'minmax(13rem, 1fr)' },
                    ]}
                    rows={BUTTON_COLOR_FIELDS.map((field) => ({
                      key: field.key,
                      cells: [
                        { content: <strong>{field.label}</strong> },
                        <ColorField
                          hideLabel
                          disabled={disabled}
                          key={`${field.key}:${theme[field.group][field.key]}`}
                          label={field.label}
                          property={field.property}
                          value={theme[field.group][field.key]}
                          onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                        />,
                      ],
                    }))}
                  />
                </div>
                <div className="admin-style-control-subgroup">
                  <h5>Shape</h5>
                  <StyleSheet
                    className="admin-style-sheet--values"
                    minWidth="32rem"
                    columns={[
                      { label: 'Setting', width: 'minmax(10rem, 0.8fr)', cellClassName: 'admin-style-sheet-cell--name' },
                      { label: 'Value', width: 'minmax(13rem, 1fr)' },
                    ]}
                    rows={BUTTON_COMPONENT_FIELDS.map((field) => ({
                      key: field.key,
                      cells: [
                        { content: <strong>{field.label}</strong> },
                        <CssValueField
                          hideLabel
                          disabled={disabled}
                          key={`${field.key}:${theme[field.group][field.key]}`}
                          label={field.label}
                          value={theme[field.group][field.key]}
                          onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                        />,
                      ],
                    }))}
                  />
                </div>
              </div>
            </section>

            <section className="admin-style-control-group">
              <h4>Cards & Sections</h4>
              <StyleSheet
                className="admin-style-sheet--values"
                minWidth="32rem"
                columns={[
                  { label: 'Setting', width: 'minmax(10rem, 0.8fr)', cellClassName: 'admin-style-sheet-cell--name' },
                  { label: 'Value', width: 'minmax(13rem, 1fr)' },
                ]}
                rows={[
                  ...SECTION_COMPONENT_FIELDS.map((field) => ({
                    key: field.key,
                    cells: [
                      { content: <strong>{field.label}</strong> },
                      <CssValueField
                        hideLabel
                        disabled={disabled}
                        key={`${field.key}:${theme[field.group][field.key]}`}
                        label={field.label}
                        property={field.property}
                        value={theme[field.group][field.key]}
                        onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                      />,
                    ],
                  })),
                  {
                    key: 'heroOverlayOpacity',
                    cells: [
                      { content: <strong>Hero Overlay</strong> },
                      <RangeField
                        hideLabel
                        disabled={disabled}
                        label="Hero Overlay"
                        max="0.75"
                        min="0"
                        step="0.01"
                        value={theme.components.heroOverlayOpacity}
                        onChange={(nextValue) => updateThemeToken('components', 'heroOverlayOpacity', nextValue)}
                      />,
                    ],
                  },
                ]}
              />
            </section>

            <ElementStyleRows
              disabled={disabled}
              rows={getSiteThemeElementStylePresets(theme)}
              title="Element Styles"
              onChange={updateElementStylePresets}
            />

            <section className="admin-style-control-group">
              <h4>Layout</h4>
              <StyleSheet
                className="admin-style-sheet--values"
                minWidth="32rem"
                columns={[
                  { label: 'Setting', width: 'minmax(10rem, 0.8fr)', cellClassName: 'admin-style-sheet-cell--name' },
                  { label: 'Value', width: 'minmax(13rem, 1fr)' },
                ]}
                rows={LAYOUT_FIELDS.map((field) => ({
                  key: field.key,
                  cells: [
                    { content: <strong>{field.label}</strong> },
                    <CssValueField
                      hideLabel
                      disabled={disabled}
                      key={`${field.key}:${theme[field.group][field.key]}`}
                      label={field.label}
                      property={field.property}
                      value={theme[field.group][field.key]}
                      onChange={(nextValue) => updateThemeToken(field.group, field.key, nextValue)}
                    />,
                  ],
                }))}
              />
            </section>

            <SiteRuleEditor
              disabled={disabled}
              theme={theme}
              onResetRule={resetRuleOverride}
              onRuleValueChange={updateRuleOverride}
            />
          </div>

          <div className="admin-style-editor-preview-column">
            <ThemePreview theme={theme} />
            <details className="admin-style-css-output">
              <summary>Advanced CSS</summary>
              <textarea readOnly rows={12} value={cssText} />
            </details>
          </div>
        </div>
      )}
    </section>
  )
}

function BlockSample({ size, value }) {
  const Tag = /^h[1-6]$/.test(value) ? value : 'p'
  return (
    <Tag className="admin-style-editor-sample-text" style={size ? { fontSize: size } : undefined}>
      Sample text
    </Tag>
  )
}

function FontSizeSample({ value }) {
  const style = value === 'default' ? undefined : { fontSize: value }
  return (
    <span className="admin-style-editor-font-sample" style={style}>
      Aa
    </span>
  )
}

function FontSizeValueField({ disabled, hideLabel = false, index, onChange, row, rows }) {
  const [draft, setDraft] = useState(() => getPointDraftValue(row.value, '12'))
  const [error, setError] = useState('')

  function commitDraft() {
    const normalizedValue = normalizeTypedFontSizeValue(draft)

    if (!normalizedValue || normalizedValue === 'default') {
      setDraft(getPointDraftValue(row.value, '12'))
      setError('Use a point size from 6 to 72.')
      return false
    }

    const numericValue = Number(normalizedValue.replace(/pt$/, ''))

    if (!Number.isFinite(numericValue) || numericValue < 6 || numericValue > 72) {
      setDraft(getPointDraftValue(row.value, '12'))
      setError('Use a point size from 6 to 72.')
      return false
    }

    if (hasDuplicateFontSizeValue(rows, index, normalizedValue)) {
      setError('This size already exists.')
      return false
    }

    setDraft(normalizedValue.replace(/pt$/, ''))
    setError('')

    if (normalizedValue !== row.value) {
      onChange(index, { value: normalizedValue })
    }

    return true
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    }

    if (event.key === 'Escape') {
      setDraft(getPointDraftValue(row.value, '12'))
      setError('')
    }
  }

  return (
    <label className={`admin-field admin-style-editor-value-field${hideLabel ? ' admin-style-field--label-hidden' : ''}`}>
      <span>Point Size</span>
      <div className="admin-style-point-control">
        <input
          aria-label={`${row.label} point size`}
          aria-invalid={error ? 'true' : undefined}
          disabled={disabled}
          max="72"
          min="6"
          step="0.5"
          type="number"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.target.value)
            setError('')
          }}
          onKeyDown={handleKeyDown}
        />
        <span>pt</span>
      </div>
      {error ? <small className="admin-style-editor-error">{error}</small> : null}
    </label>
  )
}

function StaticStyleValue({ value }) {
  return (
    <div className="admin-style-editor-value admin-style-editor-value--static">
      <code>{value}</code>
    </div>
  )
}

function ElementStyleRows({ disabled, onChange, rows, title }) {
  function updateRow(index, patch) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  function updateStyle(index, patch) {
    const currentStyle = rows[index]?.style ?? {}
    updateRow(index, {
      style: {
        ...currentStyle,
        ...patch,
      },
    })
  }

  function updateBackgroundColor(index, value) {
    updateStyle(index, {
      background: value ? { color: value, type: 'color' } : { color: '', type: 'none' },
    })
  }

  function moveOption(index, offset) {
    onChange(moveRow(rows, index, offset))
  }

  function addElementStyle() {
    onChange([...rows, createCustomElementStyle(rows)])
  }

  function removeElementStyle(index) {
    onChange(rows.filter((_row, rowIndex) => rowIndex !== index))
  }

  return (
    <section className="admin-style-control-group">
      <div className="admin-content-section-header">
        <div>
          <h4>{title}</h4>
        </div>
        <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={addElementStyle}>
          Add Style
        </button>
      </div>

      <StyleSheet
        className="admin-style-sheet--element-styles"
        minWidth="92rem"
        columns={[
          { label: 'Use', width: 'minmax(5.5rem, 0.4fr)' },
          { label: 'Name', width: 'minmax(12rem, 1fr)' },
          { label: 'Width', width: 'minmax(8rem, 0.65fr)' },
          { label: 'Spacing', width: 'minmax(8rem, 0.65fr)' },
          { label: 'Background', width: 'minmax(11rem, 0.85fr)' },
          { label: 'Text', width: 'minmax(11rem, 0.85fr)' },
          { label: 'Align', width: 'minmax(8rem, 0.65fr)' },
          { label: 'Border', width: 'minmax(8rem, 0.65fr)' },
          { label: 'Corners', width: 'minmax(9rem, 0.7fr)' },
          { label: 'Order', width: 'minmax(12rem, 0.9fr)', cellClassName: 'admin-style-sheet-cell--actions' },
        ]}
        rows={rows.map((row, index) => {
          const style = row.style ?? {}
          const backgroundValue = style.background?.type === 'color' ? style.background.color : ''

          return {
            className: 'admin-style-editor-row',
            key: row.id,
            cells: [
              <label className="admin-checkbox-field admin-style-editor-toggle">
                <input
                  aria-label={`${row.label} enabled`}
                  checked={row.enabled}
                  disabled={disabled}
                  type="checkbox"
                  onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                />
                <span>On</span>
              </label>,
              <label className="admin-field admin-style-editor-label-field admin-style-field--label-hidden">
                <span>Style Name</span>
                <input
                  aria-label={`${row.id} style name`}
                  disabled={disabled}
                  type="text"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                />
              </label>,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} width`}
                options={BLOCK_WIDTH_SELECT_OPTIONS}
                value={style.width}
                onChange={(nextValue) => updateStyle(index, { width: nextValue })}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} spacing`}
                options={BLOCK_SPACING_SELECT_OPTIONS}
                value={style.spacing}
                onChange={(nextValue) => updateStyle(index, { spacing: nextValue })}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} background`}
                options={ELEMENT_STYLE_COLOR_OPTIONS}
                value={backgroundValue}
                onChange={(nextValue) => updateBackgroundColor(index, nextValue)}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} text color`}
                options={ELEMENT_STYLE_COLOR_OPTIONS}
                value={style.color ?? ''}
                onChange={(nextValue) => updateStyle(index, { color: nextValue })}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} alignment`}
                options={BLOCK_ALIGN_SELECT_OPTIONS}
                value={style.align}
                onChange={(nextValue) => updateStyle(index, { align: nextValue })}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} border`}
                options={BLOCK_BORDER_SELECT_OPTIONS}
                value={style.border}
                onChange={(nextValue) => updateStyle(index, { border: nextValue })}
              />,
              <SelectField
                hideLabel
                disabled={disabled}
                label={`${row.label} corners`}
                options={BLOCK_RADIUS_SELECT_OPTIONS}
                value={style.borderRadius}
                onChange={(nextValue) => updateStyle(index, { borderRadius: nextValue })}
              />,
              {
                className: 'admin-style-sheet-cell--actions',
                content: (
                  <div className="admin-style-editor-row-actions">
                    <button
                      aria-label={`Move ${row.label} up`}
                      className="button-link button-link--ghost admin-action"
                      disabled={disabled || index === 0}
                      type="button"
                      onClick={() => moveOption(index, -1)}
                    >
                      Up
                    </button>
                    <button
                      aria-label={`Move ${row.label} down`}
                      className="button-link button-link--ghost admin-action"
                      disabled={disabled || index === rows.length - 1}
                      type="button"
                      onClick={() => moveOption(index, 1)}
                    >
                      Down
                    </button>
                    {row.custom ? (
                      <button
                        className="button-link button-link--ghost admin-action"
                        disabled={disabled}
                        type="button"
                        onClick={() => removeElementStyle(index)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ),
              },
            ],
          }
        })}
      />
    </section>
  )
}

function StyleRows({ compact = false, disabled, kind, onChange, onTagSizeChange, rows, tagSizeDisabled = false, title, typography }) {
  const isBlockStyle = kind === 'blockStyles'
  const isFontSizeStyle = kind === 'fontSizes'

  function updateRow(index, patch) {
    onChange({
      [kind]: rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    })
  }

  function moveOption(index, offset) {
    onChange({
      [kind]: moveRow(rows, index, offset),
    })
  }

  function addFontSize() {
    onChange({
      [kind]: [...rows, createCustomFontSizeRow(rows)],
    })
  }

  function removeOption(index) {
    onChange({
      [kind]: rows.filter((_row, rowIndex) => rowIndex !== index),
    })
  }

  const columns = isBlockStyle
    ? [
        { label: 'Use', width: 'minmax(5.5rem, 0.45fr)' },
        { label: 'Tag', width: 'minmax(4.5rem, 0.4fr)' },
        { label: 'Toolbar Label', width: 'minmax(10rem, 1fr)' },
        { label: 'Default', width: 'minmax(8rem, 0.75fr)' },
        { label: 'Sample', width: 'minmax(8rem, 1fr)' },
        { label: 'Order', width: 'minmax(9rem, 0.85fr)', cellClassName: 'admin-style-sheet-cell--actions' },
      ]
    : [
        { label: 'Use', width: 'minmax(5.5rem, 0.45fr)' },
        { label: 'Toolbar Label', width: 'minmax(10rem, 1fr)' },
        { label: 'Size', width: 'minmax(8rem, 0.75fr)' },
        { label: 'Sample', width: 'minmax(8rem, 1fr)' },
        { label: 'Order', width: 'minmax(9rem, 0.85fr)', cellClassName: 'admin-style-sheet-cell--actions' },
      ]

  return (
    <section className={compact ? 'admin-style-nested-list' : 'admin-style-editor-section'}>
      <div className="admin-content-section-header">
        <div>
          <h4>{title}</h4>
        </div>
        {isFontSizeStyle ? (
          <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={addFontSize}>
            Add Size
          </button>
        ) : null}
      </div>

      <div className="admin-style-editor-list">
        <StyleSheet
          className={`admin-style-sheet--rows admin-style-sheet--${kind}`}
          minWidth={isBlockStyle ? '56rem' : '48rem'}
          columns={columns}
          rows={rows.map((row, index) => {
            const tagField = isBlockStyle ? getRichTextTagSizeField(row.value) : null
            const tagSize = isBlockStyle ? getRichTextTagSizeValue(typography, row.value) : ''
            const toggleCell = (
              <label className="admin-checkbox-field admin-style-editor-toggle">
                <input
                  aria-label={`${row.label} enabled`}
                  checked={row.enabled}
                  disabled={disabled || row.required}
                  type="checkbox"
                  onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                />
                <span>{row.required ? 'Required' : 'On'}</span>
              </label>
            )
            const labelCell = (
              <label className="admin-field admin-style-editor-label-field admin-style-field--label-hidden">
                <span>Toolbar Label</span>
                <input
                  aria-label={`${row.value} toolbar label`}
                  disabled={disabled}
                  type="text"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                />
              </label>
            )
            const sizeCell = isBlockStyle ? (
              tagField ? (
                <PointSizeField
                  hideLabel
                  disabled={disabled || tagSizeDisabled}
                  fallback={tagField.fallback}
                  key={`${row.value}:${tagSize}`}
                  label={`${row.value} default size`}
                  value={tagSize}
                  onChange={(nextValue) => onTagSizeChange?.(row.value, nextValue)}
                />
              ) : (
                <StaticStyleValue value="-" />
              )
            ) : row.required ? (
              <StaticStyleValue value={row.value} />
            ) : (
              <FontSizeValueField hideLabel key={row.value} disabled={disabled} index={index} row={row} rows={rows} onChange={updateRow} />
            )
            const sampleCell = (
              <div className="admin-style-editor-sample">
                {isBlockStyle ? <BlockSample size={tagSize} value={row.value} /> : <FontSizeSample value={row.value} />}
              </div>
            )
            const actionsCell = (
              <div className="admin-style-editor-row-actions">
                <button
                  aria-label={`Move ${row.label} up`}
                  className="button-link button-link--ghost admin-action"
                  disabled={disabled || index === 0}
                  type="button"
                  onClick={() => moveOption(index, -1)}
                >
                  Up
                </button>
                <button
                  aria-label={`Move ${row.label} down`}
                  className="button-link button-link--ghost admin-action"
                  disabled={disabled || index === rows.length - 1}
                  type="button"
                  onClick={() => moveOption(index, 1)}
                >
                  Down
                </button>
                {isFontSizeStyle && row.custom ? (
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled}
                    type="button"
                    onClick={() => removeOption(index)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            )

            return {
              className: 'admin-style-editor-row',
              key: row.id ?? row.value,
              cells: isBlockStyle
                ? [
                    toggleCell,
                    <StaticStyleValue value={row.value} />,
                    labelCell,
                    sizeCell,
                    sampleCell,
                    { content: actionsCell, className: 'admin-style-sheet-cell--actions' },
                  ]
                : [toggleCell, labelCell, sizeCell, sampleCell, { content: actionsCell, className: 'admin-style-sheet-cell--actions' }],
            }
          })}
        />
      </div>
    </section>
  )
}

export function AdminStyleEditor({
  canPublishSiteShell = false,
  disabled = false,
  feedback = '',
  onPublishSiteShell,
  onSaveSiteShell,
  onSiteShellChange,
  publication = null,
  saveStatus = 'idle',
  siteShell = null,
  siteShellDirty = false,
}) {
  const settings = useEditorStyleSettings()
  const normalizedSettings = normalizeEditorStyleSettings(settings)

  function updateSettings(patch) {
    writeEditorStyleSettings({
      ...normalizedSettings,
      ...patch,
    })
  }

  function updateSiteThemeToken(group, key, nextValue) {
    if (!siteShell || disabled) {
      return
    }

    onSiteShellChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)
      const nextTheme = normalizeSiteThemeSettings({
        ...currentTheme,
        [group]: {
          ...currentTheme[group],
          [key]: nextValue,
        },
      })

      return {
        ...shell,
        theme: nextTheme,
      }
    })
  }

  function updateRichTextTagSize(tag, nextValue) {
    const field = getRichTextTagSizeField(tag)

    if (!field) {
      return
    }

    updateSiteThemeToken('typography', field.key, nextValue)
  }

  function resetRichTextTagSizes() {
    if (!siteShell || disabled) {
      return
    }

    const defaultTypography = getDefaultSiteThemeSettings().typography

    onSiteShellChange?.((currentShell) => {
      const shell = currentShell && typeof currentShell === 'object' ? currentShell : siteShell
      const currentTheme = normalizeSiteThemeSettings(shell.theme)
      const nextTypography = { ...currentTheme.typography }

      Object.values(RICH_TEXT_TAG_SIZE_FIELDS).forEach((field) => {
        nextTypography[field.key] = defaultTypography[field.key]
      })

      return {
        ...shell,
        theme: normalizeSiteThemeSettings({
          ...currentTheme,
          typography: nextTypography,
        }),
      }
    })
  }

  function handleReset() {
    resetEditorStyleSettings()
    resetRichTextTagSizes()
  }

  return (
    <div className="admin-style-editor">
      <SiteThemeEditor
        disabled={disabled}
        canPublish={canPublishSiteShell}
        editorStyleSettings={normalizedSettings}
        feedback={feedback}
        onEditorStyleChange={updateSettings}
        publication={publication}
        saveStatus={saveStatus}
        siteShell={siteShell}
        siteShellDirty={siteShellDirty}
        onChange={onSiteShellChange}
        onPublish={onPublishSiteShell}
        onResetRichText={handleReset}
        onSave={onSaveSiteShell}
        onTagSizeChange={updateRichTextTagSize}
      />
    </div>
  )
}
