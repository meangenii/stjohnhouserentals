import { BlockList } from './BlockList'
import { findPageShareImage } from '../lib/blockPageMeta'
import { DEFAULT_SITE_DESCRIPTION, useDocumentMeta } from '../lib/documentMeta'
import { usePageEditor } from '../lib/usePageEditor'

export function BlockPage({ page }) {
  const pageEditor = usePageEditor()
  const blocks = Array.isArray(page?.blocks) ? page.blocks : []
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const pageTitle = page?.title || page?.navLabel
  const pageDescription = page?.metaDescription || DEFAULT_SITE_DESCRIPTION
  const shareImage = findPageShareImage(blocks)

  useDocumentMeta({
    canonicalPath: page?.path,
    description: pageDescription,
    image: shareImage,
    imageAlt: shareImage?.alt || pageTitle,
    priority: 1,
    title: pageTitle,
  })

  return (
    <article className="block-page">
      <div className="block-page-inner">
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
