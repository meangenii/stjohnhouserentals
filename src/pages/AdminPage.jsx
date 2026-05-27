import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { pageSnapshots, snapshotDate } from '../content/siteSnapshot'
import { isMockPropertyData, listProperties, resetAdminProperties, saveAdminProperty } from '../lib/propertyRepository'

const pageInventory = [
  ...Object.values(pageSnapshots).map((page) => ({
    key: page.key,
    label: page.navLabel,
    path: page.path,
    title: page.h1 || page.title,
    group: page.group,
    source: page.path === '/' || page.path === '/about-us' ? 'custom' : 'snapshot',
  })),
  {
    key: 'propertyDetailTemplate',
    label: 'Property Detail Template',
    path: '/rental-properties/:slug',
    title: 'Local rental property detail route',
    group: 'rentals',
    source: 'custom',
  },
  {
    key: 'adminWorkspace',
    label: 'Admin Workspace',
    path: '/admin',
    title: 'Hidden internal admin route',
    group: 'internal',
    source: 'custom',
  },
]

function makeToken() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function repairSnapshotText(text = '') {
  return text
    .replaceAll('\u00e2\u20ac\u2122', '\u2019')
    .replaceAll('\u00e2\u20ac\u0153', '\u201c')
    .replaceAll('\u00e2\u20ac\u009d', '\u201d')
    .replaceAll('\u00e2\u20ac\u201c', '\u2013')
    .replaceAll('\u00e2\u20ac\u201d', '\u2014')
    .replaceAll('\u00c2\u00a0', ' ')
    .replaceAll('\u00c2', '')
}

function linesToText(values = []) {
  return values.map((value) => repairSnapshotText(String(value))).join('\n')
}

function paragraphsToText(values = []) {
  return values.map((value) => repairSnapshotText(String(value))).join('\n\n')
}

function parseLineList(value = '') {
  return value
    .split(/\r?\n+/)
    .map((entry) => repairSnapshotText(entry).trim())
    .filter(Boolean)
}

function parseParagraphList(value = '') {
  return value
    .split(/\r?\n\s*\r?\n+/)
    .map((entry) => repairSnapshotText(entry).trim())
    .filter(Boolean)
}

function createAmenityEditor(group = {}) {
  return {
    id: makeToken(),
    title: repairSnapshotText(group.title ?? ''),
    itemsText: linesToText(group.items ?? []),
  }
}

function createReviewEditor(entry = {}) {
  return {
    id: makeToken(),
    quote: repairSnapshotText(entry.quote ?? ''),
    author: repairSnapshotText(entry.author ?? ''),
  }
}

function createEmptyFormState() {
  return {
    originalSlug: '',
    name: '',
    slug: '',
    bedrooms: '1',
    bathrooms: '1',
    maxGuests: '2',
    location: 'St. John, USVI',
    price: '',
    shortDescription: '',
    highlightsText: '',
    descriptionText: '',
    heroImageUrl: '',
    heroImageAlt: '',
    bookingContactName: '',
    bookingEmail: '',
    bookingNote: '',
    amenityGroups: [createAmenityEditor({ title: 'Amenities' })],
    reviewEntries: [createReviewEditor()],
  }
}

function createFormState(property) {
  return {
    originalSlug: property.slug,
    name: repairSnapshotText(property.name ?? ''),
    slug: property.slug ?? '',
    bedrooms: String(property.bedrooms ?? 0),
    bathrooms: String(property.bathrooms ?? 0),
    maxGuests: String(property.maxGuests ?? 0),
    location: repairSnapshotText(property.location ?? 'St. John, USVI'),
    price: repairSnapshotText(property.price ?? ''),
    shortDescription: repairSnapshotText(property.shortDescription ?? ''),
    highlightsText: linesToText(property.highlights ?? property.facts ?? []),
    descriptionText: paragraphsToText(property.description ?? []),
    heroImageUrl: property.heroImage?.url ?? '',
    heroImageAlt: repairSnapshotText(property.heroImage?.alt ?? ''),
    bookingContactName: repairSnapshotText(property.booking?.contactName ?? ''),
    bookingEmail: repairSnapshotText(property.booking?.email ?? ''),
    bookingNote: repairSnapshotText(property.booking?.note ?? ''),
    amenityGroups:
      property.amenityGroups?.length > 0
        ? property.amenityGroups.map((group) => createAmenityEditor(group))
        : [createAmenityEditor({ title: 'Amenities' })],
    reviewEntries:
      property.reviewEntries?.length > 0
        ? property.reviewEntries.map((entry) => createReviewEditor(entry))
        : [createReviewEditor()],
  }
}

function buildPropertyDraft(formState) {
  const amenityGroups = formState.amenityGroups
    .map((group) => ({
      title: group.title.trim(),
      items: parseLineList(group.itemsText),
    }))
    .filter((group) => group.title || group.items.length)

  const reviewEntries = formState.reviewEntries
    .map((entry) => ({
      quote: repairSnapshotText(entry.quote).trim(),
      author: repairSnapshotText(entry.author).trim(),
    }))
    .filter((entry) => entry.quote)

  return {
    name: repairSnapshotText(formState.name).trim(),
    slug: repairSnapshotText(formState.slug).trim(),
    bedrooms: Number(formState.bedrooms) || 0,
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    highlights: parseLineList(formState.highlightsText),
    description: parseParagraphList(formState.descriptionText),
    amenityGroups,
    reviewEntries,
    booking: {
      contactName: repairSnapshotText(formState.bookingContactName).trim(),
      email: repairSnapshotText(formState.bookingEmail).trim(),
      note: repairSnapshotText(formState.bookingNote).trim(),
    },
    heroImage: formState.heroImageUrl.trim()
      ? {
          url: formState.heroImageUrl.trim(),
          alt: repairSnapshotText(formState.heroImageAlt).trim(),
          title: repairSnapshotText(formState.name).trim(),
        }
      : null,
    gallery: formState.heroImageUrl.trim()
      ? [
          {
            url: formState.heroImageUrl.trim(),
            alt: repairSnapshotText(formState.heroImageAlt).trim(),
            title: repairSnapshotText(formState.name).trim(),
          },
        ]
      : [],
  }
}

function PropertyListItem({ active, property, onSelect }) {
  return (
    <button
      className={`admin-property-button ${active ? 'admin-property-button--active' : ''}`.trim()}
      type="button"
      onClick={() => onSelect(property)}
    >
      <strong>{repairSnapshotText(property.name)}</strong>
      <span>
        {property.bedroomLabel} | {property.maxGuests} guests
      </span>
      <span>{repairSnapshotText(property.location)}</span>
    </button>
  )
}

export function AdminPage() {
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', properties: [] })
  const [formState, setFormState] = useState(createEmptyFormState())
  const [editorState, setEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const propertyEditingEnabled = isMockPropertyData()

  useEffect(() => {
    let cancelled = false

    async function loadWorkspace() {
      try {
        const properties = await listProperties()

        if (cancelled) {
          return
        }

        setWorkspaceState({ status: 'ready', properties })

        if (properties.length > 0) {
          setEditorState({ mode: 'edit', activeSlug: properties[0].slug })
          setFormState(createFormState(properties[0]))
          return
        }

        setEditorState({ mode: 'create', activeSlug: '' })
        setFormState(createEmptyFormState())
      } catch (error) {
        if (!cancelled) {
          setWorkspaceState({
            status: 'error',
            properties: [],
            message: error instanceof Error ? error.message : 'Unknown admin workspace error',
          })
        }
      }
    }

    loadWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  function openCreateForm() {
    setEditorState({ mode: 'create', activeSlug: '' })
    setFormState(createEmptyFormState())
    setFeedback('')
  }

  function openEditForm(property) {
    setEditorState({ mode: 'edit', activeSlug: property.slug })
    setFormState(createFormState(property))
    setFeedback('')
  }

  function updateFormState(field, value) {
    setFormState((currentState) => ({
      ...currentState,
      [field]: value,
    }))
  }

  function updateAmenityGroup(groupId, field, value) {
    setFormState((currentState) => ({
      ...currentState,
      amenityGroups: currentState.amenityGroups.map((group) =>
        group.id === groupId ? { ...group, [field]: value } : group,
      ),
    }))
  }

  function addAmenityGroup() {
    setFormState((currentState) => ({
      ...currentState,
      amenityGroups: [...currentState.amenityGroups, createAmenityEditor()],
    }))
  }

  function removeAmenityGroup(groupId) {
    setFormState((currentState) => {
      const nextGroups = currentState.amenityGroups.filter((group) => group.id !== groupId)

      return {
        ...currentState,
        amenityGroups: nextGroups.length > 0 ? nextGroups : [createAmenityEditor({ title: 'Amenities' })],
      }
    })
  }

  function updateReviewEntry(entryId, field, value) {
    setFormState((currentState) => ({
      ...currentState,
      reviewEntries: currentState.reviewEntries.map((entry) =>
        entry.id === entryId ? { ...entry, [field]: value } : entry,
      ),
    }))
  }

  function addReviewEntry() {
    setFormState((currentState) => ({
      ...currentState,
      reviewEntries: [...currentState.reviewEntries, createReviewEditor()],
    }))
  }

  function removeReviewEntry(entryId) {
    setFormState((currentState) => {
      const nextEntries = currentState.reviewEntries.filter((entry) => entry.id !== entryId)

      return {
        ...currentState,
        reviewEntries: nextEntries.length > 0 ? nextEntries : [createReviewEditor()],
      }
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      setSaveStatus('saving')
      const savedProperty = await saveAdminProperty(
        buildPropertyDraft(formState),
        editorState.mode === 'edit' ? formState.originalSlug : '',
      )
      const properties = await listProperties()
      setWorkspaceState({ status: 'ready', properties })
      setEditorState({ mode: 'edit', activeSlug: savedProperty.slug })
      setFormState(createFormState(savedProperty))
      setFeedback(
        editorState.mode === 'create'
          ? `Added ${savedProperty.name} to the local admin catalog.`
          : `Saved changes to ${savedProperty.name}.`,
      )
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to save property changes.')
    }
  }

  async function handleResetLocalEdits() {
    if (!window.confirm('Reset all browser-local property edits and return to the generated catalog?')) {
      return
    }

    resetAdminProperties()
    setSaveStatus('idle')
    setFeedback('Restored the generated property catalog for this browser.')

    try {
      const properties = await listProperties()
      setWorkspaceState({ status: 'ready', properties })

      if (properties.length > 0) {
        setEditorState({ mode: 'edit', activeSlug: properties[0].slug })
        setFormState(createFormState(properties[0]))
        return
      }

      openCreateForm()
    } catch (error) {
      setWorkspaceState({
        status: 'error',
        properties: [],
        message: error instanceof Error ? error.message : 'Unable to reload the property catalog.',
      })
    }
  }

  const isLoading = workspaceState.status === 'loading'
  const properties = workspaceState.properties ?? []

  return (
    <article className="admin-page">
      <section className="page-section admin-header">
        <div className="eyebrow">Admin</div>
        <h1>Content workspace</h1>
        <p>
          This route is intentionally hidden from the public navigation. Use it to review site routes
          and manage the current local property catalog while the CMS is still code-driven.
        </p>
        <div className="admin-chip-row">
          <span className="admin-chip">Route: /admin</span>
          <span className="admin-chip">Snapshot date: {snapshotDate}</span>
          <span className="admin-chip">
            Property editing: {propertyEditingEnabled ? 'mock catalog enabled' : 'read only'}
          </span>
        </div>
      </section>

      <section className="page-section admin-shell">
        <div className="admin-layout">
          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <div className="eyebrow">Properties</div>
                <h2>Add and edit rental properties</h2>
              </div>
              <div className="admin-inline-actions">
                <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateForm}>
                  New property
                </button>
                {propertyEditingEnabled ? (
                  <button
                    className="button-link button-link--ghost admin-action"
                    type="button"
                    onClick={handleResetLocalEdits}
                  >
                    Reset local edits
                  </button>
                ) : null}
              </div>
            </div>

            {!propertyEditingEnabled ? (
              <p className="admin-note">
                Property editing is only enabled when `VITE_PROPERTY_DATA_SOURCE=mock`. The current route
                still shows the catalog, but saves are disabled in API or Firebase-backed modes.
              </p>
            ) : null}

            {workspaceState.status === 'error' ? (
              <p className="admin-empty">{workspaceState.message}</p>
            ) : null}

            <div className="admin-property-grid">
              <div className="admin-property-list">
                {isLoading ? <p className="admin-empty">Loading property catalog...</p> : null}

                {!isLoading && properties.length === 0 ? (
                  <p className="admin-empty">No properties are available yet. Start with a new draft.</p>
                ) : null}

                {properties.map((property) => (
                  <PropertyListItem
                    active={editorState.mode === 'edit' && editorState.activeSlug === property.slug}
                    key={property.slug}
                    property={property}
                    onSelect={openEditForm}
                  />
                ))}
              </div>

              <div className="admin-editor">
                <div className="admin-editor-header">
                  <div>
                    <div className="eyebrow">{editorState.mode === 'create' ? 'New property' : 'Editing property'}</div>
                    <h3>{editorState.mode === 'create' ? 'Create a property draft' : repairSnapshotText(formState.name)}</h3>
                  </div>
                  {editorState.mode === 'edit' && editorState.activeSlug ? (
                    <Link className="button-link button-link--ghost admin-action" to={`/rental-properties/${editorState.activeSlug}`}>
                      Open public route
                    </Link>
                  ) : null}
                </div>

                {feedback ? <p className={`admin-feedback admin-feedback--${saveStatus}`}>{feedback}</p> : null}

                <form className="admin-form" onSubmit={handleSubmit}>
                  <div className="admin-form-grid">
                    <label className="admin-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={formState.name}
                        onChange={(event) => updateFormState('name', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Slug</span>
                      <input
                        type="text"
                        value={formState.slug}
                        onChange={(event) => updateFormState('slug', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Bedrooms</span>
                      <input
                        type="number"
                        min="0"
                        value={formState.bedrooms}
                        onChange={(event) => updateFormState('bedrooms', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Bathrooms</span>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={formState.bathrooms}
                        onChange={(event) => updateFormState('bathrooms', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Max guests</span>
                      <input
                        type="number"
                        min="0"
                        value={formState.maxGuests}
                        onChange={(event) => updateFormState('maxGuests', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Price</span>
                      <input
                        type="text"
                        value={formState.price}
                        onChange={(event) => updateFormState('price', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Location</span>
                      <input
                        type="text"
                        value={formState.location}
                        onChange={(event) => updateFormState('location', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Short description</span>
                      <textarea
                        rows="3"
                        value={formState.shortDescription}
                        onChange={(event) => updateFormState('shortDescription', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Highlights</span>
                      <textarea
                        rows="5"
                        value={formState.highlightsText}
                        onChange={(event) => updateFormState('highlightsText', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Description paragraphs</span>
                      <textarea
                        rows="8"
                        value={formState.descriptionText}
                        onChange={(event) => updateFormState('descriptionText', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image URL</span>
                      <input
                        type="url"
                        value={formState.heroImageUrl}
                        onChange={(event) => updateFormState('heroImageUrl', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image alt text</span>
                      <input
                        type="text"
                        value={formState.heroImageAlt}
                        onChange={(event) => updateFormState('heroImageAlt', event.target.value)}
                        disabled={!propertyEditingEnabled}
                      />
                    </label>
                  </div>

                  <section className="admin-subsection">
                    <div className="admin-subsection-header">
                      <h4>Amenity groups</h4>
                      <button className="button-link button-link--ghost admin-action" type="button" onClick={addAmenityGroup}>
                        Add group
                      </button>
                    </div>

                    <div className="admin-collection-list">
                      {formState.amenityGroups.map((group) => (
                        <div className="admin-collection-card" key={group.id}>
                          <label className="admin-field">
                            <span>Group title</span>
                            <input
                              type="text"
                              value={group.title}
                              onChange={(event) => updateAmenityGroup(group.id, 'title', event.target.value)}
                              disabled={!propertyEditingEnabled}
                            />
                          </label>
                          <label className="admin-field">
                            <span>Items</span>
                            <textarea
                              rows="5"
                              value={group.itemsText}
                              onChange={(event) => updateAmenityGroup(group.id, 'itemsText', event.target.value)}
                              disabled={!propertyEditingEnabled}
                            />
                          </label>
                          <button
                            className="button-link button-link--ghost admin-action"
                            type="button"
                            onClick={() => removeAmenityGroup(group.id)}
                          >
                            Remove group
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="admin-subsection">
                    <div className="admin-subsection-header">
                      <h4>Reviews</h4>
                      <button className="button-link button-link--ghost admin-action" type="button" onClick={addReviewEntry}>
                        Add review
                      </button>
                    </div>

                    <div className="admin-collection-list">
                      {formState.reviewEntries.map((entry) => (
                        <div className="admin-collection-card" key={entry.id}>
                          <label className="admin-field">
                            <span>Quote</span>
                            <textarea
                              rows="4"
                              value={entry.quote}
                              onChange={(event) => updateReviewEntry(entry.id, 'quote', event.target.value)}
                              disabled={!propertyEditingEnabled}
                            />
                          </label>
                          <label className="admin-field">
                            <span>Author</span>
                            <input
                              type="text"
                              value={entry.author}
                              onChange={(event) => updateReviewEntry(entry.id, 'author', event.target.value)}
                              disabled={!propertyEditingEnabled}
                            />
                          </label>
                          <button
                            className="button-link button-link--ghost admin-action"
                            type="button"
                            onClick={() => removeReviewEntry(entry.id)}
                          >
                            Remove review
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="admin-subsection">
                    <div className="admin-subsection-header">
                      <h4>Booking contact</h4>
                    </div>

                    <div className="admin-form-grid">
                      <label className="admin-field">
                        <span>Contact name</span>
                        <input
                          type="text"
                          value={formState.bookingContactName}
                          onChange={(event) => updateFormState('bookingContactName', event.target.value)}
                          disabled={!propertyEditingEnabled}
                        />
                      </label>

                      <label className="admin-field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={formState.bookingEmail}
                          onChange={(event) => updateFormState('bookingEmail', event.target.value)}
                          disabled={!propertyEditingEnabled}
                        />
                      </label>

                      <label className="admin-field admin-field--wide">
                        <span>Booking note</span>
                        <textarea
                          rows="4"
                          value={formState.bookingNote}
                          onChange={(event) => updateFormState('bookingNote', event.target.value)}
                          disabled={!propertyEditingEnabled}
                        />
                      </label>
                    </div>
                  </section>

                  <div className="admin-form-actions">
                    <button className="button-link button-link--primary admin-submit" type="submit" disabled={!propertyEditingEnabled || saveStatus === 'saving'}>
                      {saveStatus === 'saving'
                        ? 'Saving...'
                        : editorState.mode === 'create'
                          ? 'Create property'
                          : 'Save property'}
                    </button>
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateForm}>
                      Clear form
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-header">
              <div>
                <div className="eyebrow">Pages</div>
                <h2>Routes in the current site rebuild</h2>
              </div>
            </div>

            <div className="admin-pages-grid">
              {pageInventory.map((page) => {
                const isDynamicRoute = page.path.includes(':')

                return (
                  <article className="admin-page-card" key={page.key}>
                    <div className="admin-page-card-top">
                      <span className="admin-route-tag">{page.source}</span>
                      <span className="admin-route-group">{page.group}</span>
                    </div>
                    <h3>{repairSnapshotText(page.label)}</h3>
                    <p>{repairSnapshotText(page.title)}</p>
                    <code>{page.path}</code>
                    {!isDynamicRoute ? (
                      <Link className="button-link button-link--ghost admin-action" to={page.path}>
                        Open route
                      </Link>
                    ) : (
                      <span className="admin-note">Dynamic route template</span>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        </div>
      </section>
    </article>
  )
}
