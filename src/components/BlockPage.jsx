import { EditableText } from './AdminInlinePageEdit'
import { BlockList } from './BlockList'
import { BlockOutline } from './BlockOutline'
import { findPageShareImage } from '../lib/blockPageMeta'
import { DEFAULT_SITE_DESCRIPTION, useDocumentMeta } from '../lib/documentMeta'
import { usePageEditor } from '../lib/usePageEditor'

function PageSettings({ page }) {
  return (
    <div className="block-page-settings">
      <span className="block-page-settings-label">Page settings</span>
      <div className="block-page-settings-fields">
        <EditableText as="p" className="block-page-settings-field" label="Page Title" path={['title']} value={page?.title ?? ''}>
          {page?.title || 'Untitled page'}
        </EditableText>
        <EditableText as="p" className="block-page-settings-field" label="Navigation Label" path={['navLabel']} value={page?.navLabel ?? ''}>
          {page?.navLabel || 'No nav label set'}
        </EditableText>
        <EditableText
          as="p"
          className="block-page-settings-field"
          label="Search Description"
          multiline
          path={['metaDescription']}
          rows={3}
          value={page?.metaDescription ?? ''}
        >
          {page?.metaDescription || 'No search description set'}
        </EditableText>
      </div>
    </div>
  )
}

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
        {editable ? <PageSettings page={page} /> : null}
        {editable ? <BlockOutline blocks={blocks} /> : null}

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
