import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'

function getImageAssetKey(url) {
  const match = String(url ?? '').match(/\/media\/([^/?]+)/)
  return match?.[1] ?? String(url ?? '').trim()
}

export function SnapshotPage({ page, children, showImageGallery = true, excludedImageUrls = [] }) {
  const contentHtml = normalizeSiteHtml(page.contentHtml).trim()
  const excludedImageKeys = new Set(excludedImageUrls.map((url) => getImageAssetKey(url)).filter(Boolean))
  const imageGallery = showImageGallery
    ? (page.imageGallery ?? []).filter((image) => !excludedImageKeys.has(getImageAssetKey(image.url)))
    : []
  const imageGallerySection = imageGallery.length ? (
    <section className="snapshot-gallery" aria-label={`${page.navLabel} image gallery`}>
      {imageGallery.map((image, index) => (
        <figure className="snapshot-gallery-item" key={`${image.url}-${index}`}>
          <img
            alt={image.alt || `${page.navLabel} image ${index + 1}`}
            className="snapshot-gallery-image"
            src={image.url}
          />
        </figure>
      ))}
    </section>
  ) : null

  return (
    <article className="snapshot-page">
      <div className="snapshot-page-inner">
        {contentHtml ? (
          <div className="snapshot-flow" dangerouslySetInnerHTML={{ __html: contentHtml }} />
        ) : (
          <header className="snapshot-fallback">
            <h1>{page.h1}</h1>
            {page.metaDescription ? <p>{page.metaDescription}</p> : null}
          </header>
        )}

        {imageGallerySection}

        {children}
      </div>
    </article>
  )
}
