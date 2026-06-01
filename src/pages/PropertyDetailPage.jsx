import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import heroBeach from '../content/hero_beach.png'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { getPropertyBySlug } from '../lib/propertyRepository'
import { buildWixImageUrl } from '../lib/wixImage'

function PropertyContentSection({ title, html, children, className = '' }) {
  const normalizedHtml = normalizeSiteHtml(html)
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)

  if (!hasHtml && !hasChildren) {
    return null
  }

  return (
    <section className={`property-template-section ${className}`.trim()}>
      <header className="property-template-section-header">
        <h2>{title}</h2>
        <div aria-hidden="true" className="property-template-rule" />
      </header>

      {hasHtml ? <div className="property-rich-copy" dangerouslySetInnerHTML={{ __html: normalizedHtml }} /> : children}
    </section>
  )
}

function getShortDescriptionLines(property) {
  if (Array.isArray(property.facts) && property.facts.length > 0) {
    return property.facts.map((fact) => String(fact).trim()).filter(Boolean)
  }

  return String(property.shortDescription ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function PropertyDetailPage() {
  const { slug = '' } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  useEffect(() => {
    let cancelled = false

    getPropertyBySlug(slug)
      .then((property) => {
        if (cancelled) {
          return
        }

        if (!property) {
          setState({ status: 'not-found' })
          return
        }

        setActiveImageIndex(0)
        setState({ status: 'ready', property })
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown property load error'
          setState({ status: 'error', message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (state.status === 'loading') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Loading property...</h1>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Property unavailable</h1>
        <p>{state.message}</p>
      </section>
    )
  }

  if (state.status === 'not-found') {
    return (
      <section className="page-section property-page property-page--status">
        <h1>Property not found</h1>
      </section>
    )
  }

  const { property } = state
  const propertyGallery = Array.isArray(property.gallery) ? property.gallery.filter(Boolean) : []
  const shortDescriptionLines = getShortDescriptionLines(property)
  const galleryImages = propertyGallery.length > 0 ? propertyGallery : property.heroImage ? [property.heroImage] : []
  const safeImageIndex =
    galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property.heroImage
  const bannerImageUrl = property.heroImage?.url
    ? buildWixImageUrl(property.heroImage, { width: 1600, height: 540 })
    : activeImage?.url
      ? buildWixImageUrl(activeImage, { width: 1600, height: 540 })
      : heroBeach

  return (
    <article className="property-page property-page--template">
      <section
        className="property-banner"
        style={{
          backgroundImage: `linear-gradient(rgba(7, 26, 54, 0.18), rgba(7, 26, 54, 0.18)), url(${bannerImageUrl})`,
        }}
        aria-hidden="true"
      />

      <section className="property-template-shell">
        <div className="property-template-inner">
          <header className="property-template-header">
            <h1>{property.name}</h1>
          </header>

          {activeImage ? (
            <section className="property-gallery">
              <div className="property-gallery-stage">
                <img
                  alt={activeImage.alt || `${property.name} main view`}
                  className="property-gallery-image"
                  decoding="async"
                  loading="eager"
                  src={buildWixImageUrl(activeImage, { width: 1600, height: 520 })}
                />
              </div>

              {galleryImages.length > 1 ? (
                <div className="property-thumbnail-row" role="list" aria-label="Property gallery thumbnails">
                  {galleryImages.map((image, imageIndex) => (
                    <button
                      className={`property-thumbnail ${imageIndex === safeImageIndex ? 'property-thumbnail--active' : ''}`}
                      key={`${image.url}-${imageIndex}`}
                      type="button"
                      onClick={() => setActiveImageIndex(imageIndex)}
                    >
                      <img
                        alt={image.alt || `${property.name} view ${imageIndex + 1}`}
                        decoding="async"
                        loading="lazy"
                        src={buildWixImageUrl(image, { width: 420, height: 300 })}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {shortDescriptionLines.length > 0 ? (
            <PropertyContentSection title="Short Description">
              <div className="property-fact-stack">
                {shortDescriptionLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </PropertyContentSection>
          ) : null}

          <PropertyContentSection html={property.descriptionHtml} title="Description" />
          <PropertyContentSection html={property.amenitiesHtml} title="Amenities" />
          <PropertyContentSection html={property.reviewsHtml} title="Reviews" />

          {property.previousProperty || property.nextProperty ? (
            <nav aria-label="Adjacent properties" className="property-adjacent-nav">
              <div className="property-adjacent-slot">
                {property.previousProperty ? (
                  <Link
                    aria-label={`Previous property: ${property.previousProperty.name}`}
                    className="property-adjacent-link"
                    to={property.previousProperty.path}
                  >
                    previous item
                  </Link>
                ) : null}
              </div>

              <div className="property-adjacent-slot property-adjacent-slot--end">
                {property.nextProperty ? (
                  <Link
                    aria-label={`Next property: ${property.nextProperty.name}`}
                    className="property-adjacent-link"
                    to={property.nextProperty.path}
                  >
                    next item
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>
      </section>
    </article>
  )
}
