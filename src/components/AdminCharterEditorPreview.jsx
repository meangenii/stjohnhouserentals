import { buildRemoteImageUrl } from '../lib/remoteImage'
import { normalizeSiteHtml } from '../lib/normalizeSiteHtml'
import { AdminMediaManager } from './AdminMediaManager'

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

function PreviewSection({ title, html, children, controls }) {
  const normalizedHtml = normalizeSiteHtml(html)
  const hasHtml = Boolean(normalizedHtml.trim())
  const hasChildren = Boolean(children)
  const hasControls = Boolean(controls)

  if (!hasHtml && !hasChildren && !hasControls) {
    return null
  }

  return (
    <section className="admin-property-preview-section">
      <div className="admin-property-preview-section-header">
        <h4>{title}</h4>
        <div aria-hidden="true" className="admin-property-preview-rule" />
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

export function AdminCharterEditorPreview({ charter, disabled = false, formState, onFieldChange }) {
  const heroImage = charter?.heroImage ?? null
  const heroImageUrl = heroImage?.url ? buildRemoteImageUrl(heroImage, { width: 1400, height: 760, mode: 'fit' }) : ''

  return (
    <aside className="admin-property-preview admin-charter-preview">
      <div className="admin-property-preview-frame">
        {heroImageUrl ? (
          <div className="admin-charter-preview-hero">
            <img alt={heroImage?.alt || charter?.name || 'Charter boat image'} decoding="async" loading="lazy" src={heroImageUrl} />
          </div>
        ) : (
          <div className="admin-property-preview-banner admin-property-preview-banner--empty">
            Add a hero image to preview this charter boat page.
          </div>
        )}

        <div className="admin-property-preview-body">
          <div className="admin-property-preview-title">
            <h3>{charter?.name || 'Untitled Charter'}</h3>
            <p>{charter?.active ? 'Visible on the public charter page' : 'Hidden from the public charter page'}</p>
          </div>

          <PreviewSection
            controls={
              <div className="admin-preview-field-grid admin-preview-field-grid--tight">
                <PreviewInput disabled={disabled} label="Charter Name" onChange={(value) => onFieldChange('name', value)} value={formState.name} />
                <PreviewInput disabled={disabled} label="URL Path" onChange={(value) => onFieldChange('slug', value)} value={formState.slug} />
                <label className="admin-field admin-field--wide">
                  <span>Visibility</span>
                  <div className="admin-preview-checkbox">
                    <input checked={formState.active} disabled={disabled} onChange={(event) => onFieldChange('active', event.target.checked)} type="checkbox" />
                    <strong>Visible on the live charter directory</strong>
                  </div>
                </label>
                <PreviewTextArea disabled={disabled} label="Short Description" onChange={(value) => onFieldChange('shortDescription', value)} rows={4} value={formState.shortDescription} wide />
              </div>
            }
            title="Listing Details"
          >
            {charter?.shortDescription ? <p>{charter.shortDescription}</p> : <p className="admin-empty">Add a short description for this charter listing.</p>}
          </PreviewSection>

          <PreviewSection
            controls={
              <div className="admin-preview-field-grid">
                <PreviewInput disabled={disabled} label="Phone Number" onChange={(value) => onFieldChange('phoneNumber', value)} value={formState.phoneNumber} />
                <PreviewInput disabled={disabled} label="Email" onChange={(value) => onFieldChange('email', value)} type="email" value={formState.email} />
                <PreviewInput disabled={disabled} label="Website" onChange={(value) => onFieldChange('website', value)} type="url" value={formState.website} wide />
              </div>
            }
            title="Contact Links"
          >
            <div className="admin-charter-preview-links">
              {charter?.email ? <span className="admin-charter-preview-link">Email charter</span> : null}
              {charter?.phoneNumber ? <span className="admin-charter-preview-link">Call charter</span> : null}
              {charter?.website ? <span className="admin-charter-preview-link">Visit website</span> : null}
              {!charter?.email && !charter?.phoneNumber && !charter?.website ? <p className="admin-empty">Add at least one contact method to preview the action links.</p> : null}
            </div>
          </PreviewSection>

          <PreviewSection
            controls={
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
                  preferredOwnerType="charter"
                  title="Charter Hero Media"
                />
              </div>
            }
            title="Hero Image"
          >
            {heroImage?.alt ? <p>{heroImage.alt}</p> : <p className="admin-empty">Add accessibility text for the hero image.</p>}
          </PreviewSection>

          <PreviewSection
            controls={
              <PreviewTextArea
                disabled={disabled}
                label="Description"
                onChange={(value) => onFieldChange('descriptionText', value)}
                placeholder="Separate paragraphs with a blank line."
                rows={10}
                value={formState.descriptionText}
                wide
              />
            }
            html={charter?.contentHtml}
            title="Detail Page Copy"
          />
        </div>
      </div>
    </aside>
  )
}
