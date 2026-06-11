import { Link } from 'react-router-dom'

export function ListingCard({ actionContent = null, actionLabel = 'Learn More', item }) {
  const image = item.image?.url ? item.image : null
  const content = (
    <>
      {image ? (
        <div className="listing-card-media">
          <img
            alt={image.alt || item.name}
            className="listing-card-image"
            decoding="async"
            loading="lazy"
            src={image.url}
          />
        </div>
      ) : null}

      <div className="listing-card-copy">
        <div className="listing-card-topline">
          <h3>{item.name}</h3>
          {item.rate ? <span className="listing-card-rate">{item.rate}</span> : null}
        </div>

        {item.summary ? <p>{item.summary}</p> : null}
      </div>
    </>
  )

  if (item.path) {
    return (
      <article className="listing-card">
        {content}
        {actionContent ?? (
          <Link className="button-link button-link--ghost listing-card-action" to={item.path}>
            {actionLabel}
          </Link>
        )}
      </article>
    )
  }

  return (
    <article className="listing-card">
      {content}
      {actionContent ?? (
        <a className="button-link button-link--ghost listing-card-action" href={item.href} rel="noreferrer" target="_blank">
          {actionLabel}
        </a>
      )}
    </article>
  )
}
