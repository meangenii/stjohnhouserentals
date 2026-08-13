import { getBlockBackgroundPosition, isDefaultBlockStyle, resolveBlockStyle } from './blockStyle.js'
import { getContentImageSrc } from './contentAssets.js'
import { getSiteThemeElementStylePresets } from './siteThemeSettings.js'
import { useSiteShellContent } from './useSiteContent.js'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(' ')
}

export function getBlockElementStyleRecord(block, targetId) {
  const normalizedTargetId = String(targetId ?? '').trim()
  const elementStyles = isPlainObject(block?.elementStyles) ? block.elementStyles : {}
  const style = normalizedTargetId ? elementStyles[normalizedTargetId] : null

  return isPlainObject(style) ? style : {}
}

export function buildBlockStyleFrameClassNames(style, className = '', { elementTarget = false } = {}) {
  const backgroundImageUrl = style.background.type === 'image' ? getContentImageSrc(style.background.image, { width: 1920 }) : ''
  const overlay = backgroundImageUrl ? style.background.overlay : 'none'

  return joinClassNames(
    className,
    elementTarget ? 'block-element-style-target' : '',
    'block-style-frame',
    `block-style-frame--width-${style.width}`,
    `block-style-frame--spacing-${style.spacing}`,
    `block-style-frame--align-${style.align}`,
    `block-style-frame--border-${style.border}`,
    `block-style-frame--radius-${style.borderRadius}`,
    `block-style-frame--overlay-${overlay}`,
  )
}

export function buildBlockStyleFrameStyle(style) {
  const backgroundImageUrl = style.background.type === 'image' ? getContentImageSrc(style.background.image, { width: 1920 }) : ''

  return {
    ...(style.background.type === 'color' && style.background.color ? { backgroundColor: style.background.color } : {}),
    ...(backgroundImageUrl
      ? {
          backgroundImage: `url(${backgroundImageUrl})`,
          backgroundPosition: getBlockBackgroundPosition(style.background.focalPoint),
          backgroundSize: 'cover',
        }
      : {}),
    ...(style.color ? { color: style.color } : {}),
  }
}

export function useBlockElementStyleProps(block, targetId, props = {}) {
  const siteShell = useSiteShellContent()
  const rawStyle = getBlockElementStyleRecord(block, targetId)
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme)
  const style = resolveBlockStyle(rawStyle, stylePresets)

  if (isDefaultBlockStyle(style)) {
    return props
  }

  return {
    ...props,
    className: buildBlockStyleFrameClassNames(style, props.className, { elementTarget: true }),
    'data-block-element-style-target': String(targetId ?? '').trim() || undefined,
    style: {
      ...buildBlockStyleFrameStyle(style),
      ...(props.style && typeof props.style === 'object' ? props.style : {}),
    },
  }
}
