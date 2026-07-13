import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPropertyContactActions } from '../lib/propertyContact'
import { getShortDescriptionLines } from '../lib/propertyDetailHelpers'
import { getPropertyTemplateVariantConfig } from '../lib/propertyTemplateVariants'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { PropertyAvailabilityCalendar } from './PropertyAvailabilityCalendar'
import { PropertyContentSection } from './PropertyContentSection'
import { RichTextValue } from './RichTextValue'

export function PropertyDetailView({ property }) {
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  if (!property) {
    return null
  }

  const shortDescriptionLines = getShortDescriptionLines(property)
  const propertyGallery = Array.isArray(property.gallery) ? property.gallery.filter(Boolean) : []
  const templateVariant = getPropertyTemplateVariantConfig(property.templateVariant)
  const galleryImages = propertyGallery.length > 0 ? propertyGallery : property.heroImage ? [property.heroImage] : []
  const safeImageIndex = galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property.heroImage
  const showPreviousGalleryImage = () => {
    if (galleryImages.length <= 1) {
      return
    }

    setActiveImageIndex((currentIndex) => {
      const normalizedIndex = Math.min(Math.max(currentIndex, 0), galleryImages.length - 1)
      return normalizedIndex === 0 ? galleryImages.length - 1 : normalizedIndex - 1
    })
  }
  const showNextGalleryImage = () => {
    if (galleryImages.length <= 1) {
      return
    }

    setActiveImageIndex((currentIndex) => {
      const normalizedIndex = Math.min(Math.max(currentIndex, 0), galleryImages.length - 1)
      return normalizedIndex === galleryImages.length - 1 ? 0 : normalizedIndex + 1
    })
  }
  const bannerImageUrl = property.heroImage?.url
    ? buildRemoteImageUrl(property.heroImage, { width: 1600, height: 540 })
    : activeImage?.url
      ? buildRemoteImageUrl(activeImage, { width: 1600, height: 540 })
      : ''
  const sectionConfigs = templateVariant.sections
  const contactActions = getPropertyContactActions(property)
  const propertySections = {
    shortDescription:
      shortDescriptionLines.length > 0 || sectionConfigs.shortDescription.renderWhenEmpty ? (
        <PropertyContentSection
          key="shortDescription"
          renderWhenEmpty={sectionConfigs.shortDescription.renderWhenEmpty}
          showHeader={sectionConfigs.shortDescription.showHeader}
          title={sectionConfigs.shortDescription.title}
        >
          <div className="property-fact-stack">
            {shortDescriptionLines.map((line) => (
              <RichTextValue as="div" className="property-fact-line" key={line} value={line} />
            ))}
          </div>

          {contactActions.length > 0 ? (
            <div className="property-contact-actions">
              {contactActions.map((action) => (
                <a
                  className={`button-link ${action.toneClassName} property-contact-button`.trim()}
                  href={action.href}
                  key={action.key}
                >
                  {action.label}
                </a>
              ))}
            </div>
          ) : null}
        </PropertyContentSection>
      ) : null,
    description: (
      <PropertyContentSection
        key="description"
        compactTail
        html={property.descriptionHtml}
        renderWhenEmpty={sectionConfigs.description.renderWhenEmpty}
        showHeader={sectionConfigs.description.showHeader}
        title={sectionConfigs.description.title}
      />
    ),
    calendar: property.calendarUrl ? (
      <PropertyContentSection
        className="property-template-section--calendar"
        key="calendar"
        showHeader={sectionConfigs.calendar.showHeader}
        title={sectionConfigs.calendar.title}
      >
        <PropertyAvailabilityCalendar propertySlug={property.slug} />
      </PropertyContentSection>
    ) : null,
    amenities: (
      <PropertyContentSection
        key="amenities"
        className="property-template-section--amenities"
        html={property.amenitiesHtml}
        listSections
        renderWhenEmpty={sectionConfigs.amenities.renderWhenEmpty}
        showHeader={sectionConfigs.amenities.showHeader}
        title={sectionConfigs.amenities.title}
      />
    ),
    reviews: (
      <PropertyContentSection
        key="reviews"
        className="property-template-section--reviews"
        html={property.reviewsHtml}
        reviewEntries
        renderWhenEmpty={sectionConfigs.reviews.renderWhenEmpty}
        showHeader={sectionConfigs.reviews.showHeader}
        title={sectionConfigs.reviews.title}
      />
    ),
  }

  return (
    <article className="property-page property-page--template">
      <section
        aria-hidden="true"
        className="property-banner"
        style={bannerImageUrl ? { backgroundImage: `linear-gradient(rgba(7, 26, 54, 0.18), rgba(7, 26, 54, 0.18)), url(${bannerImageUrl})` } : undefined}
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

                {galleryImages.length > 1 ? (
                  <>
                    <button
                      aria-label="Show previous property image"
                      className="property-gallery-nav property-gallery-nav--previous"
                      type="button"
                      onClick={showPreviousGalleryImage}
                    >
                      <span aria-hidden="true">&lt;</span>
                    </button>
                    <button
                      aria-label="Show next property image"
                      className="property-gallery-nav property-gallery-nav--next"
                      type="button"
                      onClick={showNextGalleryImage}
                    >
                      <span aria-hidden="true">&gt;</span>
                    </button>
                  </>
                ) : null}
              </div>

              {galleryImages.length > 1 ? (
                <div className="property-gallery-thumbnails-shell">
                  <p aria-hidden="true" className="property-gallery-swipe-hint">
                    Swipe for more photos <span>-{'>'}</span>
                  </p>

                  <div aria-label="Property image gallery" className="property-gallery-thumbnails" role="list">
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

          {templateVariant.sectionOrder.map((sectionKey) => propertySections[sectionKey]).filter(Boolean)}

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
