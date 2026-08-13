import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { isDefaultBlockStyle, resolveBlockStyle } from '../lib/blockStyle'
import { buildBlockStyleFrameClassNames, buildBlockStyleFrameStyle } from '../lib/blockElementStyles'
import { useSiteShellContent } from '../lib/useSiteContent'

export function BlockStyleFrame({ block, children }) {
  const siteShell = useSiteShellContent()
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme)
  const style = resolveBlockStyle(block.style, stylePresets)

  if (isDefaultBlockStyle(style)) {
    return children
  }

  return (
    <div className={buildBlockStyleFrameClassNames(style)} style={buildBlockStyleFrameStyle(style)}>
      <div className="block-style-frame-inner">{children}</div>
    </div>
  )
}
