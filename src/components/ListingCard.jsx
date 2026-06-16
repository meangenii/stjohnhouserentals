import { Link } from 'react-router-dom'
import { RichTextValue } from './RichTextValue'

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
          <RichTextValue as="h3" value={item.name} />
          {item.rate ? <RichTextValue as="span" className="listing-card-rate" value={item.rate} /> : null}
        </div>

        {item.summary ? <RichTextValue as="p" value={item.summary} /> : null}
      </div>
    </>
  )

  if (item.path) {
    return (
      <article className="listing-card">
        {content}
        {actionContent ?? (
          <Link className="button-link button-link--ghost listing-card-action" to={item.path}>
            <RichTextValue value={actionLabel} />
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
          <RichTextValue value={actionLabel} />
        </a>
      )}
    </article>
  )
}
