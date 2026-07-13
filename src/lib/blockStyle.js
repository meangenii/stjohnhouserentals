export const BLOCK_BACKGROUND_TYPES = ['none', 'color', 'image']
export const BLOCK_WIDTH_OPTIONS = ['full', 'contained', 'narrow']
export const BLOCK_SPACING_OPTIONS = ['none', 'small', 'medium', 'large']
export const BLOCK_ALIGN_OPTIONS = ['left', 'center', 'right']
export const BLOCK_BORDER_OPTIONS = ['none', 'thin', 'thick']
export const BLOCK_BORDER_RADIUS_OPTIONS = ['none', 'small', 'large']

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
  background: { color: '', image: null, type: 'none' },
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
      image: normalizeBackgroundImage(style?.background?.image ?? fallbackBackground.image),
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
