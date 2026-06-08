import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatPropertyRichHtml } from '../lib/formatPropertyRichHtml'
import { getPropertyTemplateVariantConfig } from '../lib/propertyTemplateVariants'
import { buildRemoteImageUrl } from '../lib/remoteImage'
import { AdminMediaManager } from './AdminMediaManager'
import { AdminRichTextEditor } from './AdminRichTextEditor'

const PROPERTY_DESCRIPTION_SNIPPETS = [
  {
    label: 'Rates',
    html: [
      '<p><strong>Property Weekly Rates</strong></p>',
      '<p><strong>High Season</strong></p>',
      '<p><strong>January 3 - April 14</strong></p>',
      '<p>(7 Night Minimum)</p>',
      '<p>1-4 Guests $0</p>',
      '<p><strong>Low Season</strong></p>',
      '<p><strong>April 15 - December 19</strong></p>',
      '<p>(7 Night Minimum)</p>',
      '<p>1-4 Guests $0</p>',
      '<p>+12.5% Hotel Tax</p>',
      '<p><strong>Note: Until confirmed, rates are subject to change without notice.</strong></p>',
    ].join(''),
  },
  {
    label: 'Booking',
    html: [
      '<p><strong>Booking Contact:</strong></p>',
      '<p>Contact Name</p>',
      '<p>Company Name</p>',
      '<p><a href="mailto:booking@example.com">booking@example.com</a> Email us with your desired schedule and number of people in your party or Call Us</p>',
      '<p><a href="tel:3405551212">340-555-1212</a> <strong>Office/Reservations</strong></p>',
    ].join(''),
  },
  {
    label: 'Policy',
    html: [
      '<p><strong>Rental and Cancellation Policy</strong></p>',
      '<p>50% deposit is required at the time of booking.</p>',
      '<p>Reservations within 60 days of arrival require 100% Booking Fees paid.</p>',
      '<p>Children are welcome.</p>',
      '<p>Check in 4:00pm - Check out 10:00am.</p>',
      '<p>Trip Cancellation Insurance is highly recommended year-round.</p>',
    ].join(''),
  },
]

function PreviewField({ alignTop = false, children, inlineLabel = false, wide = false }) {
  return (
    <label
      className={[
        'admin-field',
        wide ? 'admin-field--wide' : '',
        inlineLabel ? 'admin-field--inline' : '',
        alignTop ? 'admin-field--inline-top' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </label>
  )
}

function PreviewInput({ disabled, inlineLabel = false, label, onChange, type = 'text', value, wide = false }) {
  return (
    <PreviewField inlineLabel={inlineLabel} wide={wide}>
      <span>{label}</span>
      <input disabled={disabled} onChange={(event) => onChange(event.target.value)} type={type} value={value ?? ''} />
    </PreviewField>
  )
}

function PreviewTextArea({ disabled, inlineLabel = false, label, onChange, placeholder = '', rows = 5, value, wide = true }) {
  return (
    <PreviewField alignTop={inlineLabel} inlineLabel={inlineLabel} wide={wide}>
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

function PreviewSection({
  title,
  html,
  children,
  controls,
  actions = null,
  className = '',
  compactTail = false,
  controlsAfterContent = false,
  listSections = false,
  reviewEntries = false,
  renderWhenEmpty = false,
  showHeader = true,
}) {
  const normalizedHtml = formatPropertyRichHtml(html, { compactTail, listSections, reviewEntries })
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)
  const hasControls = Boolean(controls)
  const shouldRender = renderWhenEmpty || hasHtml || hasChildren || hasControls

  if (!shouldRender) {
    return null
  }

  return (
    <section className={`admin-property-preview-section ${className}`.trim()}>
      {showHeader ? (
        <div className="admin-property-preview-section-header admin-property-preview-section-header--split">
          <div>
            <h4>{title}</h4>
            <div aria-hidden="true" className="admin-property-preview-rule" />
          </div>
          {actions}
        </div>
      ) : actions ? (
        <div className="admin-property-preview-section-actions">{actions}</div>
      ) : null}

      {hasControls && !controlsAfterContent ? <div className="admin-property-preview-controls">{controls}</div> : null}

      {hasHtml ? (
        <div className="admin-property-preview-rich-copy" dangerouslySetInnerHTML={{ __html: normalizedHtml }} />
      ) : (
        children
      )}

      {hasControls && controlsAfterContent ? <div className="admin-property-preview-controls">{controls}</div> : null}
    </section>
  )
}

function getShortDescriptionLines(property) {
  return String(property.shortDescription ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function getAmenityGroupItems(itemsText = '') {
  return String(itemsText ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function AdminPropertyPreview({
  disabled = false,
  editable = false,
  formState = null,
  galleryEditorExpanded = false,
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
  onToggleGalleryEditor,
  property,
}) {
  const galleryImages = useMemo(
    () => (Array.isArray(property?.gallery) ? property.gallery.filter((image) => image?.url) : []),
    [property],
  )
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [descriptionEditorExpanded, setDescriptionEditorExpanded] = useState(false)
  const [amenitiesEditorExpanded, setAmenitiesEditorExpanded] = useState(false)
  const [expandedAmenityGroupId, setExpandedAmenityGroupId] = useState(null)
  const galleryEditorId = useId()
  const descriptionEditorId = useId()
  const amenitiesEditorId = useId()
  const hasTrackedAmenityGroupsRef = useRef(false)
  const previousAmenityGroupIdsRef = useRef([])

  useEffect(() => {
    const groupIds = Array.isArray(formState?.amenityGroups)
      ? formState.amenityGroups.map((group) => group?.id).filter(Boolean)
      : []

    if (!hasTrackedAmenityGroupsRef.current) {
      hasTrackedAmenityGroupsRef.current = true
      previousAmenityGroupIdsRef.current = groupIds
      return
    }

    const previousIds = previousAmenityGroupIdsRef.current
    const addedGroupIds = groupIds.filter((groupId) => !previousIds.includes(groupId))

    if (addedGroupIds.length > 0) {
      setAmenitiesEditorExpanded(true)
      setExpandedAmenityGroupId(addedGroupIds[addedGroupIds.length - 1])
    } else if (expandedAmenityGroupId && !groupIds.includes(expandedAmenityGroupId)) {
      setExpandedAmenityGroupId(groupIds[0] ?? null)
    }

    previousAmenityGroupIdsRef.current = groupIds
  }, [expandedAmenityGroupId, formState?.amenityGroups])

  const safeImageIndex = galleryImages.length > 0 ? Math.min(activeImageIndex, galleryImages.length - 1) : 0
  const activeImage = galleryImages[safeImageIndex] ?? property?.heroImage ?? null
  const bannerImage = property?.heroImage ?? activeImage ?? null
  const shortDescriptionLines = getShortDescriptionLines(property ?? {})
  const templateVariant = getPropertyTemplateVariantConfig(property?.templateVariant)
  const sectionConfigs = templateVariant.sections
  const detailLine = [property?.bedroomLabel, property?.maxGuests ? `${property.maxGuests} guests` : '', property?.location]
    .filter(Boolean)
    .join(' | ')
  const propertySections = {
    shortDescription: (
      <PreviewSection
        key="shortDescription"
        controls={
          editable && formState ? (
            <div className="admin-preview-field-grid">
              <PreviewTextArea
                disabled={disabled}
                label="Short Description"
                onChange={(value) => onFieldChange('shortDescription', value)}
                placeholder="Ocean views&#10;Private pool&#10;5-minute walk to beach"
                rows={5}
                value={formState.shortDescription}
                wide
              />
            </div>
          ) : null
        }
        renderWhenEmpty={sectionConfigs.shortDescription.renderWhenEmpty}
        showHeader={sectionConfigs.shortDescription.showHeader}
        title={sectionConfigs.shortDescription.title}
      >
        <div className="admin-property-preview-facts">
          {shortDescriptionLines.length > 0 ? (
            shortDescriptionLines.map((line) => (
              <div className="property-fact-line" key={line}>
                {line}
              </div>
            ))
          ) : (
            <p className="admin-empty">Add short description copy to preview this section.</p>
          )}
        </div>
      </PreviewSection>
    ),
    description: (
      <PreviewSection
        key="description"
        actions={
          editable ? (
            <button
              aria-controls={descriptionEditorId}
              aria-expanded={descriptionEditorExpanded}
              className="button-link button-link--ghost admin-action"
              disabled={disabled}
              type="button"
              onClick={() => setDescriptionEditorExpanded((currentValue) => !currentValue)}
            >
              {descriptionEditorExpanded ? 'Hide editor' : 'Edit content'}
            </button>
          ) : null
        }
        controlsAfterContent
        controls={
          editable && formState && descriptionEditorExpanded ? (
            <div id={descriptionEditorId}>
              <AdminRichTextEditor
                disabled={disabled}
                helperText="Rates are optional. Use bold paragraph lines, line breaks, and the quick inserts below to build rate, booking, and policy layouts like the live property pages."
                label="Description, Rates, and Booking Copy"
                onChange={(value) => onFieldChange('descriptionHtml', value)}
                placeholder="Write the property description here. Rates, booking contact, and rental policy content can be added if needed."
                snippets={PROPERTY_DESCRIPTION_SNIPPETS}
                value={formState.descriptionHtml}
              />
            </div>
          ) : null
        }
        compactTail
        html={property?.descriptionHtml}
        renderWhenEmpty={sectionConfigs.description.renderWhenEmpty || editable}
        showHeader={sectionConfigs.description.showHeader}
        title={sectionConfigs.description.title}
      >
        <p className="admin-empty">Add description, rate, booking, or policy copy to preview this section.</p>
      </PreviewSection>
    ),
    amenities: (
      <PreviewSection
        key="amenities"
        className="admin-property-preview-section--amenities"
        actions={
          editable ? (
            <div className="admin-inline-actions">
              <button
                aria-controls={amenitiesEditorId}
                aria-expanded={amenitiesEditorExpanded}
                className="button-link button-link--ghost admin-action"
                disabled={disabled}
                type="button"
                onClick={() => {
                  setAmenitiesEditorExpanded((currentValue) => {
                    const nextValue = !currentValue

                    if (nextValue && !expandedAmenityGroupId) {
                      setExpandedAmenityGroupId(formState?.amenityGroups?.[0]?.id ?? null)
                    }

                    return nextValue
                  })
                }}
              >
                {amenitiesEditorExpanded ? 'Hide editor' : 'Edit categories'}
              </button>
              {amenitiesEditorExpanded ? (
                <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddAmenityGroup} type="button">
                  Add Category
                </button>
              ) : null}
            </div>
          ) : null
        }
        controls={
          editable && formState && amenitiesEditorExpanded ? (
            <div className="admin-collection-list" id={amenitiesEditorId}>
              {formState.amenityGroups.map((group, groupIndex) => {
                const itemCount = getAmenityGroupItems(group.itemsText).length
                const isExpanded = expandedAmenityGroupId === group.id
                const categoryLabel = group.title.trim() || `Category ${groupIndex + 1}`
                const itemCountLabel = `${itemCount} item${itemCount === 1 ? '' : 's'}`

                return (
                  <div className="admin-collection-card admin-collection-card--compact" key={group.id}>
                    <div className="admin-collection-card-header">
                      <div className="admin-collection-card-summary">
                        <strong>{categoryLabel}</strong>
                        <span>{itemCountLabel}</span>
                      </div>

                      <div className="admin-inline-actions">
                        <button
                          aria-expanded={isExpanded}
                          className="button-link button-link--ghost admin-action"
                          disabled={disabled}
                          type="button"
                          onClick={() => setExpandedAmenityGroupId(isExpanded ? null : group.id)}
                        >
                          {isExpanded ? 'Done' : 'Edit'}
                        </button>
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={disabled}
                          type="button"
                          onClick={() => onRemoveAmenityGroup(group.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="admin-compact-field-grid">
                        <PreviewInput
                          disabled={disabled}
                          inlineLabel
                          label="Category"
                          onChange={(value) => onAmenityGroupChange(group.id, 'title', value)}
                          value={group.title}
                        />
                        <PreviewTextArea
                          disabled={disabled}
                          inlineLabel
                          label="Items"
                          onChange={(value) => onAmenityGroupChange(group.id, 'itemsText', value)}
                          placeholder="One bullet per line&#10;Air conditioning&#10;Full kitchen&#10;Private pool"
                          rows={5}
                          value={group.itemsText}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null
        }
        html={property?.amenitiesHtml}
        listSections
        renderWhenEmpty={sectionConfigs.amenities.renderWhenEmpty || editable}
        showHeader={sectionConfigs.amenities.showHeader}
        title={sectionConfigs.amenities.title}
      >
        <p className="admin-empty">Add categories to preview this section.</p>
      </PreviewSection>
    ),
    reviews: (
      <PreviewSection
        key="reviews"
        className="admin-property-preview-section--reviews"
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
        reviewEntries
        renderWhenEmpty={sectionConfigs.reviews.renderWhenEmpty}
        showHeader={sectionConfigs.reviews.showHeader}
        title={sectionConfigs.reviews.title}
      />
    ),
  }

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
              <AdminMediaManager
                currentUrl={formState.heroImageUrl}
                disabled={disabled}
                onClear={() => onFieldChange('heroImageUrl', '')}
                onSelect={(nextUrl) => onFieldChange('heroImageUrl', nextUrl)}
                preferredOwnerKey={formState.slug}
                preferredOwnerName={formState.name}
                preferredOwnerType="property"
                title="Property Hero Media"
              />
            </div>
          ) : null}

          <div className="admin-property-preview-title">
            <h3>{property?.name || 'Untitled Property'}</h3>
            {detailLine ? <p>{detailLine}</p> : null}
            <p>{property?.active !== false ? 'Visible on the public property pages' : 'Hidden from the public property pages'}</p>
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
                <div className="admin-inline-actions">
                  <button
                    aria-controls={galleryEditorId}
                    aria-expanded={galleryEditorExpanded}
                    className="button-link button-link--ghost admin-action"
                    type="button"
                    onClick={onToggleGalleryEditor}
                  >
                    {galleryEditorExpanded ? 'Hide editor' : 'Expand editor'}
                  </button>
                  {galleryEditorExpanded ? (
                    <button className="button-link button-link--ghost admin-action" disabled={disabled} onClick={onAddGalleryImage} type="button">
                      Add Image
                    </button>
                  ) : null}
                </div>
              }
              title="Gallery Images"
            >
              <div id={galleryEditorId}>
                {galleryEditorExpanded ? (
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
                        <AdminMediaManager
                          currentUrl={image.url}
                          disabled={disabled}
                          onClear={() => onGalleryImageChange(image.id, 'url', '')}
                          onSelect={(nextUrl) => onGalleryImageChange(image.id, 'url', nextUrl)}
                          preferredOwnerKey={formState.slug}
                          preferredOwnerName={formState.name}
                          preferredOwnerType="property"
                          title={`Gallery Image ${index + 1} Media`}
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
                ) : (
                  <p className="admin-empty">
                    {formState.galleryImages.length > 0
                      ? `${formState.galleryImages.length} gallery image${formState.galleryImages.length === 1 ? '' : 's'} configured.`
                      : 'Expand the editor to add gallery images.'}
                  </p>
                )}
              </div>
            </PreviewSection>
          ) : null}

          {templateVariant.sectionOrder.map((sectionKey) => propertySections[sectionKey]).filter(Boolean)}
        </div>
      </div>
    </aside>
  )
}
