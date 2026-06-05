import { useMemo, useState } from 'react'
import { formatPropertyRichHtml } from '../lib/formatPropertyRichHtml'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'

function PreviewField({ children, wide = false }) {
  return <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>{children}</label>
}

function PreviewInput({ disabled, label, onChange, type = 'text', value, wide = false }) {
  return (
    <PreviewField wide={wide}>
      <span>{label}</span>
      <input disabled={disabled} onChange={(event) => onChange(event.target.value)} type={type} value={value ?? ''} />
    </PreviewField>
  )
}

function PreviewTextArea({ disabled, label, onChange, placeholder = '', rows = 5, value, wide = true }) {
  return (
    <PreviewField wide={wide}>
      <span>{label}</span>
      <textarea
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value ?? ''}
      />
    </PreviewField>
  )
}

function PreviewSection({ title, html, children, controls, actions = null, compactTail = false, listSections = false }) {
  const normalizedHtml =
    compactTail || listSections ? formatPropertyRichHtml(html, { compactTail, listSections }) : normalizeSiteHtml(html)
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)
  const hasControls = Boolean(controls)

  if (!hasHtml && !hasChildren && !hasControls) {
    return null
  }

  return (
    <section className="admin-property-preview-section">
      <div className="admin-property-preview-section-header admin-property-preview-section-header--split">
        <div>
          <h4>{title}</h4>
          <div aria-hidden="true" className="admin-property-preview-rule" />
        </div>
        {actions}
      </div>

      {hasControls ? <div className="admin-property-preview-controls">{controls}</div> : null}

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

export function AdminPropertyPreview({
  disabled = false,
  editable = false,
  formState = null,
  onAddAmenityGroup,
  onAddGalleryImage,
  onAddReviewEntry,
  onAmenityGroupChange,
  onFieldChange,
  onGalleryImageChange,
  onMoveGalleryImage,
  onRemoveAmenityGroup,
  onRemoveGalleryImage,
  onRemoveReviewEntry,
  onReviewEntryChange,
  property,
}) {
  const galleryImages = useMemo(
    () => (Array.isArray(property?.gallery) ? property.gallery.filter((image) => image?.url) : []),
    [property],
  )
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const safeImageIndex = galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property?.heroImage ?? null
  const bannerImage = property?.heroImage ?? activeImage ?? null
  const shortDescriptionLines = getShortDescriptionLines(property ?? {})
  const detailLine = [property?.bedroomLabel, property?.maxGuests ? `${property.maxGuests} guests` : '', property?.location]
    .filter(Boolean)
    .join(' | ')

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
          {editable && formState ? (
            <div className="admin-property-preview-controls">
              <div className="admin-preview-field-grid">
                <PreviewInput disabled={disabled} label="Hero Image URL" onChange={(value) => onFieldChange('heroImageUrl', value)} type="url" value={formState.heroImageUrl} wide />
                <PreviewInput disabled={disabled} label="Hero Image Alt Text" onChange={(value) => onFieldChange('heroImageAlt', value)} value={formState.heroImageAlt} wide />
              </div>
            </div>
          ) : null}

          <div className="admin-property-preview-title">
            <h3>{property?.name || 'Untitled Property'}</h3>
            <p>{detailLine}</p>
          </div>

          {editable && formState ? (
            <div className="admin-property-preview-controls">
              <div className="admin-preview-field-grid admin-preview-field-grid--tight">
                <PreviewInput disabled={disabled} label="Property Name" onChange={(value) => onFieldChange('name', value)} value={formState.name} />
                <PreviewInput disabled={disabled} label="URL Path" onChange={(value) => onFieldChange('slug', value)} value={formState.slug} />
                <PreviewInput disabled={disabled} label="Bedrooms" onChange={(value) => onFieldChange('bedrooms', value)} type="number" value={formState.bedrooms} />
                <PreviewInput disabled={disabled} label="Bathrooms" onChange={(value) => onFieldChange('bathrooms', value)} type="number" value={formState.bathrooms} />
                <PreviewInput disabled={disabled} label="Max Guests" onChange={(value) => onFieldChange('maxGuests', value)} type="number" value={formState.maxGuests} />
                <PreviewInput disabled={disabled} label="Price" onChange={(value) => onFieldChange('price', value)} value={formState.price} />
                <PreviewInput disabled={disabled} label="Location" onChange={(value) => onFieldChange('location', value)} value={formState.location} wide />
              </div>
            </div>
          ) : null}

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
                <div aria-label="Property image gallery" className="admin-property-preview-thumbnails" role="list">
                  {galleryImages.map((image, imageIndex) => (
                    <button
                      aria-label={`Show property image ${imageIndex + 1}`}
                      aria-pressed={imageIndex === safeImageIndex}
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

          {editable && formState ? (
            <PreviewSection
              actions={
                <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddGalleryImage} type="button">
                  Add Image
                </button>
              }
              title="Gallery Images"
            >
              <div className="admin-image-grid">
                {formState.galleryImages.length === 0 ? <p className="admin-empty">No gallery images yet.</p> : null}

                {formState.galleryImages.map((image, index) => (
                  <div className="admin-image-card" key={image.id}>
                    {image.url ? (
                      <div className="admin-image-thumb">
                        <img alt={image.alt || `Property image ${index + 1}`} loading="lazy" src={image.url} />
                      </div>
                    ) : (
                      <div className="admin-image-placeholder">Add an image URL to preview it here.</div>
                    )}

                    <div className="admin-image-card-meta">
                      <strong>Gallery image {index + 1}</strong>
                      <span>{index === 0 ? 'First thumbnail in the gallery strip' : 'Shown in the gallery strip'}</span>
                    </div>

                    <PreviewInput
                      disabled={disabled}
                      label="Image URL"
                      onChange={(value) => onGalleryImageChange(image.id, 'url', value)}
                      type="url"
                      value={image.url}
                      wide
                    />
                    <PreviewInput
                      disabled={disabled}
                      label="Image Description"
                      onChange={(value) => onGalleryImageChange(image.id, 'alt', value)}
                      value={image.alt}
                    />
                    <PreviewInput
                      disabled={disabled}
                      label="Image Title"
                      onChange={(value) => onGalleryImageChange(image.id, 'title', value)}
                      value={image.title}
                    />

                    <div className="admin-inline-actions">
                      <button className="button-link button-link--ghost admin-action" disabled={disabled || index === 0} onClick={() => onMoveGalleryImage(image.id, -1)} type="button">
                        Move Earlier
                      </button>
                      <button
                        className="button-link button-link--ghost admin-action"
                        disabled={disabled || index === formState.galleryImages.length - 1}
                        onClick={() => onMoveGalleryImage(image.id, 1)}
                        type="button"
                      >
                        Move Later
                      </button>
                      <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => onRemoveGalleryImage(image.id)} type="button">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </PreviewSection>
          ) : null}

          <PreviewSection
            controls={
              editable && formState ? (
                <div className="admin-preview-field-grid">
                  <PreviewTextArea disabled={disabled} label="Short Description" onChange={(value) => onFieldChange('shortDescription', value)} rows={3} value={formState.shortDescription} wide />
                  <PreviewTextArea
                    disabled={disabled}
                    label="Highlights"
                    onChange={(value) => onFieldChange('highlightsText', value)}
                    placeholder="Ocean views&#10;Private pool&#10;5-minute walk to beach"
                    rows={5}
                    value={formState.highlightsText}
                    wide
                  />
                </div>
              ) : null
            }
            title="Short Description"
          >
            <div className="admin-property-preview-facts">
              {shortDescriptionLines.length > 0 ? (
                shortDescriptionLines.map((line) => (
                  <div className="property-fact-line" key={line}>
                    {line}
                  </div>
                ))
              ) : (
                <p className="admin-empty">Add short description copy or highlights to preview this section.</p>
              )}
            </div>
          </PreviewSection>

          <PreviewSection
            controls={
              editable && formState ? (
                <PreviewTextArea
                  disabled={disabled}
                  label="Description"
                  onChange={(value) => onFieldChange('descriptionText', value)}
                  placeholder="Separate paragraphs with a blank line."
                  rows={8}
                  value={formState.descriptionText}
                  wide
                />
              ) : null
            }
            html={property?.descriptionHtml}
            compactTail
            title="Description"
          />

          <PreviewSection
            actions={
              editable ? (
                <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddAmenityGroup} type="button">
                  Add Group
                </button>
              ) : null
            }
            controls={
              editable && formState ? (
                <div className="admin-collection-list">
                  {formState.amenityGroups.map((group) => (
                    <div className="admin-collection-card" key={group.id}>
                      <PreviewInput disabled={disabled} label="Group Name" onChange={(value) => onAmenityGroupChange(group.id, 'title', value)} value={group.title} />
                      <PreviewTextArea
                        disabled={disabled}
                        label="Amenities"
                        onChange={(value) => onAmenityGroupChange(group.id, 'itemsText', value)}
                        placeholder="Air conditioning&#10;Full kitchen&#10;Private pool"
                        rows={5}
                        value={group.itemsText}
                      />
                      <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => onRemoveAmenityGroup(group.id)} type="button">
                        Remove Group
                      </button>
                    </div>
                  ))}
                </div>
              ) : null
            }
            html={property?.amenitiesHtml}
            listSections
            title="Amenities"
          />

          <PreviewSection
            actions={
              editable ? (
                <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddReviewEntry} type="button">
                  Add Review
                </button>
              ) : null
            }
            controls={
              editable && formState ? (
                <div className="admin-collection-list">
                  {formState.reviewEntries.map((entry) => (
                    <div className="admin-collection-card" key={entry.id}>
                      <PreviewTextArea disabled={disabled} label="Review Text" onChange={(value) => onReviewEntryChange(entry.id, 'quote', value)} rows={4} value={entry.quote} />
                      <PreviewInput disabled={disabled} label="Author" onChange={(value) => onReviewEntryChange(entry.id, 'author', value)} value={entry.author} />
                      <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={() => onRemoveReviewEntry(entry.id)} type="button">
                        Remove Review
                      </button>
                    </div>
                  ))}
                </div>
              ) : null
            }
            html={property?.reviewsHtml}
            title="Reviews"
          />

          <PreviewSection
            controls={
              editable && formState ? (
                <div className="admin-preview-field-grid admin-preview-field-grid--tight">
                  <PreviewInput disabled={disabled} label="Contact Name" onChange={(value) => onFieldChange('bookingContactName', value)} value={formState.bookingContactName} />
                  <PreviewInput disabled={disabled} label="Email" onChange={(value) => onFieldChange('bookingEmail', value)} type="email" value={formState.bookingEmail} />
                  <PreviewTextArea disabled={disabled} label="Booking Note" onChange={(value) => onFieldChange('bookingNote', value)} rows={4} value={formState.bookingNote} wide />
                </div>
              ) : null
            }
            title="Booking Contact"
          >
            <div className="admin-property-preview-booking">
              {property?.booking?.contactName ? <p>{property.booking.contactName}</p> : null}
              {property?.booking?.email ? <p>{property.booking.email}</p> : null}
              {property?.booking?.note ? <p>{property.booking.note}</p> : null}
              {!property?.booking?.contactName && !property?.booking?.email && !property?.booking?.note ? (
                <p className="admin-empty">Add booking contact details to preview this section.</p>
              ) : null}
            </div>
          </PreviewSection>
        </div>
      </div>
    </aside>
  )
}
