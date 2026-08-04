import { BLOCK_STYLE_OPTIONS } from './blockContract.js'

export const BLOCK_BACKGROUND_TYPES = BLOCK_STYLE_OPTIONS.backgroundType
export const BLOCK_WIDTH_OPTIONS = BLOCK_STYLE_OPTIONS.width
export const BLOCK_SPACING_OPTIONS = BLOCK_STYLE_OPTIONS.spacing
export const BLOCK_ALIGN_OPTIONS = BLOCK_STYLE_OPTIONS.align
export const BLOCK_BORDER_OPTIONS = BLOCK_STYLE_OPTIONS.border
export const BLOCK_BORDER_RADIUS_OPTIONS = BLOCK_STYLE_OPTIONS.borderRadius
export const BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS = BLOCK_STYLE_OPTIONS.backgroundFocalPoint
export const BLOCK_BACKGROUND_OVERLAY_OPTIONS = BLOCK_STYLE_OPTIONS.backgroundOverlay

const BLOCK_BACKGROUND_FOCAL_POINT_POSITIONS = {
  bottom: 'center bottom',
  'bottom-left': 'left bottom',
  'bottom-right': 'right bottom',
  center: 'center',
  left: 'left center',
  right: 'right center',
  top: 'center top',
  'top-left': 'left top',
  'top-right': 'right top',
}

// The site's existing brand/surface palette (mirrors the CSS custom properties in src/index.css),
// offered as a "pick from what's already used on the site" list instead of a raw color wheel.
export const BLOCK_COLOR_SWATCHES = [
  { label: 'White', value: '#ffffff' },
  { label: 'Near Black', value: '#111111' },
  { label: 'Brand Blue', value: '#2269ff' },
  { label: 'Brand Sky', value: '#37a5dd' },
  { label: 'Brand Navy', value: '#0b2b5f' },
  { label: 'Brand Navy Deep', value: '#07214a' },
  { label: 'Brand Green', value: '#18750c' },
  { label: 'Home Band', value: '#1d2f63' },
  { label: 'Footer Blue', value: '#6ea7dd' },
  { label: 'Surface Pale', value: '#f5fbff' },
  { label: 'Surface Soft', value: '#f4f8fc' },
]

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

function normalizeBackgroundImage(image) {
  return image && typeof image === 'object' && !Array.isArray(image) ? image : null
}

function normalizeOption(value, options, fallback) {
  return options.includes(value) ? value : fallback
}

function normalizePresetId(value) {
  return String(value ?? '').trim()
}

export function normalizeBlockStyle(style, fallbackStyle = DEFAULT_BLOCK_STYLE) {
  const fallback = fallbackStyle && typeof fallbackStyle === 'object' && !Array.isArray(fallbackStyle)
    ? fallbackStyle
    : DEFAULT_BLOCK_STYLE
  const fallbackBackground = fallback.background ?? DEFAULT_BLOCK_STYLE.background

  return {
    align: normalizeOption(style?.align, BLOCK_ALIGN_OPTIONS, normalizeOption(fallback.align, BLOCK_ALIGN_OPTIONS, DEFAULT_BLOCK_STYLE.align)),
    background: {
      color: String(style?.background?.color ?? fallbackBackground.color ?? DEFAULT_BLOCK_STYLE.background.color),
      focalPoint: normalizeOption(
        style?.background?.focalPoint,
        BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
        normalizeOption(fallbackBackground.focalPoint, BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS, DEFAULT_BLOCK_STYLE.background.focalPoint),
      ),
      image: normalizeBackgroundImage(style?.background?.image ?? fallbackBackground.image),
      overlay: normalizeOption(
        style?.background?.overlay,
        BLOCK_BACKGROUND_OVERLAY_OPTIONS,
        normalizeOption(fallbackBackground.overlay, BLOCK_BACKGROUND_OVERLAY_OPTIONS, DEFAULT_BLOCK_STYLE.background.overlay),
      ),
      type: normalizeOption(
        style?.background?.type,
        BLOCK_BACKGROUND_TYPES,
        normalizeOption(fallbackBackground.type, BLOCK_BACKGROUND_TYPES, DEFAULT_BLOCK_STYLE.background.type),
      ),
    },
    border: normalizeOption(style?.border, BLOCK_BORDER_OPTIONS, normalizeOption(fallback.border, BLOCK_BORDER_OPTIONS, DEFAULT_BLOCK_STYLE.border)),
    borderRadius: normalizeOption(
      style?.borderRadius,
      BLOCK_BORDER_RADIUS_OPTIONS,
      normalizeOption(fallback.borderRadius, BLOCK_BORDER_RADIUS_OPTIONS, DEFAULT_BLOCK_STYLE.borderRadius),
    ),
    color: String(style?.color ?? fallback.color ?? DEFAULT_BLOCK_STYLE.color),
    presetId: normalizePresetId(style?.presetId),
    spacing: normalizeOption(style?.spacing, BLOCK_SPACING_OPTIONS, normalizeOption(fallback.spacing, BLOCK_SPACING_OPTIONS, DEFAULT_BLOCK_STYLE.spacing)),
    width: normalizeOption(style?.width, BLOCK_WIDTH_OPTIONS, normalizeOption(fallback.width, BLOCK_WIDTH_OPTIONS, DEFAULT_BLOCK_STYLE.width)),
  }
}

export function getBlockBackgroundPosition(focalPoint) {
  return BLOCK_BACKGROUND_FOCAL_POINT_POSITIONS[normalizeOption(focalPoint, BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS, DEFAULT_BLOCK_STYLE.background.focalPoint)]
}

export function resolveBlockStyle(style, presets = []) {
  const normalized = normalizeBlockStyle(style)
  const preset = normalized.presetId
    ? presets.find((entry) => entry?.enabled !== false && String(entry?.id ?? '').trim() === normalized.presetId)
    : null
  const presetStyle = preset ? normalizeBlockStyle(preset.style) : DEFAULT_BLOCK_STYLE

  return normalizeBlockStyle(style, presetStyle)
}

export function isDefaultBlockStyle(style) {
  const normalized = normalizeBlockStyle(style)

  return (
    normalized.align === DEFAULT_BLOCK_STYLE.align &&
    normalized.background.type === DEFAULT_BLOCK_STYLE.background.type &&
    normalized.border === DEFAULT_BLOCK_STYLE.border &&
    normalized.borderRadius === DEFAULT_BLOCK_STYLE.borderRadius &&
    normalized.color === DEFAULT_BLOCK_STYLE.color &&
    normalized.presetId === DEFAULT_BLOCK_STYLE.presetId &&
    normalized.spacing === DEFAULT_BLOCK_STYLE.spacing &&
    normalized.width === DEFAULT_BLOCK_STYLE.width
  )
}
