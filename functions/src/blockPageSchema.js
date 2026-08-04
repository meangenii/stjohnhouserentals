const { validateBlockAnchorSettings } = require('./blockAnchors')
const {
  BLOCK_DEFINITION_VERSION: CURRENT_BLOCK_VERSION,
  BLOCK_CONTENT_SCHEMAS,
  BLOCK_PAGE_CONTENT_MODEL,
  BLOCK_RESPONSIVE_OPTIONS,
  BLOCK_STYLE_OPTIONS,
  BLOCK_TYPES: SUPPORTED_BLOCK_TYPES,
  getBlockDefinitionVersion,
  MAX_ROW_COLUMNS,
  MAX_ROW_COLUMN_WIDTH,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} = require('./blockContract')
const { validateBlockContentRecord } = require('./blockContentValidation')
const { migrateBlockPageDraft } = require('./blockMigrations')

const BLOCK_BACKGROUND_TYPES = BLOCK_STYLE_OPTIONS.backgroundType
const BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS = BLOCK_STYLE_OPTIONS.backgroundFocalPoint
const BLOCK_BACKGROUND_OVERLAY_OPTIONS = BLOCK_STYLE_OPTIONS.backgroundOverlay
const BLOCK_WIDTH_OPTIONS = BLOCK_STYLE_OPTIONS.width
const BLOCK_SPACING_OPTIONS = BLOCK_STYLE_OPTIONS.spacing
const BLOCK_ALIGN_OPTIONS = BLOCK_STYLE_OPTIONS.align
const BLOCK_BORDER_OPTIONS = BLOCK_STYLE_OPTIONS.border
const BLOCK_BORDER_RADIUS_OPTIONS = BLOCK_STYLE_OPTIONS.borderRadius
const SPACER_SIZE_OPTIONS = BLOCK_CONTENT_SCHEMAS.spacer.size.options
const IMAGE_TEXT_POSITIONS = BLOCK_CONTENT_SCHEMAS['image-text-split'].imagePosition.options
const DIRECTORY_EMBED_SOURCES = BLOCK_CONTENT_SCHEMAS['directory-embed'].source.options
const BLOCK_VISIBILITY_FLAGS = BLOCK_RESPONSIVE_OPTIONS.visibilityFlags.map((flag) => ({
  field: flag.field,
  label: `${flag.label} visibility`,
}))
const ROW_MOBILE_COLUMN_OPTIONS = BLOCK_RESPONSIVE_OPTIONS.rowMobileColumns
const DEFAULT_ROW_MOBILE_COLUMNS = 'stack'

const DEFAULT_BLOCK_STYLE = {
  align: 'left',
  background: { color: '', focalPoint: 'center', image: null, overlay: 'none', type: 'none' },
  border: 'none',
  borderRadius: 'none',
  color: '',
  presetId: '',
  spacing: 'none',
  width: 'full',
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pathToString(path = []) {
  return path.reduce((label, segment) => {
    if (typeof segment === 'number') {
      return `${label}[${segment}]`
    }

    return `${label}.${segment}`
  }, 'page')
}

function addIssue(issues, path, message, code = 'invalid') {
  issues.push({
    code,
    message,
    path: pathToString(path),
  })
}

function normalizeOption(value, options, fallback, warnings, path, label) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return fallback
  }

  if (options.includes(candidate)) {
    return candidate
  }

  addIssue(warnings, path, `${label} "${candidate}" is not supported. Using "${fallback}".`, 'unsupported-option')
  return fallback
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function normalizeBackgroundImage(image) {
  return isPlainObject(image) ? image : null
}

function normalizeBlockStyle(style, issues, warnings, path) {
  if (style == null) {
    return undefined
  }

  if (!isPlainObject(style)) {
    addIssue(issues, path, 'Block style must be an object.', 'invalid-style')
    return undefined
  }

  const fallbackBackground = DEFAULT_BLOCK_STYLE.background
  const background = style.background

  if (background != null && !isPlainObject(background)) {
    addIssue(issues, [...path, 'background'], 'Block style background must be an object.', 'invalid-style')
  }

  const normalizedStyle = {
    ...style,
    align: normalizeOption(style.align, BLOCK_ALIGN_OPTIONS, DEFAULT_BLOCK_STYLE.align, warnings, [...path, 'align'], 'Block alignment'),
    background: {
      ...(isPlainObject(background) ? background : {}),
      color: String(background?.color ?? fallbackBackground.color),
      focalPoint: normalizeOption(
        background?.focalPoint,
        BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
        DEFAULT_BLOCK_STYLE.background.focalPoint,
        warnings,
        [...path, 'background', 'focalPoint'],
        'Block background focal point',
      ),
      image: normalizeBackgroundImage(background?.image ?? fallbackBackground.image),
      overlay: normalizeOption(
        background?.overlay,
        BLOCK_BACKGROUND_OVERLAY_OPTIONS,
        DEFAULT_BLOCK_STYLE.background.overlay,
        warnings,
        [...path, 'background', 'overlay'],
        'Block background overlay',
      ),
      type: normalizeOption(
        background?.type,
        BLOCK_BACKGROUND_TYPES,
        DEFAULT_BLOCK_STYLE.background.type,
        warnings,
        [...path, 'background', 'type'],
        'Block background type',
      ),
    },
    border: normalizeOption(style.border, BLOCK_BORDER_OPTIONS, DEFAULT_BLOCK_STYLE.border, warnings, [...path, 'border'], 'Block border'),
    borderRadius: normalizeOption(
      style.borderRadius,
      BLOCK_BORDER_RADIUS_OPTIONS,
      DEFAULT_BLOCK_STYLE.borderRadius,
      warnings,
      [...path, 'borderRadius'],
      'Block corner radius',
    ),
    color: String(style.color ?? DEFAULT_BLOCK_STYLE.color),
    presetId: String(style.presetId ?? DEFAULT_BLOCK_STYLE.presetId).trim(),
    spacing: normalizeOption(style.spacing, BLOCK_SPACING_OPTIONS, DEFAULT_BLOCK_STYLE.spacing, warnings, [...path, 'spacing'], 'Block spacing'),
    width: normalizeOption(style.width, BLOCK_WIDTH_OPTIONS, DEFAULT_BLOCK_STYLE.width, warnings, [...path, 'width'], 'Block width'),
  }

  if (normalizedStyle.background.type === 'image' && normalizedStyle.background.overlay === 'none') {
    addIssue(
      warnings,
      [...path, 'background', 'overlay'],
      'Background images should use an overlay to preserve text readability.',
      'background-image-no-overlay',
    )
  }

  return normalizedStyle
}

function validateStableId(value, issues, path, label) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  addIssue(issues, path, `${label} requires a stable id.`, 'missing-id')
  return ''
}

function validateBooleanField(value, issues, path, label) {
  if (value == null || typeof value === 'boolean') {
    return
  }

  addIssue(issues, path, `${label} must be true or false.`, 'invalid-boolean')
}

function normalizeBlockVisibility(visibility, issues, warnings, path) {
  if (visibility == null) {
    return undefined
  }

  if (!isPlainObject(visibility)) {
    addIssue(issues, path, 'Visibility settings must be an object.', 'invalid-object')
    return undefined
  }

  const normalizedVisibility = { ...visibility }

  BLOCK_VISIBILITY_FLAGS.forEach((flag) => {
    validateBooleanField(visibility[flag.field], issues, [...path, flag.field], flag.label)

    if (Object.prototype.hasOwnProperty.call(visibility, flag.field)) {
      normalizedVisibility[flag.field] = visibility[flag.field] === true
    }
  })

  if (
    normalizedVisibility.hideOnDesktop === true &&
    normalizedVisibility.hideOnTablet === true &&
    normalizedVisibility.hideOnMobile === true
  ) {
    addIssue(warnings, path, 'Block is hidden on desktop, tablet, and mobile.', 'hidden-on-all-devices')
  }

  return normalizedVisibility
}

function normalizeBlockResponsive(responsive, block, issues, warnings, path) {
  if (responsive == null) {
    return undefined
  }

  if (!isPlainObject(responsive)) {
    addIssue(issues, path, 'Responsive settings must be an object.', 'invalid-object')
    return undefined
  }

  const normalizedResponsive = { ...responsive }
  const type = String(block?.type ?? '').trim()

  if (Object.prototype.hasOwnProperty.call(responsive, 'mobileColumns')) {
    normalizedResponsive.mobileColumns = normalizeOption(
      responsive.mobileColumns,
      ROW_MOBILE_COLUMN_OPTIONS,
      DEFAULT_ROW_MOBILE_COLUMNS,
      warnings,
      [...path, 'mobileColumns'],
      'Mobile column behavior',
    )

    if (type !== 'row') {
      addIssue(warnings, [...path, 'mobileColumns'], 'Mobile column behavior only applies to row blocks.', 'unused-responsive-setting')
    }
  }

  if (Object.prototype.hasOwnProperty.call(responsive, 'mobileColumnOrder')) {
    if (!Array.isArray(responsive.mobileColumnOrder)) {
      addIssue(issues, [...path, 'mobileColumnOrder'], 'Mobile column order must be an array of column ids.', 'invalid-responsive-order')
      delete normalizedResponsive.mobileColumnOrder
    } else if (type !== 'row') {
      addIssue(warnings, [...path, 'mobileColumnOrder'], 'Mobile column order only applies to row blocks.', 'unused-responsive-setting')
      delete normalizedResponsive.mobileColumnOrder
    } else {
      const columnIds = (Array.isArray(block?.columns) ? block.columns : [])
        .map((column) => String(column?.id ?? '').trim())
        .filter(Boolean)
      const requestedOrder = responsive.mobileColumnOrder.map((id) => String(id ?? '').trim()).filter(Boolean)
      const validOrder = [...new Set(requestedOrder.filter((id) => columnIds.includes(id)))]

      if (validOrder.length !== requestedOrder.length) {
        addIssue(warnings, [...path, 'mobileColumnOrder'], 'Removed duplicate or unavailable columns from mobile order.', 'stale-responsive-order')
      }

      normalizedResponsive.mobileColumnOrder = [...validOrder, ...columnIds.filter((id) => !validOrder.includes(id))]
    }
  }

  return normalizedResponsive
}

function normalizeBlockArray(blocks, path, depth, issues, warnings) {
  if (!Array.isArray(blocks)) {
    addIssue(issues, path, 'Block containers require a blocks array.', 'invalid-block-list')
    return []
  }

  return blocks.map((block, index) => normalizeBlock(block, [...path, index], depth, issues, warnings))
}

function normalizeGroupItems(items, path, depth, issues, warnings) {
  if (!Array.isArray(items)) {
    addIssue(issues, path, 'Group blocks require an items array.', 'invalid-group-items')
    return []
  }

  return items.map((item, index) => {
    const itemPath = [...path, index]

    if (!isPlainObject(item)) {
      addIssue(issues, itemPath, 'Group item must be an object.', 'invalid-group-item')
      return { blocks: [], id: '' }
    }

    const normalizedItem = { ...item }
    normalizedItem.id = validateStableId(item.id, issues, [...itemPath, 'id'], 'Group item')

    if (Object.prototype.hasOwnProperty.call(item, 'style')) {
      const normalizedStyle = normalizeBlockStyle(item.style, issues, warnings, [...itemPath, 'style'])

      if (normalizedStyle) {
        normalizedItem.style = normalizedStyle
      }
    }

    normalizedItem.blocks = normalizeBlockArray(item.blocks, [...itemPath, 'blocks'], depth + 1, issues, warnings)
    return normalizedItem
  })
}

function normalizeRowColumns(columns, path, depth, issues, warnings) {
  if (!Array.isArray(columns)) {
    addIssue(issues, path, 'Row blocks require a columns array.', 'invalid-row-columns')
    return []
  }

  if (columns.length < 1 || columns.length > MAX_ROW_COLUMNS) {
    addIssue(issues, path, `Row blocks require 1 to ${MAX_ROW_COLUMNS} columns.`, 'invalid-row-column-count')
  }

  return columns.map((column, index) => {
    const columnPath = [...path, index]

    if (!isPlainObject(column)) {
      addIssue(issues, columnPath, 'Row column must be an object.', 'invalid-row-column')
      return { blocks: [], id: '', width: 1 }
    }

    const normalizedColumn = { ...column }
    const width = Number(column.width)

    normalizedColumn.id = validateStableId(column.id, issues, [...columnPath, 'id'], 'Row column')
    normalizedColumn.width = Number.isFinite(width) && width > 0 ? width : 1

    if (normalizedColumn.width > MAX_ROW_COLUMN_WIDTH) {
      addIssue(
        issues,
        [...columnPath, 'width'],
        `Row column width must be between 1 and ${MAX_ROW_COLUMN_WIDTH}.`,
        'invalid-row-column-width',
      )
    }

    if (Object.prototype.hasOwnProperty.call(column, 'style')) {
      const normalizedStyle = normalizeBlockStyle(column.style, issues, warnings, [...columnPath, 'style'])

      if (normalizedStyle) {
        normalizedColumn.style = normalizedStyle
      }
    }

    normalizedColumn.blocks = normalizeBlockArray(column.blocks, [...columnPath, 'blocks'], depth + 1, issues, warnings)
    return normalizedColumn
  })
}

function normalizeBlock(block, path, depth, issues, warnings) {
  if (!isPlainObject(block)) {
    addIssue(issues, path, 'Block must be an object.', 'invalid-block')
    return { id: '', type: '', version: CURRENT_BLOCK_VERSION }
  }

  const normalizedBlock = { ...block }
  const type = String(block.type ?? '').trim()

  normalizedBlock.type = type
  normalizedBlock.id = validateStableId(block.id, issues, [...path, 'id'], 'Block')
  normalizedBlock.version = normalizePositiveInteger(block.version, getBlockDefinitionVersion(type))

  if (typeof block.editorLabel === 'string') {
    const editorLabel = block.editorLabel.trim()

    if (editorLabel) {
      normalizedBlock.editorLabel = editorLabel
    } else {
      delete normalizedBlock.editorLabel
    }
  }

  if (typeof block.anchorId === 'string') {
    const anchorId = block.anchorId.trim()

    if (anchorId) {
      normalizedBlock.anchorId = anchorId
    } else {
      delete normalizedBlock.anchorId
    }
  }

  if (!type) {
    addIssue(issues, [...path, 'type'], 'Block type is required.', 'missing-block-type')
  } else if (!SUPPORTED_BLOCK_TYPES.includes(type)) {
    addIssue(issues, [...path, 'type'], `Block type "${type}" is not supported.`, 'unsupported-block-type')
  }

  if (STRUCTURAL_BLOCK_TYPES.includes(type) && depth >= MAX_STRUCTURAL_NESTING_DEPTH) {
    addIssue(
      issues,
      [...path, 'type'],
      `Structural blocks can only be nested ${MAX_STRUCTURAL_NESTING_DEPTH} levels deep.`,
      'max-structural-depth',
    )
  }

  if (Object.prototype.hasOwnProperty.call(block, 'hidden')) {
    normalizedBlock.hidden = block.hidden === true
  }

  if (Object.prototype.hasOwnProperty.call(block, 'responsive')) {
    const normalizedResponsive = normalizeBlockResponsive(block.responsive, block, issues, warnings, [...path, 'responsive'])

    if (normalizedResponsive) {
      normalizedBlock.responsive = normalizedResponsive
    }
  }

  if (Object.prototype.hasOwnProperty.call(block, 'visibility')) {
    const normalizedVisibility = normalizeBlockVisibility(block.visibility, issues, warnings, [...path, 'visibility'])

    if (normalizedVisibility) {
      normalizedBlock.visibility = normalizedVisibility
    }
  }

  if (Object.prototype.hasOwnProperty.call(block, 'style')) {
    const normalizedStyle = normalizeBlockStyle(block.style, issues, warnings, [...path, 'style'])

    if (normalizedStyle) {
      normalizedBlock.style = normalizedStyle
    }
  }

  if (SUPPORTED_BLOCK_TYPES.includes(type)) {
    const contentValidation = validateBlockContentRecord(block, type)
    contentValidation.errors.forEach((issue) => addIssue(issues, [...path, ...issue.pathSegments], issue.message, issue.code))
    contentValidation.warnings.forEach((issue) => addIssue(warnings, [...path, ...issue.pathSegments], issue.message, issue.code))
  }

  if (type === 'group') {
    normalizedBlock.items = normalizeGroupItems(block.items, [...path, 'items'], depth, issues, warnings)
  }

  if (type === 'row') {
    normalizedBlock.columns = normalizeRowColumns(block.columns, [...path, 'columns'], depth, issues, warnings)
  }

  if (type === 'spacer') {
    normalizedBlock.size = normalizeOption(block.size, SPACER_SIZE_OPTIONS, 'medium', warnings, [...path, 'size'], 'Spacer size')
  }

  if (type === 'image-text-split') {
    normalizedBlock.imagePosition = normalizeOption(
      block.imagePosition,
      IMAGE_TEXT_POSITIONS,
      'left',
      warnings,
      [...path, 'imagePosition'],
      'Image position',
    )
  }

  if (type === 'directory-embed') {
    normalizedBlock.source = normalizeOption(block.source, DIRECTORY_EMBED_SOURCES, 'properties', warnings, [...path, 'source'], 'Directory source')
  }

  return normalizedBlock
}

function validateBlockPageDraft(page) {
  const errors = []
  const warnings = []

  if (!isPlainObject(page)) {
    addIssue(errors, [], 'Page draft must be an object.', 'invalid-page')
    return {
      errors,
      migrations: [],
      normalizedPage: null,
      valid: false,
      warnings,
    }
  }

  let normalizedPage = cloneData(page)
  normalizedPage.contentModel = String(normalizedPage.contentModel ?? '').trim()

  if (normalizedPage.contentModel !== BLOCK_PAGE_CONTENT_MODEL) {
    return {
      errors,
      migrations: [],
      normalizedPage,
      valid: true,
      warnings,
    }
  }

  const migration = migrateBlockPageDraft(normalizedPage)
  normalizedPage = migration.page
  migration.errors.forEach((issue) => addIssue(errors, issue.pathSegments, issue.message, issue.code))
  validateBlockAnchorSettings(normalizedPage.blocks).forEach((issue) => addIssue(errors, issue.path, issue.message, issue.code))
  normalizedPage.blocks = normalizeBlockArray(normalizedPage.blocks, ['blocks'], 0, errors, warnings)

  return {
    errors,
    migrations: migration.migrations,
    normalizedPage,
    valid: errors.length === 0,
    warnings,
  }
}

function formatBlockPageValidationErrors(errors = []) {
  const details = errors
    .slice(0, 8)
    .map((error) => `${error.path}: ${error.message}`)
    .join(' ')
  const overflow = errors.length > 8 ? ` ${errors.length - 8} more error(s) were omitted.` : ''

  return `Block page draft failed validation.${details ? ` ${details}` : ''}${overflow}`
}

function normalizeBlockPageDraft(page) {
  const validation = validateBlockPageDraft(page)

  if (!validation.valid) {
    const error = new Error(formatBlockPageValidationErrors(validation.errors))
    error.validationErrors = validation.errors
    throw error
  }

  return validation.normalizedPage
}

module.exports = {
  BLOCK_PAGE_CONTENT_MODEL,
  DEFAULT_BLOCK_STYLE,
  MAX_ROW_COLUMNS,
  MAX_ROW_COLUMN_WIDTH,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
  SUPPORTED_BLOCK_TYPES,
  formatBlockPageValidationErrors,
  normalizeBlockPageDraft,
  validateBlockPageDraft,
}
