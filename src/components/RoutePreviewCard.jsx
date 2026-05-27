import { Link } from 'react-router-dom'

export function RoutePreviewCard({ page }) {
  const previewCopy = page.leadParagraphs[0] ?? page.metaDescription ?? page.title

  return (
    <article className="content-card route-preview-card">
      <div className="route-preview-top">
        <span className="eyebrow">{page.navLabel}</span>
        <span className="route-path">{page.path}</span>
      </div>
      <h3>{page.h1}</h3>
      <p>{previewCopy}</p>
      <Link className="button-link button-link--ghost route-link-button" to={page.path}>
        Open route
      </Link>
    </article>
  )
}
