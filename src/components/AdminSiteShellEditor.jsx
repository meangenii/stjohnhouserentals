import { buildRemoteImageUrl } from '../lib/remoteImage'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { buildRouteOptions, detectLinkType } from '../lib/linkRecords'
import { richTextLinesToHtml, richTextValueToLines, richTextValueToPlainText } from '../lib/richTextValue'
import { AdminLinkFields } from './AdminLinkFields'
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

function normalizeNavPath(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const withoutOrigin = candidate.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const withoutQueryOrHash = withoutOrigin.split(/[?#]/, 1)[0] || '/'
  const normalizedPath = withoutQueryOrHash.startsWith('/') ? withoutQueryOrHash : `/${withoutQueryOrHash}`

  return normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '') || '/'
}

function getInternalNavMatchPath(item) {
  const normalizedItem = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
  return detectLinkType(normalizedItem, { defaultType: 'internal', destinationField: 'path' }) === 'internal'
    ? normalizeNavPath(normalizedItem.path)
    : ''
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (!Array.isArray(items) || fromIndex === toIndex) {
    return
  }

  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return
  }

  const [movedItem] = items.splice(fromIndex, 1)

  if (typeof movedItem === 'undefined') {
    return
  }

  items.splice(toIndex, 0, movedItem)
}

function rebuildPrimaryNavMatchPaths(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return
  }

  const currentPath = getInternalNavMatchPath(item)

  if (Array.isArray(item.children) && item.children.length > 0) {
    const childPaths = item.children.map((child) => getInternalNavMatchPath(child)).filter(Boolean)
    item.matchPaths = Array.from(new Set([currentPath, ...childPaths].filter(Boolean)))
    return
  }

  item.matchPaths = currentPath ? [currentPath] : []
}

function makeNavItemId() {
  return `nav-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createPrimaryNavItem() {
  return {
    id: makeNavItemId(),
    label: '',
    path: '',
    matchPaths: [],
    children: [],
  }
}

function createPrimaryNavChildItem() {
  return {
    id: makeNavItemId(),
    label: '',
    path: '',
    matchPaths: [],
  }
}

function updatePrimaryNavCollections(root, updater) {
  const nextRoot = cloneValue(root)

  // Only header.primaryNav is editable here (it's the only one NavEditor renders below).
  // footer.primaryNav is a separate array on the live site (see SiteLayout.jsx) with no
  // editor of its own — it must NOT be mirrored from header edits, or every header nav
  // change silently overwrites whatever the footer nav actually contains.
  if (!nextRoot?.header) {
    return nextRoot
  }

  if (!Array.isArray(nextRoot.header.primaryNav)) {
    nextRoot.header.primaryNav = []
  }

  updater(nextRoot.header.primaryNav)

  return nextRoot
}

function updatePrimaryNav(root, parentIndex, updater) {
  return updatePrimaryNavCollections(root, (primaryNav) => {
    if (primaryNav[parentIndex]) {
      updater(primaryNav[parentIndex])
    }
  })
}

function updatePrimaryNavChild(root, parentIndex, childIndex, updater) {
  return updatePrimaryNavCollections(root, (primaryNav) => {
    if (primaryNav?.[parentIndex]?.children?.[childIndex]) {
      const parentItem = primaryNav[parentIndex]
      updater(parentItem.children[childIndex], parentItem)
    }
  })
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
      </div>

      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={disabled}
        onClear={() => onUrlChange('')}
        onSelect={handleSelectImage}
        preferredOwnerName={title}
        preferredOwnerType="site-shell"
        title={`${title} Media`}
      />

      <div className="admin-content-grid">
        <PlainTextField disabled={disabled} label="Manual Image URL" onChange={onUrlChange} value={image?.url ?? ''} wide />
        <PlainTextField disabled={disabled} label="Alt Text" onChange={onAltChange} value={image?.alt ?? ''} wide />
      </div>

      <AdminImageSizeControls disabled={disabled} image={image} onChange={handleSizeChange} />

      {previewSrc ? (
        <div className="admin-content-image-preview">
          <img alt={image?.alt || ''} loading="lazy" src={buildRemoteImageUrl(previewSrc, previewDimensions) || previewSrc} />
        </div>
      ) : null}
    </section>
  )
}

function collectRouteSuggestions(routeInventory = [], navItems = []) {
  const routePaths = new Set()

  routeInventory.forEach((route) => {
    const path = normalizeNavPath(route?.path)

    if (path) {
      routePaths.add(path)
    }

    if (Array.isArray(route?.routeAliases)) {
      route.routeAliases.forEach((alias) => {
        const aliasPath = normalizeNavPath(alias)

        if (aliasPath) {
          routePaths.add(aliasPath)
        }
      })
    }
  })

  const collectNavPaths = (items = []) => {
    items.forEach((item) => {
      const path = getInternalNavMatchPath(item)

      if (path) {
        routePaths.add(path)
      }

      if (Array.isArray(item?.children)) {
        collectNavPaths(item.children)
      }
    })
  }

  collectNavPaths(navItems)

  return Array.from(routePaths).sort((left, right) => left.localeCompare(right))
}

function NavEditor({
  disabled,
  items,
  onAddChild,
  onAddItem,
  onChildLabelChange,
  onChildLinkChange,
  onLabelChange,
  onLinkChange,
  onMoveChild,
  onMoveItem,
  onRemoveChild,
  onRemoveItem,
  routeOptions,
  routeSuggestions,
  title,
}) {
  return (
    <section className="admin-content-section">
      <div className="admin-content-section-header">
        <div>
          <h4>{title}</h4>
        </div>

        <div className="admin-inline-actions">
          <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={onAddItem}>
            Add menu item
          </button>
        </div>
      </div>

      <div className="admin-content-list">
        {items.map((item, itemIndex) => {
          const itemName = richTextValueToPlainText(item.label ?? '').trim()

          return (
            <article className="admin-content-item-card" key={item.id ?? `nav-item-${itemIndex}`}>
              <div className="admin-content-item-header">
                <div className="admin-collection-card-summary">
                  <strong>{itemName || `Menu item ${itemIndex + 1}`}</strong>
                  <span>Menu item</span>
                </div>

                <div className="admin-content-item-actions">
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => onAddChild(itemIndex)}>
                    Add submenu item
                  </button>
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled || itemIndex === 0}
                    type="button"
                    onClick={() => onMoveItem(itemIndex, -1)}
                  >
                    Move up
                  </button>
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled || itemIndex === items.length - 1}
                    type="button"
                    onClick={() => onMoveItem(itemIndex, 1)}
                  >
                    Move down
                  </button>
                  <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={() => onRemoveItem(itemIndex)}>
                    Remove
                  </button>
                </div>
              </div>

              <div className="admin-content-grid">
                <PlainTextField disabled={disabled} label="Name" onChange={(value) => onLabelChange(itemIndex, value)} value={richTextValueToPlainText(item.label ?? '')} />
                <div className="admin-field admin-field--wide">
                  <AdminLinkFields
                    defaultType="internal"
                    destinationField="path"
                    destinationLabel="Menu Link"
                    disabled={disabled}
                    link={item}
                    routeOptions={routeOptions}
                    routeSuggestions={routeSuggestions}
                    onChange={(value) => onLinkChange(itemIndex, value)}
                  />
                </div>
                {item.children?.length ? (
                  <div className="admin-field admin-field--wide">
                    <div className="admin-content-list">
                      {item.children.map((child, childIndex) => {
                        const childName = richTextValueToPlainText(child.label ?? '').trim()

                        return (
                          <div className="admin-collection-card" key={child.id ?? `nav-child-${itemIndex}-${childIndex}`}>
                            <div className="admin-collection-card-header">
                              <div className="admin-collection-card-summary">
                                <strong>{childName || `Submenu item ${childIndex + 1}`}</strong>
                                <span>Submenu item</span>
                              </div>

                              <div className="admin-content-item-actions">
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  disabled={disabled || childIndex === 0}
                                  type="button"
                                  onClick={() => onMoveChild(itemIndex, childIndex, -1)}
                                >
                                  Move up
                                </button>
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  disabled={disabled || childIndex === item.children.length - 1}
                                  type="button"
                                  onClick={() => onMoveChild(itemIndex, childIndex, 1)}
                                >
                                  Move down
                                </button>
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  disabled={disabled}
                                  type="button"
                                  onClick={() => onRemoveChild(itemIndex, childIndex)}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            <div className="admin-content-grid">
                              <PlainTextField
                                disabled={disabled}
                                label="Name"
                                onChange={(value) => onChildLabelChange(itemIndex, childIndex, value)}
                                value={richTextValueToPlainText(child.label ?? '')}
                              />
                              <div className="admin-field admin-field--wide">
                                <AdminLinkFields
                                  defaultType="internal"
                                  destinationField="path"
                                  destinationLabel="Submenu Link"
                                  disabled={disabled}
                                  link={child}
                                  routeOptions={routeOptions}
                                  routeSuggestions={routeSuggestions}
                                  onChange={(value) => onChildLinkChange(itemIndex, childIndex, value)}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function AdminSiteShellEditor({ disabled = false, onChange, routeInventory = [], routeSuggestions = [], value }) {
  if (!value) {
    return null
  }

  const effectiveRouteSuggestions =
    routeSuggestions.length > 0 ? routeSuggestions : collectRouteSuggestions(routeInventory, value.header?.primaryNav ?? [])
  const effectiveRouteOptions = buildRouteOptions(routeInventory)

  function setPath(path, nextValue) {
    onChange((currentValue) => updateValueAtPath(currentValue, path, nextValue))
  }

  function setPrimaryNavLabel(parentIndex, nextValue) {
    onChange((currentValue) =>
      updatePrimaryNav(currentValue, parentIndex, (item) => {
        item.label = nextValue
      }),
    )
  }

  function setPrimaryNavLink(parentIndex, nextValue) {
    onChange((currentValue) =>
      updatePrimaryNav(currentValue, parentIndex, (item) => {
        Object.assign(item, nextValue)
        rebuildPrimaryNavMatchPaths(item)
      }),
    )
  }

  function setPrimaryNavChildLabel(parentIndex, childIndex, nextValue) {
    onChange((currentValue) =>
      updatePrimaryNavChild(currentValue, parentIndex, childIndex, (childItem) => {
        childItem.label = nextValue
      }),
    )
  }

  function setPrimaryNavChildLink(parentIndex, childIndex, nextValue) {
    onChange((currentValue) =>
      updatePrimaryNavChild(currentValue, parentIndex, childIndex, (childItem, parentItem) => {
        Object.assign(childItem, nextValue)
        const childPath = getInternalNavMatchPath(childItem)
        childItem.matchPaths = childPath ? [childPath] : []
        rebuildPrimaryNavMatchPaths(parentItem)
      }),
    )
  }

  function addPrimaryNavItem() {
    onChange((currentValue) =>
      updatePrimaryNavCollections(currentValue, (primaryNav) => {
        primaryNav.push(createPrimaryNavItem())
      }),
    )
  }

  function removePrimaryNavItem(parentIndex) {
    onChange((currentValue) =>
      updatePrimaryNavCollections(currentValue, (primaryNav) => {
        if (parentIndex >= 0 && parentIndex < primaryNav.length) {
          primaryNav.splice(parentIndex, 1)
        }
      }),
    )
  }

  function movePrimaryNavItem(parentIndex, direction) {
    onChange((currentValue) =>
      updatePrimaryNavCollections(currentValue, (primaryNav) => {
        moveArrayItem(primaryNav, parentIndex, parentIndex + direction)
      }),
    )
  }

  function addPrimaryNavChild(parentIndex) {
    onChange((currentValue) =>
      updatePrimaryNav(currentValue, parentIndex, (item) => {
        if (!Array.isArray(item.children)) {
          item.children = []
        }

        item.children.push(createPrimaryNavChildItem())
        rebuildPrimaryNavMatchPaths(item)
      }),
    )
  }

  function removePrimaryNavChild(parentIndex, childIndex) {
    onChange((currentValue) =>
      updatePrimaryNav(currentValue, parentIndex, (item) => {
        if (!Array.isArray(item.children) || childIndex < 0 || childIndex >= item.children.length) {
          return
        }

        item.children.splice(childIndex, 1)
        rebuildPrimaryNavMatchPaths(item)
      }),
    )
  }

  function movePrimaryNavChild(parentIndex, childIndex, direction) {
    onChange((currentValue) =>
      updatePrimaryNav(currentValue, parentIndex, (item) => {
        if (!Array.isArray(item.children)) {
          return
        }

        moveArrayItem(item.children, childIndex, childIndex + direction)
        rebuildPrimaryNavMatchPaths(item)
      }),
    )
  }

  function updateFooterLegalNav(updater) {
    onChange((currentValue) => {
      const nextRoot = cloneValue(currentValue)

      if (!nextRoot.footer) {
        nextRoot.footer = {}
      }

      if (!Array.isArray(nextRoot.footer.legalNav)) {
        nextRoot.footer.legalNav = []
      }

      updater(nextRoot.footer.legalNav)
      return nextRoot
    })
  }

  function addFooterLegalNavItem() {
    updateFooterLegalNav((legalNav) => {
      legalNav.push({ id: makeNavItemId(), label: '', path: '' })
    })
  }

  function removeFooterLegalNavItem(index) {
    updateFooterLegalNav((legalNav) => {
      if (index >= 0 && index < legalNav.length) {
        legalNav.splice(index, 1)
      }
    })
  }

  function moveFooterLegalNavItem(index, direction) {
    updateFooterLegalNav((legalNav) => {
      moveArrayItem(legalNav, index, index + direction)
    })
  }

  return (
    <div className="admin-content-editor">
      <section className="admin-content-section">
        <div className="admin-content-grid">
          <RichTextField disabled={disabled} label="Top Message" onChange={(value) => setPath(['header', 'utility', 'message'], value)} value={value.header?.utility?.message ?? ''} wide />
          <RichTextField disabled={disabled} label="Social Link Label" onChange={(nextValue) => setPath(['header', 'utility', 'socialLink', 'label'], nextValue)} value={value.header?.utility?.socialLink?.label ?? ''} />
          <div className="admin-field admin-field--wide">
            <AdminLinkFields
              defaultType="external"
              destinationField="href"
              destinationLabel="Social Link"
              disabled={disabled}
              link={value.header?.utility?.socialLink ?? {}}
              routeOptions={effectiveRouteOptions}
              routeSuggestions={effectiveRouteSuggestions}
              onChange={(nextValue) => setPath(['header', 'utility', 'socialLink'], nextValue)}
            />
          </div>
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
        onAddChild={addPrimaryNavChild}
        onAddItem={addPrimaryNavItem}
        onChildLabelChange={setPrimaryNavChildLabel}
        onChildLinkChange={setPrimaryNavChildLink}
        onLabelChange={setPrimaryNavLabel}
        onLinkChange={setPrimaryNavLink}
        onMoveChild={movePrimaryNavChild}
        onMoveItem={movePrimaryNavItem}
        onRemoveChild={removePrimaryNavChild}
        onRemoveItem={removePrimaryNavItem}
        routeOptions={effectiveRouteOptions}
        routeSuggestions={effectiveRouteSuggestions}
        title="Primary Navigation"
      />

      <section className="admin-content-section">
        <div className="admin-content-section-header">
          <div>
            <h4>Footer</h4>
            <p>Fine-tune the footer copy and the legal links shown below the main navigation.</p>
          </div>

          <div className="admin-inline-actions">
            <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={addFooterLegalNavItem}>
              Add legal link
            </button>
          </div>
        </div>

        <div className="admin-content-grid">
          <RichTextField disabled={disabled} label="Copyright Line" onChange={(nextValue) => setPath(['footer', 'copyright'], nextValue)} value={value.footer?.copyright ?? ''} wide />
          <RichTextField disabled={disabled} label="Design Credit" onChange={(nextValue) => setPath(['footer', 'designCredit'], nextValue)} value={value.footer?.designCredit ?? ''} wide />
        </div>

        <div className="admin-content-list">
          {(value.footer?.legalNav ?? []).map((item, index, legalNav) => (
            <article className="admin-content-item-card" key={item.id ?? `legal-nav-${index}`}>
              <div className="admin-content-item-header">
                <h5>{item.path || item.href || `Legal Link ${index + 1}`}</h5>

                <div className="admin-content-item-actions">
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled || index === 0}
                    type="button"
                    onClick={() => moveFooterLegalNavItem(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled || index === legalNav.length - 1}
                    type="button"
                    onClick={() => moveFooterLegalNavItem(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={disabled}
                    type="button"
                    onClick={() => removeFooterLegalNavItem(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="admin-content-grid">
                <RichTextField disabled={disabled} label="Legal Link Label" onChange={(nextValue) => setPath(['footer', 'legalNav', index, 'label'], nextValue)} value={item.label ?? ''} wide />
                <div className="admin-field admin-field--wide">
                  <AdminLinkFields
                    defaultType="internal"
                    destinationField="path"
                    destinationLabel="Legal Link"
                    disabled={disabled}
                    link={item}
                    routeOptions={effectiveRouteOptions}
                    routeSuggestions={effectiveRouteSuggestions}
                    onChange={(nextValue) => setPath(['footer', 'legalNav', index], nextValue)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
