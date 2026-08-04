import { BLOCK_RESPONSIVE_OPTIONS } from './blockContract.js'

export const BLOCK_PREVIEW_DEVICES = BLOCK_RESPONSIVE_OPTIONS.previewDevices
export const BLOCK_VISIBILITY_FLAGS = BLOCK_RESPONSIVE_OPTIONS.visibilityFlags
export const ROW_MOBILE_COLUMN_OPTIONS = BLOCK_RESPONSIVE_OPTIONS.rowMobileColumns
export const DEFAULT_ROW_MOBILE_COLUMNS = 'stack'

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeOption(value, options, fallback) {
  const candidate = String(value ?? '').trim()
  return options.includes(candidate) ? candidate : fallback
}

export function normalizeBlockPreviewDevice(device) {
  return normalizeOption(device, BLOCK_PREVIEW_DEVICES, 'desktop')
}

export function normalizeBlockVisibility(visibility) {
  const rawVisibility = getPlainObject(visibility)

  return {
    hideOnDesktop: rawVisibility.hideOnDesktop === true,
    hideOnTablet: rawVisibility.hideOnTablet === true,
    hideOnMobile: rawVisibility.hideOnMobile === true,
  }
}

export function setBlockDeviceVisibility(visibility, device, visible) {
  const targetFlag = BLOCK_VISIBILITY_FLAGS.find((flag) => flag.device === device)
  const nextVisibility = { ...getPlainObject(visibility), ...normalizeBlockVisibility(visibility) }

  if (!targetFlag) {
    return nextVisibility
  }

  nextVisibility[targetFlag.field] = visible !== true
  return nextVisibility
}

export function getBlockVisibilityClassNames(block) {
  const visibility = normalizeBlockVisibility(block?.visibility)
  const classNames = []

  if (visibility.hideOnDesktop) {
    classNames.push('block-page-block--hidden-desktop')
  }

  if (visibility.hideOnMobile) {
    classNames.push('block-page-block--hidden-mobile')
  }

  if (visibility.hideOnTablet) {
    classNames.push('block-page-block--hidden-tablet')
  }

  return classNames
}

export function isBlockVisibleOnDevice(block, device = 'desktop') {
  if (block?.hidden === true) {
    return false
  }

  const previewDevice = normalizeBlockPreviewDevice(device)
  const visibility = normalizeBlockVisibility(block?.visibility)

  if (previewDevice === 'desktop') {
    return !visibility.hideOnDesktop
  }

  if (previewDevice === 'tablet') {
    return !visibility.hideOnTablet
  }

  return !visibility.hideOnMobile
}

export function normalizeRowResponsive(responsive) {
  const rawResponsive = getPlainObject(responsive)

  return {
    mobileColumnOrder: Array.isArray(rawResponsive.mobileColumnOrder)
      ? [...new Set(rawResponsive.mobileColumnOrder.map((id) => String(id ?? '').trim()).filter(Boolean))]
      : [],
    mobileColumns: normalizeOption(rawResponsive.mobileColumns, ROW_MOBILE_COLUMN_OPTIONS, DEFAULT_ROW_MOBILE_COLUMNS),
  }
}

export function setRowMobileColumns(responsive, mobileColumns) {
  return {
    ...getPlainObject(responsive),
    mobileColumns: normalizeOption(mobileColumns, ROW_MOBILE_COLUMN_OPTIONS, DEFAULT_ROW_MOBILE_COLUMNS),
  }
}

export function getRowMobileColumnsMode(block) {
  return normalizeRowResponsive(block?.responsive).mobileColumns
}

export function getRowMobileColumnOrder(block) {
  const columnIds = Array.isArray(block?.columns)
    ? block.columns.map((column) => String(column?.id ?? '').trim()).filter(Boolean)
    : []
  const configuredOrder = normalizeRowResponsive(block?.responsive).mobileColumnOrder.filter((id) => columnIds.includes(id))

  return [...configuredOrder, ...columnIds.filter((id) => !configuredOrder.includes(id))]
}

export function setRowMobileColumnOrder(responsive, mobileColumnOrder) {
  return {
    ...getPlainObject(responsive),
    mobileColumnOrder: [...new Set((Array.isArray(mobileColumnOrder) ? mobileColumnOrder : []).map((id) => String(id ?? '').trim()).filter(Boolean))],
  }
}
