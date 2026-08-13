import { BlockList } from './BlockList'
import { buildBlockStyleFrameClassNames, buildBlockStyleFrameStyle } from '../lib/blockElementStyles'
import { findPageShareImage } from '../lib/blockPageMeta'
import { isDefaultBlockStyle, resolveBlockStyle } from '../lib/blockStyle'
import { DEFAULT_SITE_DESCRIPTION, useDocumentMeta } from '../lib/documentMeta'
import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { usePageEditor } from '../lib/usePageEditor'
import { useSiteShellContent } from '../lib/useSiteContent'

function getPageClassKey(key = '') {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function BlockPage({ page }) {
  const pageEditor = usePageEditor()
  const siteShell = useSiteShellContent()
  const blocks = Array.isArray(page?.blocks) ? page.blocks : []
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const pageTitle = page?.title || page?.navLabel
  const pageDescription = page?.metaDescription || DEFAULT_SITE_DESCRIPTION
  const shareImage = findPageShareImage(blocks)
  const pageStylePresets = getSiteThemeElementStylePresets(siteShell?.theme)
  const pageStyle = resolveBlockStyle(page?.style, pageStylePresets)
  const pageStyleActive = !isDefaultBlockStyle(pageStyle)
  const pageClassKey = getPageClassKey(page?.key)
  const blockPageClassName = [
    pageStyleActive ? buildBlockStyleFrameClassNames(pageStyle, 'block-page') : 'block-page',
    pageClassKey ? `block-page--${pageClassKey}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  useDocumentMeta({
    canonicalPath: page?.path,
    description: pageDescription,
    image: shareImage,
    imageAlt: shareImage?.alt || pageTitle,
    priority: 1,
    title: pageTitle,
  })

  return (
    <article
      className={blockPageClassName}
      style={pageStyleActive ? buildBlockStyleFrameStyle(pageStyle) : undefined}
    >
      <div className={`block-page-inner${pageStyleActive ? ' block-style-frame-inner' : ''}`}>
        <BlockList blocks={blocks} context={{ page }} path={['blocks']} />

        {!editable && blocks.length === 0 ? (
          <header className="block-page-empty">
            <h1>{pageTitle}</h1>
          </header>
        ) : null}
      </div>
    </article>
  )
}
