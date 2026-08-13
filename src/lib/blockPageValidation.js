import { auditBlockPageAccessibility } from './blockPageAccessibilityAudit.js'
import { validateBlockAnchorSettings } from './blockAnchors.js'
import { validateBlockContentRecord } from './blockContentValidation.js'
import { auditBlockPageContent } from './blockPageContentAudit.js'
import {
  BLOCK_PAGE_CONTENT_MODEL,
  BLOCK_CONTENT_SCHEMAS,
  BLOCK_TYPES,
  MAX_ROW_COLUMNS,
  MAX_ROW_COLUMN_WIDTH,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} from './blockContract.js'
import { getBlockElementStyleTargetIds } from './blockElementStyleTargets.js'
import { migrateBlockPageDraft } from './blockMigrations.js'
import { BLOCK_VISIBILITY_FLAGS, ROW_MOBILE_COLUMN_OPTIONS } from './blockResponsive.js'
import {
  BLOCK_ALIGN_OPTIONS,
  BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
  BLOCK_BACKGROUND_OVERLAY_OPTIONS,
  BLOCK_BACKGROUND_TYPES,
  BLOCK_BORDER_OPTIONS,
  BLOCK_BORDER_RADIUS_OPTIONS,
  BLOCK_SPACING_OPTIONS,
  BLOCK_WIDTH_OPTIONS,
} from './blockStyle.js'
import { validatePageRouteSettings } from './pageRouteSettings.js'

export { BLOCK_PAGE_CONTENT_MODEL }

const SPACER_SIZE_OPTIONS = BLOCK_CONTENT_SCHEMAS.spacer.size.options
const IMAGE_TEXT_POSITIONS = BLOCK_CONTENT_SCHEMAS['image-text-split'].imagePosition.options
const DIRECTORY_EMBED_SOURCES = BLOCK_CONTENT_SCHEMAS['directory-embed'].source.options
const READINESS_HERO_BLOCK_TYPES = new Set(['hero', 'car-barge-hero'])

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
    pathSegments: Array.isArray(path) ? [...path] : [],
  })
}

function validateStableId(value, errors, path, label) {
  if (typeof value === 'string' && value.trim()) {
    return
  }

  addIssue(errors, path, `${label} requires a stable id.`, 'missing-id')
}

function validateBooleanField(value, errors, path, label) {
  if (value == null || typeof value === 'boolean') {
    return
  }

  addIssue(errors, path, `${label} must be true or false.`, 'invalid-boolean')
}

function validateOption(value, options, warnings, path, label) {
  const candidate = String(value ?? '').trim()

  if (!candidate || options.includes(candidate)) {
    return
  }

  addIssue(warnings, path, `${label} "${candidate}" is not supported and will be normalized on save.`, 'unsupported-option')
}

function validateBlockVisibility(visibility, errors, warnings, path) {
  if (visibility == null) {
    return
  }

  if (!isPlainObject(visibility)) {
    addIssue(errors, path, 'Visibility settings must be an object.', 'invalid-object')
    return
  }

  BLOCK_VISIBILITY_FLAGS.forEach((flag) => {
    validateBooleanField(visibility[flag.field], errors, [...path, flag.field], `${flag.label} visibility`)
  })

  if (visibility.hideOnDesktop === true && visibility.hideOnTablet === true && visibility.hideOnMobile === true) {
    addIssue(warnings, path, 'Block is hidden on desktop, tablet, and mobile.', 'hidden-on-all-devices')
  }
}

function validateBlockResponsive(responsive, block, errors, warnings, path) {
  if (responsive == null) {
    return
  }

  if (!isPlainObject(responsive)) {
    addIssue(errors, path, 'Responsive settings must be an object.', 'invalid-object')
    return
  }

  const type = String(block?.type ?? '').trim()
  validateOption(responsive.mobileColumns, ROW_MOBILE_COLUMN_OPTIONS, warnings, [...path, 'mobileColumns'], 'Mobile column behavior')

  if (responsive.mobileColumns != null && type !== 'row') {
    addIssue(warnings, [...path, 'mobileColumns'], 'Mobile column behavior only applies to row blocks.', 'unused-responsive-setting')
  }

  if (responsive.mobileColumnOrder != null) {
    if (!Array.isArray(responsive.mobileColumnOrder)) {
      addIssue(errors, [...path, 'mobileColumnOrder'], 'Mobile column order must be an array of column ids.', 'invalid-responsive-order')
    } else if (type !== 'row') {
      addIssue(warnings, [...path, 'mobileColumnOrder'], 'Mobile column order only applies to row blocks.', 'unused-responsive-setting')
    } else {
      const columnIds = (Array.isArray(block?.columns) ? block.columns : [])
        .map((column) => String(column?.id ?? '').trim())
        .filter(Boolean)
      const orderIds = responsive.mobileColumnOrder.map((id) => String(id ?? '').trim()).filter(Boolean)

      if (new Set(orderIds).size !== orderIds.length || orderIds.some((id) => !columnIds.includes(id))) {
        addIssue(warnings, [...path, 'mobileColumnOrder'], 'Mobile column order contains duplicate or unavailable columns.', 'stale-responsive-order')
      }
    }
  }
}

function validateStyle(style, errors, warnings, path, label = 'Block style') {
  if (style == null) {
    return
  }

  if (!isPlainObject(style)) {
    addIssue(errors, path, `${label} must be an object.`, 'invalid-style')
    return
  }

  if (style.background != null && !isPlainObject(style.background)) {
    addIssue(errors, [...path, 'background'], `${label} background must be an object.`, 'invalid-style')
  }

  validateOption(style.align, BLOCK_ALIGN_OPTIONS, warnings, [...path, 'align'], 'Block alignment')
  validateOption(
    style.background?.focalPoint,
    BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
    warnings,
    [...path, 'background', 'focalPoint'],
    'Block background focal point',
  )
  validateOption(
    style.background?.overlay,
    BLOCK_BACKGROUND_OVERLAY_OPTIONS,
    warnings,
    [...path, 'background', 'overlay'],
    'Block background overlay',
  )
  validateOption(style.background?.type, BLOCK_BACKGROUND_TYPES, warnings, [...path, 'background', 'type'], 'Block background type')
  validateOption(style.border, BLOCK_BORDER_OPTIONS, warnings, [...path, 'border'], 'Block border')
  validateOption(style.borderRadius, BLOCK_BORDER_RADIUS_OPTIONS, warnings, [...path, 'borderRadius'], 'Block corner radius')
  validateOption(style.spacing, BLOCK_SPACING_OPTIONS, warnings, [...path, 'spacing'], 'Block spacing')
  validateOption(style.width, BLOCK_WIDTH_OPTIONS, warnings, [...path, 'width'], 'Block width')

  const overlayCandidate = String(style.background?.overlay ?? 'none').trim()

  if (
    style.background?.type === 'image' &&
    (!overlayCandidate || overlayCandidate === 'none' || !BLOCK_BACKGROUND_OVERLAY_OPTIONS.includes(overlayCandidate))
  ) {
    addIssue(warnings, [...path, 'background', 'overlay'], 'Background images should use an overlay to preserve text readability.', 'background-image-no-overlay')
  }
}

function validateElementStyles(elementStyles, type, errors, warnings, path) {
  if (elementStyles == null) {
    return
  }

  if (!isPlainObject(elementStyles)) {
    addIssue(errors, path, 'Element styles must be an object keyed by style target.', 'invalid-element-styles')
    return
  }

  const supportedTargets = new Set(getBlockElementStyleTargetIds(type))

  Object.entries(elementStyles).forEach(([targetId, style]) => {
    const normalizedTargetId = String(targetId ?? '').trim()
    const targetPath = [...path, targetId]

    if (!normalizedTargetId) {
      addIssue(errors, targetPath, 'Element style targets require a non-empty id.', 'invalid-element-style-target')
      return
    }

    if (!supportedTargets.has(normalizedTargetId)) {
      addIssue(warnings, targetPath, `Element style target "${normalizedTargetId}" is not supported by ${type || 'this block'}.`, 'unsupported-element-style-target')
    }

    validateStyle(style, errors, warnings, targetPath)
  })
}

function validateBlockArray(blocks, path, depth, errors, warnings, collectedBlocks) {
  if (!Array.isArray(blocks)) {
    addIssue(errors, path, 'Block containers require a blocks array.', 'invalid-block-list')
    return
  }

  blocks.forEach((block, index) => validateBlock(block, [...path, index], depth, errors, warnings, collectedBlocks))
}

function validateGroupItems(items, path, depth, errors, warnings, collectedBlocks) {
  if (!Array.isArray(items)) {
    addIssue(errors, path, 'Group blocks require an items array.', 'invalid-group-items')
    return
  }

  items.forEach((item, index) => {
    const itemPath = [...path, index]

    if (!isPlainObject(item)) {
      addIssue(errors, itemPath, 'Group item must be an object.', 'invalid-group-item')
      return
    }

    validateStableId(item.id, errors, [...itemPath, 'id'], 'Group item')
    validateStyle(item.style, errors, warnings, [...itemPath, 'style'])
    validateBlockArray(item.blocks, [...itemPath, 'blocks'], depth + 1, errors, warnings, collectedBlocks)
  })
}

function validateRowColumns(columns, path, depth, errors, warnings, collectedBlocks) {
  if (!Array.isArray(columns)) {
    addIssue(errors, path, 'Row blocks require a columns array.', 'invalid-row-columns')
    return
  }

  if (columns.length < 1 || columns.length > MAX_ROW_COLUMNS) {
    addIssue(errors, path, `Row blocks require 1 to ${MAX_ROW_COLUMNS} columns.`, 'invalid-row-column-count')
  }

  columns.forEach((column, index) => {
    const columnPath = [...path, index]

    if (!isPlainObject(column)) {
      addIssue(errors, columnPath, 'Row column must be an object.', 'invalid-row-column')
      return
    }

    const width = Number(column.width)

    validateStableId(column.id, errors, [...columnPath, 'id'], 'Row column')

    if (!Number.isFinite(width) || width <= 0 || width > MAX_ROW_COLUMN_WIDTH) {
      addIssue(errors, [...columnPath, 'width'], `Row column width must be between 1 and ${MAX_ROW_COLUMN_WIDTH}.`, 'invalid-row-column-width')
    }

    validateStyle(column.style, errors, warnings, [...columnPath, 'style'])
    validateBlockArray(column.blocks, [...columnPath, 'blocks'], depth + 1, errors, warnings, collectedBlocks)
  })
}

function validateTabItems(items, path, depth, errors, warnings, collectedBlocks) {
  if (!Array.isArray(items)) {
    addIssue(errors, path, 'Tabs blocks require an items array.', 'invalid-tabs-items')
    return
  }

  items.forEach((item, index) => {
    const itemPath = [...path, index]

    if (!isPlainObject(item)) {
      addIssue(errors, itemPath, 'Tab item must be an object.', 'invalid-tabs-item')
      return
    }

    validateStableId(item.id, errors, [...itemPath, 'id'], 'Tab item')
    validateBlockArray(item.blocks, [...itemPath, 'blocks'], depth + 1, errors, warnings, collectedBlocks)
  })
}

function validateBlock(block, path, depth, errors, warnings, collectedBlocks) {
  if (!isPlainObject(block)) {
    addIssue(errors, path, 'Block must be an object.', 'invalid-block')
    return
  }

  const type = String(block.type ?? '').trim()

  collectedBlocks.push(block)
  validateStableId(block.id, errors, [...path, 'id'], 'Block')

  if (!type) {
    addIssue(errors, [...path, 'type'], 'Block type is required.', 'missing-block-type')
  } else if (!BLOCK_TYPES.includes(type)) {
    addIssue(errors, [...path, 'type'], `Block type "${type}" is not supported.`, 'unsupported-block-type')
  }

  if (STRUCTURAL_BLOCK_TYPES.includes(type) && depth >= MAX_STRUCTURAL_NESTING_DEPTH) {
    addIssue(errors, [...path, 'type'], `Structural blocks can only be nested ${MAX_STRUCTURAL_NESTING_DEPTH} levels deep.`, 'max-structural-depth')
  }

  validateBlockResponsive(block.responsive, block, errors, warnings, [...path, 'responsive'])
  validateBlockVisibility(block.visibility, errors, warnings, [...path, 'visibility'])
  validateStyle(block.style, errors, warnings, [...path, 'style'])
  validateElementStyles(block.elementStyles, type, errors, warnings, [...path, 'elementStyles'])

  if (BLOCK_TYPES.includes(type)) {
    const contentValidation = validateBlockContentRecord(block, type)
    contentValidation.errors.forEach((issue) => addIssue(errors, [...path, ...issue.pathSegments], issue.message, issue.code))
    contentValidation.warnings.forEach((issue) => addIssue(warnings, [...path, ...issue.pathSegments], issue.message, issue.code))
  }

  if (type === 'group') {
    validateGroupItems(block.items, [...path, 'items'], depth, errors, warnings, collectedBlocks)
  }

  if (type === 'row') {
    validateRowColumns(block.columns, [...path, 'columns'], depth, errors, warnings, collectedBlocks)
  }

  if (type === 'tabs') {
    validateTabItems(block.items, [...path, 'items'], depth, errors, warnings, collectedBlocks)
  }

  if (type === 'spacer') {
    validateOption(block.size, SPACER_SIZE_OPTIONS, warnings, [...path, 'size'], 'Spacer size')
  }

  if (type === 'image-text-split') {
    validateOption(block.imagePosition, IMAGE_TEXT_POSITIONS, warnings, [...path, 'imagePosition'], 'Image position')
  }

  if (type === 'directory-embed') {
    validateOption(block.source, DIRECTORY_EMBED_SOURCES, warnings, [...path, 'source'], 'Directory source')
  }
}

function addPublishReadinessWarnings(page, blocks, warnings) {
  if (!String(page?.title ?? '').trim()) {
    addIssue(warnings, ['title'], 'Page title is missing.', 'missing-title')
  }

  if (!String(page?.metaDescription ?? '').trim()) {
    addIssue(warnings, ['metaDescription'], 'Meta description is missing.', 'missing-meta-description')
  }

  if (!blocks.some((block) => READINESS_HERO_BLOCK_TYPES.has(block?.type))) {
    addIssue(warnings, ['blocks'], 'Page has no hero block.', 'missing-hero')
  }

  if (!blocks.some((block) => ['cta-band', 'contact-form'].includes(block?.type))) {
    addIssue(warnings, ['blocks'], 'Page has no call-to-action or contact form block.', 'missing-primary-action')
  }
}

export function validateEditorBlockPageDraft(page, options = {}) {
  const errors = []
  const warnings = []
  const collectedBlocks = []

  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== BLOCK_PAGE_CONTENT_MODEL) {
    return {
      applies: false,
      errors,
      migrations: [],
      valid: true,
      warnings,
    }
  }

  const migration = migrateBlockPageDraft(page)
  const migratedPage = migration.page
  migration.errors.forEach((issue) => addIssue(errors, issue.pathSegments, issue.message, issue.code))
  validateStyle(migratedPage.style, errors, warnings, ['style'], 'Page style')
  validateBlockArray(migratedPage.blocks, ['blocks'], 0, errors, warnings, collectedBlocks)
  validateBlockAnchorSettings(migratedPage.blocks).forEach((issue) => addIssue(errors, issue.path, issue.message, issue.code))
  const routeValidation = validatePageRouteSettings(migratedPage, options)
  routeValidation.errors.forEach((issue) => addIssue(errors, issue.path, issue.message, issue.code))
  routeValidation.warnings.forEach((issue) => addIssue(warnings, issue.path, issue.message, issue.code))
  addPublishReadinessWarnings(migratedPage, collectedBlocks, warnings)
  auditBlockPageContent(migratedPage).forEach((warning) => addIssue(warnings, warning.path, warning.message, warning.code))
  auditBlockPageAccessibility(migratedPage).forEach((warning) => addIssue(warnings, warning.path, warning.message, warning.code))

  return {
    applies: true,
    blockCount: collectedBlocks.length,
    errors,
    migrations: migration.migrations,
    valid: errors.length === 0,
    warnings,
  }
}

export function summarizeBlockPageQuality(validation) {
  if (!validation?.applies) {
    return null
  }

  if (validation.errors.length > 0) {
    return {
      message: `${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'} must be fixed before saving.`,
      tone: 'error',
      title: 'Page Checks Failed',
    }
  }

  if (validation.warnings.length > 0) {
    return {
      message: `${validation.warnings.length} publish-readiness warning${validation.warnings.length === 1 ? '' : 's'} found.`,
      tone: 'warning',
      title: 'Page Checks Need Review',
    }
  }

  return {
    message: `${validation.blockCount ?? 0} block${validation.blockCount === 1 ? '' : 's'} checked.`,
    tone: 'ready',
    title: 'Page Checks Passed',
  }
}
