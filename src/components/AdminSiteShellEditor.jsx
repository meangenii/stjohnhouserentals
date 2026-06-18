import { buildRemoteImageUrl } from '../lib/remoteImage'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { richTextLinesToHtml, richTextValueToLines } from '../lib/richTextValue'
import { AdminRichTextEditor } from './AdminRichTextEditor'
import { AdminMediaManager } from './AdminMediaManager'
import { AdminImageSizeControls } from './AdminImageSizeControls'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function updateValueAtPath(root, path, nextValue) {
  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length - 1; index += 1) {
    target = target[path[index]]
  }

  target[path[path.length - 1]] = nextValue
  return nextRoot
}

function updatePrimaryNav(root, parentIndex, field, nextValue) {
  const nextRoot = cloneValue(root)

  ;['header', 'footer'].forEach((sectionKey) => {
    if (nextRoot?.[sectionKey]?.primaryNav?.[parentIndex]) {
      nextRoot[sectionKey].primaryNav[parentIndex][field] = nextValue
    }
  })

  return nextRoot
}

function updatePrimaryNavChild(root, parentIndex, childIndex, field, nextValue) {
  const nextRoot = cloneValue(root)

  ;['header', 'footer'].forEach((sectionKey) => {
    if (nextRoot?.[sectionKey]?.primaryNav?.[parentIndex]?.children?.[childIndex]) {
      nextRoot[sectionKey].primaryNav[parentIndex].children[childIndex][field] = nextValue
    }
  })

  return nextRoot
}

function PlainTextField({ disabled, label, onChange, type = 'text', value, wide = false }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <input disabled={disabled} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function RichTextField({ disabled, label, onChange, value, wide = true }) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor compact disabled={disabled} label={label} onChange={onChange} value={value ?? ''} />
    </div>
  )
}

function RichLineListField({ disabled, label, onChange, value, wide = true }) {
  return (
    <div className={`admin-field admin-field--rich${wide ? ' admin-field--wide' : ''}`.trim()}>
      <AdminRichTextEditor
        compact
        disabled={disabled}
        helperText="Press Enter to start a new line."
        label={label}
        onChange={(nextValue) => onChange(richTextValueToLines(nextValue))}
        value={richTextLinesToHtml(value)}
      />
    </div>
  )
}

function ImageField({ disabled, image, onAltChange, onOriginalSizeChange, onSizeChange, onUrlChange, title }) {
  const previewSrc = String(image?.url ?? '').trim()
  const previewDimensions = getImageDimensions(image, { width: 800, height: 260 })

  function handleSelectImage(nextUrl, entry) {
    const originalWidth = normalizeImageDimension(entry?.width)
    const originalHeight = normalizeImageDimension(entry?.height)

    onUrlChange(nextUrl)
    onOriginalSizeChange(originalWidth || null, originalHeight || null)

    if (!image?.alt && entry?.alt) {
      onAltChange(entry.alt)
    }
  }

  function handleSizeChange(nextSize) {
    onSizeChange(nextSize)
  }

  return (
    <section className="admin-content-media-field">
      <div className="admin-content-media-header">
        <h5>{title}</h5>
        <span>Used in the site header and footer</span>
      </div>

      <div className="admin-content-grid">
        <PlainTextField disabled={disabled} label="Image URL" onChange={onUrlChange} value={image?.url ?? ''} wide />
        <PlainTextField disabled={disabled} label="Alt Text" onChange={onAltChange} value={image?.alt ?? ''} wide />
      </div>

      <AdminImageSizeControls disabled={disabled} image={image} onChange={handleSizeChange} />

      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={disabled}
        onClear={() => onUrlChange('')}
        onSelect={handleSelectImage}
        preferredOwnerName={title}
        preferredOwnerType="site-shell"
        title={`${title} Media`}
      />

      {previewSrc ? (
        <div className="admin-content-image-preview">
          <img alt={image?.alt || ''} loading="lazy" src={buildRemoteImageUrl(previewSrc, previewDimensions) || previewSrc} />
        </div>
      ) : null}
    </section>
  )
}

function NavEditor({ disabled, items, onChildLabelChange, onLabelChange, title }) {
  return (
    <section className="admin-content-section">
      <div className="admin-content-section-header">
        <div>
          <h4>{title}</h4>
          <p>Navigation routes stay fixed for this site. You can rename the labels visitors see.</p>
        </div>
      </div>

      <div className="admin-content-list">
        {items.map((item, itemIndex) => (
          <article className="admin-content-item-card" key={`${item.path}-${itemIndex}`}>
            <div className="admin-content-item-header">
              <h5>{item.path}</h5>
            </div>

            <div className="admin-content-grid">
              <RichTextField disabled={disabled} label="Menu Label" onChange={(value) => onLabelChange(itemIndex, value)} value={item.label ?? ''} />
              {item.children?.length ? (
                <div className="admin-field admin-field--wide">
                  <span>Submenu Items</span>
                  <div className="admin-content-list">
                    {item.children.map((child, childIndex) => (
                      <div className="admin-collection-card" key={`${child.path}-${childIndex}`}>
                        <div className="admin-route-preview-top">
                          <strong>{child.path}</strong>
                        </div>
                        <RichTextField
                          disabled={disabled}
                          label="Submenu Label"
                          onChange={(value) => onChildLabelChange(itemIndex, childIndex, value)}
                          value={child.label ?? ''}
                          wide
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function AdminSiteShellEditor({ disabled = false, onChange, value }) {
  if (!value) {
    return null
  }

  function setPath(path, nextValue) {
    onChange((currentValue) => updateValueAtPath(currentValue, path, nextValue))
  }

  function setPrimaryNavLabel(parentIndex, nextValue) {
    onChange((currentValue) => updatePrimaryNav(currentValue, parentIndex, 'label', nextValue))
  }

  function setPrimaryNavChildLabel(parentIndex, childIndex, nextValue) {
    onChange((currentValue) => updatePrimaryNavChild(currentValue, parentIndex, childIndex, 'label', nextValue))
  }

  return (
    <div className="admin-content-editor">
      <section className="admin-content-section">
        <div className="admin-content-section-header">
          <div>
            <h4>Top Bar</h4>
            <p>Edit the announcement strip above the main navigation.</p>
          </div>
        </div>

        <div className="admin-content-grid">
          <RichTextField disabled={disabled} label="Top Message" onChange={(value) => setPath(['header', 'utility', 'message'], value)} value={value.header?.utility?.message ?? ''} wide />
          <RichTextField disabled={disabled} label="Facebook Label" onChange={(nextValue) => setPath(['header', 'utility', 'socialLink', 'label'], nextValue)} value={value.header?.utility?.socialLink?.label ?? ''} />
          <PlainTextField disabled={disabled} label="Facebook URL" onChange={(nextValue) => setPath(['header', 'utility', 'socialLink', 'href'], nextValue)} type="url" value={value.header?.utility?.socialLink?.href ?? ''} />
          <RichLineListField
            disabled={disabled}
            label="Booking Callouts"
            onChange={(nextValue) => setPath(['header', 'utility', 'bookingCallouts'], nextValue)}
            value={value.header?.utility?.bookingCallouts ?? []}
            wide
          />
        </div>
      </section>

      <section className="admin-content-section">
        <div className="admin-content-section-header">
          <div>
            <h4>Branding</h4>
            <p>Control the logo image and the main contact email used across the site.</p>
          </div>
        </div>

        <div className="admin-content-grid">
          <div className="admin-field admin-field--wide">
            <ImageField
              disabled={disabled}
              image={value.header?.logo}
              onAltChange={(nextValue) => setPath(['header', 'logo', 'alt'], nextValue)}
              onSizeChange={(nextSize) => {
                setPath(['header', 'logo', 'width'], nextSize.width)
                setPath(['header', 'logo', 'height'], nextSize.height)

                if (Object.prototype.hasOwnProperty.call(nextSize, 'originalWidth')) {
                  setPath(['header', 'logo', 'originalWidth'], nextSize.originalWidth)
                }

                if (Object.prototype.hasOwnProperty.call(nextSize, 'originalHeight')) {
                  setPath(['header', 'logo', 'originalHeight'], nextSize.originalHeight)
                }
              }}
              onOriginalSizeChange={(nextWidth, nextHeight) => {
                setPath(['header', 'logo', 'originalWidth'], nextWidth)
                setPath(['header', 'logo', 'originalHeight'], nextHeight)
              }}
              onUrlChange={(nextValue) => setPath(['header', 'logo', 'url'], nextValue)}
              title="Site Logo"
            />
          </div>
          <PlainTextField disabled={disabled} label="Contact Email" onChange={(nextValue) => setPath(['contact', 'primaryEmail'], nextValue)} type="email" value={value.contact?.primaryEmail ?? ''} wide />
        </div>
      </section>

      <NavEditor
        disabled={disabled}
        items={value.header?.primaryNav ?? []}
        onChildLabelChange={setPrimaryNavChildLabel}
        onLabelChange={setPrimaryNavLabel}
        title="Primary Navigation"
      />

      <section className="admin-content-section">
        <div className="admin-content-section-header">
          <div>
            <h4>Footer</h4>
            <p>Fine-tune the footer copy and the legal links shown below the main navigation.</p>
          </div>
        </div>

        <div className="admin-content-grid">
          <RichTextField disabled={disabled} label="Copyright Line" onChange={(nextValue) => setPath(['footer', 'copyright'], nextValue)} value={value.footer?.copyright ?? ''} wide />
          <RichTextField disabled={disabled} label="Design Credit" onChange={(nextValue) => setPath(['footer', 'designCredit'], nextValue)} value={value.footer?.designCredit ?? ''} wide />
        </div>

        <div className="admin-content-list">
          {(value.footer?.legalNav ?? []).map((item, index) => (
            <article className="admin-content-item-card" key={`${item.path}-${index}`}>
              <div className="admin-content-item-header">
                <h5>{item.path}</h5>
              </div>
              <div className="admin-content-grid">
                <RichTextField disabled={disabled} label="Legal Link Label" onChange={(nextValue) => setPath(['footer', 'legalNav', index, 'label'], nextValue)} value={item.label ?? ''} wide />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
