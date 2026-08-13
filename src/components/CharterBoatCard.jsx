import { Link } from '../lib/router'
import { getContentImageSrc } from '../lib/contentAssets'
import { truncateSummary } from '../lib/charterSummary'

export function CharterBoatCard({ charter }) {
  const imageUrl = getContentImageSrc(charter.heroImage, { width: 760, height: 520 })
  const summary = truncateSummary(charter.shortDescription)

  return (
    <article className="charter-boats-card">
      <Link aria-label={charter.name} className="charter-boats-card-media" to={charter.path}>
        {imageUrl ? (
          <img
            alt={charter.heroImage?.alt || charter.name}
            className="charter-boats-card-image"
            decoding="async"
            loading="lazy"
            src={imageUrl}
          />
        ) : null}
      </Link>

      <div className="charter-boats-card-body">
        <h3>{charter.name}</h3>
        <div aria-hidden="true" className="charter-boats-card-divider" />
        <p>{summary.text}</p>

        {summary.isTruncated ? (
          <Link className="charter-boats-card-more" to={charter.path}>
            Show More
          </Link>
        ) : (
          <div aria-hidden="true" className="charter-boats-card-more-spacer" />
        )}

        <Link className="charter-boats-card-action" to={charter.path}>
          Learn More
        </Link>
      </div>
    </article>
  )
}
