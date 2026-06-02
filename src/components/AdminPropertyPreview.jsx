import { useMemo, useState } from 'react'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'

function PreviewSection({ title, html, children }) {
  const normalizedHtml = normalizeSiteHtml(html)
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)

  if (!hasHtml && !hasChildren) {
    return null
  }

  return (
    <section className="admin-property-preview-section">
      <div className="admin-property-preview-section-header">
        <h4>{title}</h4>
        <div aria-hidden="true" className="admin-property-preview-rule" />
      </div>

      {hasHtml ? (
        <div className="admin-property-preview-rich-copy" dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
      ) : (
        children
      )}
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

export function AdminPropertyPreview({ property }) {
  const galleryImages = useMemo(
    () => (Array.isArray(property?.gallery) ? property.gallery.filter((image) => image?.url) : []),
    [property],
  )
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const safeImageIndex = galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property?.heroImage ?? null
  const bannerImage = property?.heroImage ?? activeImage ?? null
  const shortDescriptionLines = getShortDescriptionLines(property ?? {})

  return (
    <aside className="admin-property-preview">
      <div className="admin-property-preview-frame">
        {bannerImage?.url ? (
          <div
            className="admin-property-preview-banner"
            style={{
              backgroundImage: `linear-gradient(rgba(7, 26, 54, 0.2), rgba(7, 26, 54, 0.2)), url(${buildRemoteImageUrl(bannerImage, {
                width: 1400,
                height: 520,
              })})`,
            }}
          />
        ) : (
          <div className="admin-property-preview-banner admin-property-preview-banner--empty">
            Add a hero image to preview the banner.
          </div>
        )}

        <div className="admin-property-preview-body">
          <div className="admin-property-preview-title">
            <div className="eyebrow">Live Preview</div>
            <h3>{property?.name || 'Untitled Property'}</h3>
            <p>
              {[property?.bedroomLabel, property?.maxGuests ? `${property.maxGuests} guests` : '', property?.location]
                .filter(Boolean)
                .join(' | ')}
            </p>
          </div>

          {activeImage?.url ? (
            <section className="admin-property-preview-gallery">
              <div className="admin-property-preview-stage">
                <img
                  alt={activeImage.alt || property?.name || 'Property image'}
                  decoding="async"
                  loading="lazy"
                  src={buildRemoteImageUrl(activeImage, { width: 1200, height: 780 })}
                />
              </div>

              {galleryImages.length > 1 ? (
                <div className="admin-property-preview-thumbnails" role="list" aria-label="Property gallery">
                  {galleryImages.map((image, imageIndex) => (
                    <button
                      className={`admin-property-preview-thumbnail ${
                        imageIndex === safeImageIndex ? 'admin-property-preview-thumbnail--active' : ''
                      }`.trim()}
                      key={`${image.url}-${imageIndex}`}
                      type="button"
                      onClick={() => setActiveImageIndex(imageIndex)}
                    >
                      <img
                        alt={image.alt || `${property?.name || 'Property'} view ${imageIndex + 1}`}
                        decoding="async"
                        loading="lazy"
                        src={buildRemoteImageUrl(image, { width: 320, height: 220 })}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {shortDescriptionLines.length > 0 ? (
            <PreviewSection title="Short Description">
              <div className="admin-property-preview-facts">
                {shortDescriptionLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </PreviewSection>
          ) : null}

          <PreviewSection html={property?.descriptionHtml} title="Description" />
          <PreviewSection html={property?.amenitiesHtml} title="Amenities" />
          <PreviewSection html={property?.reviewsHtml} title="Reviews" />

          {property?.booking?.contactName || property?.booking?.email || property?.booking?.note ? (
            <section className="admin-property-preview-section">
              <div className="admin-property-preview-section-header">
                <h4>Booking Contact</h4>
                <div aria-hidden="true" className="admin-property-preview-rule" />
              </div>

              <div className="admin-property-preview-booking">
                {property.booking.contactName ? <p>{property.booking.contactName}</p> : null}
                {property.booking.email ? <p>{property.booking.email}</p> : null}
                {property.booking.note ? <p>{property.booking.note}</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
