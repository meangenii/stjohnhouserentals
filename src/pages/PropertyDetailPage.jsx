import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import heroBeach from '../content/hero_beach.png'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { getPropertyBySlug } from '../lib/propertyRepository'
import { buildWixImageUrl } from '../lib/wixImage'

function PropertySection({ html, children, className = '' }) {
  const normalizedHtml = normalizeSiteHtml(html)
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)

  if (!hasHtml && !hasChildren) {
    return null
  }

  return (
    <section className={`property-template-section ${className}`.trim()}>
      {hasHtml ? <div className="property-rich-copy" dangerouslySetInnerHTML={{ __html: normalizedHtml }} /> : children}
    </section>
  )
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
  const galleryImages = property.gallery.length > 0 ? property.gallery : property.heroImage ? [property.heroImage] : []
  const safeImageIndex =
    galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property.heroImage
  const bannerImageUrl = property.heroImage?.url
    ? buildWixImageUrl(property.heroImage, { width: 1600, height: 540 })
    : activeImage?.url
      ? buildWixImageUrl(activeImage, { width: 1600, height: 540 })
      : heroBeach
  const actionLinks = property.externalLinks ?? []

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

          {actionLinks.length ? (
            <nav className="detail-action-row" aria-label={`${property.name} contact links`}>
              {actionLinks.map((link) => (
                <a
                  className="button-link button-link--ghost"
                  href={link.href}
                  key={link.href}
                  rel={link.isMailto || link.isPhone ? undefined : 'noreferrer'}
                  target={link.isMailto || link.isPhone ? undefined : '_blank'}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}

          {activeImage ? (
            <section className="property-gallery">
              <div className="property-gallery-stage">
                <img
                  alt={activeImage.alt || `${property.name} main view`}
                  className="property-gallery-image"
                  decoding="async"
                  loading="eager"
                  src={buildWixImageUrl(activeImage, { width: 1200, height: 900, mode: 'fit' })}
                />

                {galleryImages.length > 1 ? (
                  <>
                    <button
                      aria-label="Previous image"
                      className="property-gallery-arrow property-gallery-arrow--previous"
                      type="button"
                      onClick={() =>
                        setActiveImageIndex((currentIndex) =>
                          currentIndex === 0 ? galleryImages.length - 1 : currentIndex - 1,
                        )
                      }
                    >
                      {'<'}
                    </button>
                    <button
                      aria-label="Next image"
                      className="property-gallery-arrow property-gallery-arrow--next"
                      type="button"
                      onClick={() =>
                        setActiveImageIndex((currentIndex) =>
                          currentIndex === galleryImages.length - 1 ? 0 : currentIndex + 1,
                        )
                      }
                    >
                      {'>'}
                    </button>
                  </>
                ) : null}
              </div>

              {galleryImages.length > 1 ? (
                <div className="property-thumbnail-row" role="list" aria-label="Property gallery">
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
                        src={buildWixImageUrl(image, { width: 180, height: 140 })}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <PropertySection>
            <div className="property-fact-stack">
              {property.facts.map((fact) => (
                <p key={fact}>{fact}</p>
              ))}
            </div>
          </PropertySection>

          <PropertySection html={property.descriptionHtml} />
          <PropertySection html={property.amenitiesHtml} />
          <PropertySection html={property.reviewsHtml} />
        </div>
      </section>
    </article>
  )
}
