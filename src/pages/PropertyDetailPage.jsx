import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatPropertyRichHtml } from '../lib/formatPropertyRichHtml'
import { getPropertyBySlug } from '../lib/propertyRepository'
import { buildRemoteImageUrl } from '../lib/remoteImage'

function PropertyContentSection({
  title,
  html,
  children,
  className = '',
  compactTail = false,
  listSections = false,
  reviewEntries = false,
}) {
  const normalizedHtml = formatPropertyRichHtml(html, { compactTail, listSections, reviewEntries })
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
  const [thumbnailRailState, setThumbnailRailState] = useState({
    canScroll: false,
    atStart: true,
    atEnd: true,
  })
  const thumbnailsRef = useRef(null)

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

  useEffect(() => {
    const thumbnailsElement = thumbnailsRef.current

    if (!thumbnailsElement) {
      setThumbnailRailState({
        canScroll: false,
        atStart: true,
        atEnd: true,
      })
      return undefined
    }

    const syncThumbnailRailState = () => {
      const maxScrollLeft = Math.max(0, thumbnailsElement.scrollWidth - thumbnailsElement.clientWidth)
      const canScroll = maxScrollLeft > 8
      const nextState = {
        canScroll,
        atStart: !canScroll || thumbnailsElement.scrollLeft <= 8,
        atEnd: !canScroll || thumbnailsElement.scrollLeft >= maxScrollLeft - 8,
      }

      setThumbnailRailState((currentState) => {
        if (
          currentState.canScroll === nextState.canScroll &&
          currentState.atStart === nextState.atStart &&
          currentState.atEnd === nextState.atEnd
        ) {
          return currentState
        }

        return nextState
      })
    }

    syncThumbnailRailState()

    thumbnailsElement.addEventListener('scroll', syncThumbnailRailState, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncThumbnailRailState()) : null

    resizeObserver?.observe(thumbnailsElement)
    window.addEventListener('resize', syncThumbnailRailState)

    return () => {
      thumbnailsElement.removeEventListener('scroll', syncThumbnailRailState)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', syncThumbnailRailState)
    }
  }, [slug, state.status])

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
  const thumbnailRailClassName = [
    'property-gallery-thumbnails-shell',
    thumbnailRailState.canScroll ? 'property-gallery-thumbnails-shell--scrollable' : '',
    thumbnailRailState.atStart ? 'property-gallery-thumbnails-shell--at-start' : '',
    thumbnailRailState.atEnd ? 'property-gallery-thumbnails-shell--at-end' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const bannerImageUrl = property.heroImage?.url
    ? buildRemoteImageUrl(property.heroImage, { width: 1600, height: 540 })
    : activeImage?.url
      ? buildRemoteImageUrl(activeImage, { width: 1600, height: 540 })
      : ''

  return (
    <article className="property-page property-page--template">
      <section
        className="property-banner"
        style={bannerImageUrl ? { backgroundImage: `linear-gradient(rgba(7, 26, 54, 0.18), rgba(7, 26, 54, 0.18)), url(${bannerImageUrl})` } : undefined}
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
                  src={buildRemoteImageUrl(activeImage, { width: 1800, height: 1400, mode: 'fit' })}
                />
              </div>

              {galleryImages.length > 1 ? (
                <div className={thumbnailRailClassName}>
                  <p className="property-gallery-swipe-hint" aria-hidden="true">
                    Swipe for more photos <span>-{'>'}</span>
                  </p>

                  <p className="visually-hidden" id="property-gallery-swipe-instructions">
                    Swipe or scroll horizontally to see more property photos.
                  </p>

                  <div
                    ref={thumbnailsRef}
                    aria-describedby={thumbnailRailState.canScroll ? 'property-gallery-swipe-instructions' : undefined}
                    aria-label="Property image gallery"
                    className="property-gallery-thumbnails"
                    role="list"
                  >
                    {galleryImages.map((image, imageIndex) => (
                      <button
                        aria-label={`Show property image ${imageIndex + 1}`}
                        aria-pressed={imageIndex === safeImageIndex}
                        className={`property-gallery-thumbnail ${
                          imageIndex === safeImageIndex ? 'property-gallery-thumbnail--active' : ''
                        }`}
                        key={`${image.url}-${imageIndex}`}
                        type="button"
                        onClick={() => setActiveImageIndex(imageIndex)}
                      >
                        <img
                          alt={image.alt || `${property.name} view ${imageIndex + 1}`}
                          decoding="async"
                          loading="lazy"
                          src={buildRemoteImageUrl(image, { width: 520, height: 360 })}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {shortDescriptionLines.length > 0 ? (
            <PropertyContentSection title="Short Description">
              <div className="property-fact-stack">
                {shortDescriptionLines.map((line) => (
                  <div className="property-fact-line" key={line}>
                    {line}
                  </div>
                ))}
              </div>
            </PropertyContentSection>
          ) : null}

          <PropertyContentSection compactTail html={property.descriptionHtml} title="Description" />
          <PropertyContentSection html={property.amenitiesHtml} listSections title="Amenities" />
          <PropertyContentSection className="property-template-section--reviews" html={property.reviewsHtml} reviewEntries title="Reviews" />

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
