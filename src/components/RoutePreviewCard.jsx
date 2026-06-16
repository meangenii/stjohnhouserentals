import { Link } from 'react-router-dom'
import { RichTextValue } from './RichTextValue'

export function RoutePreviewCard({ page }) {
  const previewCopy = page.leadParagraphs[0] ?? page.metaDescription ?? page.title

  return (
    <article className="content-card route-preview-card">
      <div className="route-preview-top">
        <RichTextValue as="span" className="eyebrow" value={page.navLabel} />
        <span className="route-path">{page.path}</span>
      </div>
      <RichTextValue as="h3" value={page.h1} />
      <RichTextValue as="p" value={previewCopy} />
      <Link className="button-link button-link--ghost route-link-button" to={page.path}>
        Open route
      </Link>
    </article>
  )
}
