import { buildRemoteImageUrl } from '../lib/remoteImage'

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

function parseLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function linesToText(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? '')).join('\n') : ''
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

function TextField({ disabled, label, onChange, type = 'text', value, wide = false }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <input disabled={disabled} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function TextAreaField({ disabled, label, onChange, rows = 4, value, wide = true }) {
  return (
    <label className={`admin-field${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      <textarea disabled={disabled} rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ImageField({ disabled, image, onAltChange, onUrlChange, title }) {
  const previewSrc = String(image?.url ?? '').trim()

  return (
    <section className="admin-content-media-field">
      <div className="admin-content-media-header">
        <h5>{title}</h5>
        <span>Used in the site header and footer</span>
      </div>

      <div className="admin-content-grid">
        <TextField disabled={disabled} label="Image URL" onChange={onUrlChange} value={image?.url ?? ''} wide />
        <TextField disabled={disabled} label="Alt Text" onChange={onAltChange} value={image?.alt ?? ''} wide />
      </div>

      {previewSrc ? (
        <div className="admin-content-image-preview">
          <img alt={image?.alt || ''} loading="lazy" src={buildRemoteImageUrl(previewSrc, { width: 800, height: 260 }) || previewSrc} />
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
              <TextField disabled={disabled} label="Menu Label" onChange={(value) => onLabelChange(itemIndex, value)} value={item.label ?? ''} />
              {item.children?.length ? (
                <div className="admin-field admin-field--wide">
                  <span>Submenu Items</span>
                  <div className="admin-content-list">
                    {item.children.map((child, childIndex) => (
                      <div className="admin-collection-card" key={`${child.path}-${childIndex}`}>
                        <div className="admin-route-preview-top">
                          <strong>{child.path}</strong>
                        </div>
                        <TextField
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
          <TextField disabled={disabled} label="Top Message" onChange={(value) => setPath(['header', 'utility', 'message'], value)} value={value.header?.utility?.message ?? ''} wide />
          <TextField disabled={disabled} label="Facebook Label" onChange={(nextValue) => setPath(['header', 'utility', 'socialLink', 'label'], nextValue)} value={value.header?.utility?.socialLink?.label ?? ''} />
          <TextField disabled={disabled} label="Facebook URL" onChange={(nextValue) => setPath(['header', 'utility', 'socialLink', 'href'], nextValue)} type="url" value={value.header?.utility?.socialLink?.href ?? ''} />
          <TextAreaField
            disabled={disabled}
            label="Booking Callouts"
            onChange={(nextValue) => setPath(['header', 'utility', 'bookingCallouts'], parseLines(nextValue))}
            rows={4}
            value={linesToText(value.header?.utility?.bookingCallouts ?? [])}
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
              onUrlChange={(nextValue) => setPath(['header', 'logo', 'url'], nextValue)}
              title="Site Logo"
            />
          </div>
          <TextField disabled={disabled} label="Contact Email" onChange={(nextValue) => setPath(['contact', 'primaryEmail'], nextValue)} type="email" value={value.contact?.primaryEmail ?? ''} wide />
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
          <TextField disabled={disabled} label="Copyright Line" onChange={(nextValue) => setPath(['footer', 'copyright'], nextValue)} value={value.footer?.copyright ?? ''} wide />
          <TextField disabled={disabled} label="Design Credit" onChange={(nextValue) => setPath(['footer', 'designCredit'], nextValue)} value={value.footer?.designCredit ?? ''} wide />
        </div>

        <div className="admin-content-list">
          {(value.footer?.legalNav ?? []).map((item, index) => (
            <article className="admin-content-item-card" key={`${item.path}-${index}`}>
              <div className="admin-content-item-header">
                <h5>{item.path}</h5>
              </div>
              <div className="admin-content-grid">
                <TextField disabled={disabled} label="Legal Link Label" onChange={(nextValue) => setPath(['footer', 'legalNav', index, 'label'], nextValue)} value={item.label ?? ''} wide />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
