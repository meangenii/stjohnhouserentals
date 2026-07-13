import { getContentImageSrc } from '../lib/contentAssets'
import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { isDefaultBlockStyle, resolveBlockStyle } from '../lib/blockStyle'
import { useSiteShellContent } from '../lib/useSiteContent'

export function BlockStyleFrame({ block, children }) {
  const siteShell = useSiteShellContent()
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme)
  const style = resolveBlockStyle(block.style, stylePresets)

  if (isDefaultBlockStyle(style)) {
    return children
  }

  const backgroundImageUrl = style.background.type === 'image' ? getContentImageSrc(style.background.image, { width: 1920 }) : ''

  const frameStyle = {
    ...(style.background.type === 'color' && style.background.color ? { backgroundColor: style.background.color } : {}),
    ...(backgroundImageUrl ? { backgroundImage: `url(${backgroundImageUrl})`, backgroundPosition: 'center', backgroundSize: 'cover' } : {}),
    ...(style.color ? { color: style.color } : {}),
  }

  const frameClassName = [
    'block-style-frame',
    `block-style-frame--width-${style.width}`,
    `block-style-frame--spacing-${style.spacing}`,
    `block-style-frame--align-${style.align}`,
    `block-style-frame--border-${style.border}`,
    `block-style-frame--radius-${style.borderRadius}`,
  ].join(' ')

  return (
    <div className={frameClassName} style={frameStyle}>
      <div className="block-style-frame-inner">{children}</div>
    </div>
  )
}
