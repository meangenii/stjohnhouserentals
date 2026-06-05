import { EditableImage, EditableRichHtml, EditableText } from './AdminInlinePageEdit'
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
            {!hasHtmlHeading && page.title ? (
              <EditableText as="h1" label="Page Title" multiline path={['title']} rows={2} value={page.title}>
                {page.title}
              </EditableText>
            ) : null}
            <EditableRichHtml className="snapshot-rich-html" html={contentHtml} path={['bodyHtml']} title="Page Body" />
          </div>
        ) : (
          <header className="snapshot-fallback">
            <EditableText as="h1" label="Page Title" multiline path={['title']} rows={2} value={page.title || page.navLabel}>
              {page.title || page.navLabel}
            </EditableText>
            {page.metaDescription ? (
              <EditableText as="p" label="Search Description" multiline path={['metaDescription']} rows={4} value={page.metaDescription}>
                {page.metaDescription}
              </EditableText>
            ) : null}
          </header>
        )}

        {imageGallery.length ? (
          <section className="snapshot-gallery" aria-label={`${page.navLabel} image gallery`}>
            {imageGallery.map((image, index) => (
              <figure className="snapshot-gallery-item" key={`${getImageSrc(image)}-${index}`}>
                <EditableImage
                  alt={image.alt || `${page.navLabel} image ${index + 1}`}
                  className="snapshot-gallery-image"
                  decoding="async"
                  image={image}
                  path={['imageGallery', index]}
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
