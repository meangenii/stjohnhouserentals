import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'

function getImageSrc(image) {
  return image?.src || image?.url || ''
}

export function ContentPage({ page }) {
  const contentHtml = normalizeSiteHtml(page.bodyHtml).trim()
  const hasHtmlHeading = /<h1[\s>]/i.test(contentHtml)
  const imageGallery = Array.isArray(page.imageGallery) ? page.imageGallery.filter((image) => getImageSrc(image)) : []

  return (
    <article className="snapshot-page">
      <div className="snapshot-page-inner">
        {contentHtml ? (
          <div className="snapshot-flow">
            {!hasHtmlHeading && page.title ? <h1>{page.title}</h1> : null}
            <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
          </div>
        ) : (
          <header className="snapshot-fallback">
            <h1>{page.title || page.navLabel}</h1>
            {page.metaDescription ? <p>{page.metaDescription}</p> : null}
          </header>
        )}

        {imageGallery.length ? (
          <section className="snapshot-gallery" aria-label={`${page.navLabel} image gallery`}>
            {imageGallery.map((image, index) => (
              <figure className="snapshot-gallery-item" key={`${getImageSrc(image)}-${index}`}>
                <img
                  alt={image.alt || `${page.navLabel} image ${index + 1}`}
                  className="snapshot-gallery-image"
                  decoding="async"
                  loading="lazy"
                  src={getImageSrc(image)}
                />
              </figure>
            ))}
          </section>
        ) : null}
      </div>
    </article>
  )
}
