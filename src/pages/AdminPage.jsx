import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminIdToken, observeAdminUser, signInAdmin, signOutAdmin } from '../lib/adminAuth'
import {
  getCharterDataSourceMode,
  isCharterEditingEnabled,
  isFirebaseCharterData,
  listAllCharters,
  resetAdminCharters,
  saveAdminCharter,
} from '../lib/charterRepository'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  getPropertyDataSourceMode,
  isFirebasePropertyData,
  isPropertyEditingEnabled,
  listProperties,
  resetAdminProperties,
  saveAdminProperty,
} from '../lib/propertyRepository'
import { getSiteContentSourceMode, readPageInventory } from '../lib/siteContentRepository'

const pageInventory = readPageInventory()

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
    existingDescriptionHtml: '',
    existingAmenitiesHtml: '',
    existingReviewsHtml: '',
    heroImageUrl: '',
    heroImageAlt: '',
    bookingContactName: '',
    bookingEmail: '',
    bookingNote: '',
    amenityGroups: [createAmenityEditor({ title: 'Amenities' })],
    reviewEntries: [createReviewEditor()],
  }
}

function createInitialAmenityGroups(property = {}) {
  if (property.amenityGroups?.length > 0) {
    return property.amenityGroups.map((group) => createAmenityEditor(group))
  }

  const amenityLines = parseLineList(htmlToText(property.amenitiesHtml ?? ''))
  return [createAmenityEditor({ title: 'Amenities', items: amenityLines })]
}

function createInitialReviewEntries(property = {}) {
  if (property.reviewEntries?.length > 0) {
    return property.reviewEntries.map((entry) => createReviewEditor(entry))
  }

  const reviewText = htmlToText(property.reviewsHtml ?? '')
  return reviewText ? [createReviewEditor({ quote: reviewText })] : [createReviewEditor()]
}

function createFormState(property) {
  return {
    originalSlug: property.adminOriginalSlug ?? property.slug,
    name: repairSnapshotText(property.name ?? ''),
    slug: property.slug ?? '',
    bedrooms: String(property.bedrooms ?? 0),
    bathrooms: String(property.bathrooms ?? 0),
    maxGuests: String(property.maxGuests ?? 0),
    location: repairSnapshotText(property.location ?? 'St. John, USVI'),
    price: repairSnapshotText(property.price ?? ''),
    shortDescription: repairSnapshotText(property.shortDescription ?? ''),
    highlightsText: linesToText(property.highlights ?? property.facts ?? []),
    descriptionText: htmlToText(property.descriptionHtml ?? '') || paragraphsToText(property.description ?? []),
    existingDescriptionHtml: String(property.descriptionHtml ?? ''),
    existingAmenitiesHtml: String(property.amenitiesHtml ?? ''),
    existingReviewsHtml: String(property.reviewsHtml ?? ''),
    heroImageUrl: property.heroImage?.url ?? '',
    heroImageAlt: repairSnapshotText(property.heroImage?.alt ?? ''),
    bookingContactName: repairSnapshotText(property.booking?.contactName ?? ''),
    bookingEmail: repairSnapshotText(property.booking?.email ?? ''),
    bookingNote: repairSnapshotText(property.booking?.note ?? ''),
    amenityGroups: createInitialAmenityGroups(property),
    reviewEntries: createInitialReviewEntries(property),
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
    existingDescriptionHtml: formState.existingDescriptionHtml,
    existingAmenitiesHtml: formState.existingAmenitiesHtml,
    existingReviewsHtml: formState.existingReviewsHtml,
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

function htmlToText(html) {
  return String(html ?? '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function createEmptyCharterFormState() {
  return {
    originalSlug: '',
    name: '',
    slug: '',
    active: true,
    shortDescription: '',
    phoneNumber: '',
    email: '',
    website: '',
    heroImageUrl: '',
    heroImageAlt: '',
    descriptionText: '',
  }
}

function createCharterFormState(charter) {
  return {
    originalSlug: charter.adminOriginalSlug ?? charter.slug,
    name: repairSnapshotText(charter.name ?? ''),
    slug: charter.slug ?? '',
    active: charter.active !== false,
    shortDescription: repairSnapshotText(charter.shortDescription ?? ''),
    phoneNumber: repairSnapshotText(charter.phoneNumber ?? ''),
    email: repairSnapshotText(charter.email ?? ''),
    website: repairSnapshotText(charter.website ?? ''),
    heroImageUrl: charter.heroImage?.url ?? '',
    heroImageAlt: repairSnapshotText(charter.heroImage?.alt ?? ''),
    descriptionText: htmlToText(charter.contentHtml ?? ''),
  }
}

function buildCharterDraft(formState) {
  return {
    name: repairSnapshotText(formState.name).trim(),
    slug: repairSnapshotText(formState.slug).trim(),
    active: formState.active,
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    phoneNumber: repairSnapshotText(formState.phoneNumber).trim(),
    email: repairSnapshotText(formState.email).trim(),
    website: repairSnapshotText(formState.website).trim(),
    contentParagraphs: parseParagraphList(formState.descriptionText),
    heroImage: formState.heroImageUrl.trim()
      ? {
          url: formState.heroImageUrl.trim(),
          alt: repairSnapshotText(formState.heroImageAlt).trim(),
          title: repairSnapshotText(formState.name).trim(),
        }
      : null,
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

function CharterListItem({ active, charter, onSelect }) {
  return (
    <button
      className={`admin-property-button ${active ? 'admin-property-button--active' : ''}`.trim()}
      type="button"
      onClick={() => onSelect(charter)}
    >
      <strong>{repairSnapshotText(charter.name)}</strong>
      <span>{charter.active ? 'Active' : 'Deactivated'}</span>
    </button>
  )
}

function formatDataSourceLabel(mode) {
  switch (mode) {
    case 'mock':
      return 'browser-local'
    case 'firebase':
      return 'firebase'
    case 'api':
      return 'api read-only'
    default:
      return 'local read-only'
  }
}

export function AdminPage() {
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', properties: [] })
  const [formState, setFormState] = useState(createEmptyFormState())
  const [editorState, setEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const propertyEditingEnabled = isPropertyEditingEnabled()
  const propertyDataSourceMode = getPropertyDataSourceMode()
  const propertyUsesFirebase = isFirebasePropertyData()

  const [charterWorkspaceState, setCharterWorkspaceState] = useState({ status: 'loading', charters: [] })
  const [charterFormState, setCharterFormState] = useState(createEmptyCharterFormState())
  const [charterEditorState, setCharterEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [charterFeedback, setCharterFeedback] = useState('')
  const [charterSaveStatus, setCharterSaveStatus] = useState('idle')
  const charterEditingEnabled = isCharterEditingEnabled()
  const charterDataSourceMode = getCharterDataSourceMode()
  const charterUsesFirebase = isFirebaseCharterData()
  const requiresAdminSignIn = propertyUsesFirebase || charterUsesFirebase
  const [authState, setAuthState] = useState(() => ({
    status: requiresAdminSignIn ? (isFirebaseConfigured() ? 'loading' : 'unconfigured') : 'disabled',
    user: null,
  }))
  const [authFormState, setAuthFormState] = useState({ email: '', password: '' })
  const [authFeedback, setAuthFeedback] = useState('')
  const [authFeedbackStatus, setAuthFeedbackStatus] = useState('idle')

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

  useEffect(() => {
    let cancelled = false

    async function loadCharterWorkspace() {
      try {
        const charters = await listAllCharters()

        if (cancelled) {
          return
        }

        setCharterWorkspaceState({ status: 'ready', charters })

        if (charters.length > 0) {
          setCharterEditorState({ mode: 'edit', activeSlug: charters[0].slug })
          setCharterFormState(createCharterFormState(charters[0]))
          return
        }

        setCharterEditorState({ mode: 'create', activeSlug: '' })
        setCharterFormState(createEmptyCharterFormState())
      } catch (error) {
        if (!cancelled) {
          setCharterWorkspaceState({
            status: 'error',
            charters: [],
            message: error instanceof Error ? error.message : 'Unknown charter workspace error',
          })
        }
      }
    }

    loadCharterWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!requiresAdminSignIn) {
      return undefined
    }

    if (!isFirebaseConfigured()) {
      return undefined
    }

    return observeAdminUser((user) => {
      setAuthState({
        status: user ? 'authenticated' : 'signed-out',
        user,
      })
    })
  }, [requiresAdminSignIn])

  async function getAdminRequestOptions() {
    if (!requiresAdminSignIn) {
      return {}
    }

    if (!isFirebaseConfigured()) {
      throw new Error('Firebase client configuration is missing. Fill in the VITE_FIREBASE_* values first.')
    }

    const authToken = await getAdminIdToken()

    if (!authToken) {
      throw new Error('Sign in to Firebase before saving or resetting live edits.')
    }

    return { authToken }
  }

  async function handleAdminSignIn(event) {
    event.preventDefault()

    try {
      setAuthFeedbackStatus('saving')
      await signInAdmin(authFormState.email.trim(), authFormState.password)
      setAuthFormState((currentState) => ({ ...currentState, password: '' }))
      setAuthFeedback('Signed in to Firebase admin editing.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in to Firebase.')
      setAuthFeedbackStatus('error')
    }
  }

  async function handleAdminSignOut() {
    try {
      setAuthFeedbackStatus('saving')
      await signOutAdmin()
      setAuthFeedback('Signed out of Firebase admin editing.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign out of Firebase.')
      setAuthFeedbackStatus('error')
    }
  }

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
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      const savedProperty = await saveAdminProperty(
        buildPropertyDraft(formState),
        editorState.mode === 'edit' ? formState.originalSlug : '',
        requestOptions,
      )
      const properties = await listProperties()
      setWorkspaceState({ status: 'ready', properties })
      setEditorState({ mode: 'edit', activeSlug: savedProperty.slug })
      setFormState(createFormState(savedProperty))
      setFeedback(
        editorState.mode === 'create'
          ? propertyUsesFirebase
            ? `Added ${savedProperty.name} to Firebase-backed property content.`
            : `Added ${savedProperty.name} to the browser-local property catalog.`
          : `Saved changes to ${savedProperty.name}.`,
      )
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to save property changes.')
    }
  }

  async function handleResetLocalEdits() {
    const confirmationMessage = propertyUsesFirebase
      ? 'Restore the Firebase property catalog to the generated baseline?'
      : 'Reset all browser-local property edits and return to the generated catalog?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    try {
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      await resetAdminProperties(requestOptions)
      setSaveStatus('idle')
      setFeedback(
        propertyUsesFirebase
          ? 'Restored the Firebase property catalog to the generated baseline.'
          : 'Restored the generated property catalog for this browser.',
      )

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
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to reset property edits.')
    }
  }

  function openCreateCharterForm() {
    setCharterEditorState({ mode: 'create', activeSlug: '' })
    setCharterFormState(createEmptyCharterFormState())
    setCharterFeedback('')
  }

  function openEditCharterForm(charter) {
    setCharterEditorState({ mode: 'edit', activeSlug: charter.slug })
    setCharterFormState(createCharterFormState(charter))
    setCharterFeedback('')
  }

  function updateCharterFormState(field, value) {
    setCharterFormState((current) => ({ ...current, [field]: value }))
  }

  async function handleCharterSubmit(event) {
    event.preventDefault()

    try {
      setCharterSaveStatus('saving')
      const requestOptions = charterUsesFirebase ? await getAdminRequestOptions() : {}
      const saved = await saveAdminCharter(
        buildCharterDraft(charterFormState),
        charterEditorState.mode === 'edit' ? charterFormState.originalSlug : '',
        requestOptions,
      )
      const charters = await listAllCharters()
      setCharterWorkspaceState({ status: 'ready', charters })
      setCharterEditorState({ mode: 'edit', activeSlug: saved.slug })
      setCharterFormState(createCharterFormState(saved))
      setCharterFeedback(
        charterEditorState.mode === 'create'
          ? charterUsesFirebase
            ? `Added ${saved.name} to Firebase-backed charter content.`
            : `Added ${saved.name} to the browser-local charter catalog.`
          : `Saved changes to ${saved.name}.`,
      )
      setCharterSaveStatus('idle')
    } catch (error) {
      setCharterSaveStatus('error')
      setCharterFeedback(error instanceof Error ? error.message : 'Unable to save charter changes.')
    }
  }

  async function handleResetCharterEdits() {
    const confirmationMessage = charterUsesFirebase
      ? 'Restore the Firebase charter catalog to the generated baseline?'
      : 'Reset all browser-local charter edits and return to the generated catalog?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    try {
      const requestOptions = charterUsesFirebase ? await getAdminRequestOptions() : {}
      await resetAdminCharters(requestOptions)
      setCharterSaveStatus('idle')
      setCharterFeedback(
        charterUsesFirebase
          ? 'Restored the Firebase charter catalog to the generated baseline.'
          : 'Restored the generated charter catalog for this browser.',
      )

      const charters = await listAllCharters()
      setCharterWorkspaceState({ status: 'ready', charters })

      if (charters.length > 0) {
        setCharterEditorState({ mode: 'edit', activeSlug: charters[0].slug })
        setCharterFormState(createCharterFormState(charters[0]))
        return
      }

      openCreateCharterForm()
    } catch (error) {
      setCharterWorkspaceState({
        status: 'error',
        charters: [],
        message: error instanceof Error ? error.message : 'Unable to reload the charter catalog.',
      })
      setCharterSaveStatus('error')
      setCharterFeedback(error instanceof Error ? error.message : 'Unable to reset charter edits.')
    }
  }

  const isLoading = workspaceState.status === 'loading'
  const properties = workspaceState.properties ?? []
  const structuredPageCount = pageInventory.filter((page) => page.source === 'structured').length
  const legacySnapshotPageCount = pageInventory.filter((page) => page.source === 'legacy-snapshot').length
  const propertySaveEnabled = propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user))
  const charterSaveEnabled = charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user))

  return (
    <article className="admin-page">
      <section className="page-section admin-header">
        <div className="eyebrow">Admin</div>
        <h1>Content workspace</h1>
        <p>
          This route is intentionally hidden from the public navigation. Use it to review site routes
          and manage property and charter data while the broader CMS is still structured in code.
        </p>
        <div className="admin-chip-row">
          <span className="admin-chip">Route: /admin</span>
          <span className="admin-chip">Site content source: {getSiteContentSourceMode()}</span>
          <span className="admin-chip">Structured pages: {structuredPageCount}</span>
          <span className="admin-chip">Legacy snapshot pages: {legacySnapshotPageCount}</span>
          <span className="admin-chip">Property source: {formatDataSourceLabel(propertyDataSourceMode)}</span>
          <span className="admin-chip">Charter source: {formatDataSourceLabel(charterDataSourceMode)}</span>
        </div>

        {requiresAdminSignIn ? (
          <div className="admin-auth-panel admin-editor">
            <div className="admin-editor-header">
              <div>
                <div className="eyebrow">Firebase Access</div>
                <h3>Sign in for live editing</h3>
              </div>
              {authState.user ? (
                <button className="button-link button-link--ghost admin-action" type="button" onClick={handleAdminSignOut}>
                  Sign out
                </button>
              ) : null}
            </div>

            {authFeedback ? <p className={`admin-feedback admin-feedback--${authFeedbackStatus}`}>{authFeedback}</p> : null}

            {authState.status === 'unconfigured' ? (
              <p className="admin-note">
                Firebase client configuration is missing. Fill in the `VITE_FIREBASE_*` values before
                using Firebase-backed editing.
              </p>
            ) : null}

            {authState.status === 'loading' ? <p className="admin-note">Checking Firebase sign-in state...</p> : null}

            {authState.user ? (
              <p className="admin-note">
                Signed in as <strong>{authState.user.email}</strong>. Saves and resets for Firebase-backed
                collections are enabled.
              </p>
            ) : null}

            {authState.status === 'signed-out' ? (
              <form className="admin-form" onSubmit={handleAdminSignIn}>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>Email</span>
                    <input
                      autoComplete="email"
                      type="email"
                      value={authFormState.email}
                      onChange={(event) =>
                        setAuthFormState((currentState) => ({ ...currentState, email: event.target.value }))
                      }
                    />
                  </label>

                  <label className="admin-field">
                    <span>Password</span>
                    <input
                      autoComplete="current-password"
                      type="password"
                      value={authFormState.password}
                      onChange={(event) =>
                        setAuthFormState((currentState) => ({ ...currentState, password: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <div className="admin-form-actions">
                  <button className="button-link button-link--primary admin-submit" type="submit">
                    Sign in
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
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
                    {propertyUsesFirebase ? 'Restore Firebase catalog' : 'Reset local edits'}
                  </button>
                ) : null}
              </div>
            </div>

            {!propertyEditingEnabled ? (
              <p className="admin-note">
                Property editing is read only in the current mode. Set `VITE_PROPERTY_DATA_SOURCE` to
                `mock` for browser-local drafts or `firebase` for shared live editing.
              </p>
            ) : null}

            {propertyUsesFirebase && !authState.user ? (
              <p className="admin-note">
                Property saves are routed through Firebase-backed admin endpoints and require a signed-in
                Firebase user.
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
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Slug</span>
                      <input
                        type="text"
                        value={formState.slug}
                        onChange={(event) => updateFormState('slug', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Bedrooms</span>
                      <input
                        type="number"
                        min="0"
                        value={formState.bedrooms}
                        onChange={(event) => updateFormState('bedrooms', event.target.value)}
                        disabled={!propertySaveEnabled}
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
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Max guests</span>
                      <input
                        type="number"
                        min="0"
                        value={formState.maxGuests}
                        onChange={(event) => updateFormState('maxGuests', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Price</span>
                      <input
                        type="text"
                        value={formState.price}
                        onChange={(event) => updateFormState('price', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Location</span>
                      <input
                        type="text"
                        value={formState.location}
                        onChange={(event) => updateFormState('location', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Short description</span>
                      <textarea
                        rows="3"
                        value={formState.shortDescription}
                        onChange={(event) => updateFormState('shortDescription', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Highlights</span>
                      <textarea
                        rows="5"
                        value={formState.highlightsText}
                        onChange={(event) => updateFormState('highlightsText', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Description paragraphs</span>
                      <textarea
                        rows="8"
                        value={formState.descriptionText}
                        onChange={(event) => updateFormState('descriptionText', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image URL</span>
                      <input
                        type="url"
                        value={formState.heroImageUrl}
                        onChange={(event) => updateFormState('heroImageUrl', event.target.value)}
                        disabled={!propertySaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image alt text</span>
                      <input
                        type="text"
                        value={formState.heroImageAlt}
                        onChange={(event) => updateFormState('heroImageAlt', event.target.value)}
                        disabled={!propertySaveEnabled}
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
                              disabled={!propertySaveEnabled}
                            />
                          </label>
                          <label className="admin-field">
                            <span>Items</span>
                            <textarea
                              rows="5"
                              value={group.itemsText}
                              onChange={(event) => updateAmenityGroup(group.id, 'itemsText', event.target.value)}
                              disabled={!propertySaveEnabled}
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
                              disabled={!propertySaveEnabled}
                            />
                          </label>
                          <label className="admin-field">
                            <span>Author</span>
                            <input
                              type="text"
                              value={entry.author}
                              onChange={(event) => updateReviewEntry(entry.id, 'author', event.target.value)}
                              disabled={!propertySaveEnabled}
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
                          disabled={!propertySaveEnabled}
                        />
                      </label>

                      <label className="admin-field">
                        <span>Email</span>
                        <input
                          type="email"
                          value={formState.bookingEmail}
                          onChange={(event) => updateFormState('bookingEmail', event.target.value)}
                          disabled={!propertySaveEnabled}
                        />
                      </label>

                      <label className="admin-field admin-field--wide">
                        <span>Booking note</span>
                        <textarea
                          rows="4"
                          value={formState.bookingNote}
                          onChange={(event) => updateFormState('bookingNote', event.target.value)}
                          disabled={!propertySaveEnabled}
                        />
                      </label>
                    </div>
                  </section>

                  <div className="admin-form-actions">
                    <button className="button-link button-link--primary admin-submit" type="submit" disabled={!propertySaveEnabled || saveStatus === 'saving'}>
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
                <div className="eyebrow">Charter Boats</div>
                <h2>Add and edit charter boat listings</h2>
              </div>
              <div className="admin-inline-actions">
                <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateCharterForm}>
                  New charter
                </button>
                {charterEditingEnabled ? (
                  <button
                    className="button-link button-link--ghost admin-action"
                    type="button"
                    onClick={handleResetCharterEdits}
                  >
                    {charterUsesFirebase ? 'Restore Firebase catalog' : 'Reset local edits'}
                  </button>
                ) : null}
              </div>
            </div>

            {!charterEditingEnabled ? (
              <p className="admin-note">
                Charter editing is read only in the current mode. Set `VITE_CHARTER_DATA_SOURCE` to
                `mock` for browser-local drafts or `firebase` for shared live editing.
              </p>
            ) : null}

            {charterUsesFirebase && !authState.user ? (
              <p className="admin-note">
                Charter saves are routed through Firebase-backed admin endpoints and require a signed-in
                Firebase user.
              </p>
            ) : null}

            {charterWorkspaceState.status === 'error' ? (
              <p className="admin-empty">{charterWorkspaceState.message}</p>
            ) : null}

            <div className="admin-property-grid">
              <div className="admin-property-list">
                {charterWorkspaceState.status === 'loading' ? (
                  <p className="admin-empty">Loading charter catalog...</p>
                ) : null}

                {charterWorkspaceState.status === 'ready' && charterWorkspaceState.charters.length === 0 ? (
                  <p className="admin-empty">No charters available yet. Start with a new draft.</p>
                ) : null}

                {charterWorkspaceState.charters.map((charter) => (
                  <CharterListItem
                    active={charterEditorState.mode === 'edit' && charterEditorState.activeSlug === charter.slug}
                    key={charter.slug}
                    charter={charter}
                    onSelect={openEditCharterForm}
                  />
                ))}
              </div>

              <div className="admin-editor">
                <div className="admin-editor-header">
                  <div>
                    <div className="eyebrow">
                      {charterEditorState.mode === 'create' ? 'New charter' : 'Editing charter'}
                    </div>
                    <h3>
                      {charterEditorState.mode === 'create'
                        ? 'Create a charter draft'
                        : repairSnapshotText(charterFormState.name)}
                    </h3>
                  </div>
                  {charterEditorState.mode === 'edit' && charterEditorState.activeSlug ? (
                    <Link
                      className="button-link button-link--ghost admin-action"
                      to={`/charter-boat-rentals/${charterEditorState.activeSlug}`}
                    >
                      Open public route
                    </Link>
                  ) : null}
                </div>

                {charterFeedback ? (
                  <p className={`admin-feedback admin-feedback--${charterSaveStatus}`}>{charterFeedback}</p>
                ) : null}

                <form className="admin-form" onSubmit={handleCharterSubmit}>
                  <div className="admin-form-grid">
                    <label className="admin-field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={charterFormState.name}
                        onChange={(event) => updateCharterFormState('name', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Slug</span>
                      <input
                        type="text"
                        value={charterFormState.slug}
                        onChange={(event) => updateCharterFormState('slug', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>
                        <input
                          type="checkbox"
                          checked={charterFormState.active}
                          onChange={(event) => updateCharterFormState('active', event.target.checked)}
                          disabled={!charterSaveEnabled}
                        />
                        {' '}Active (visible on public charter page)
                      </span>
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Short description</span>
                      <textarea
                        rows="3"
                        value={charterFormState.shortDescription}
                        onChange={(event) => updateCharterFormState('shortDescription', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Phone number</span>
                      <input
                        type="text"
                        value={charterFormState.phoneNumber}
                        onChange={(event) => updateCharterFormState('phoneNumber', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={charterFormState.email}
                        onChange={(event) => updateCharterFormState('email', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Website</span>
                      <input
                        type="url"
                        value={charterFormState.website}
                        onChange={(event) => updateCharterFormState('website', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image URL</span>
                      <input
                        type="url"
                        value={charterFormState.heroImageUrl}
                        onChange={(event) => updateCharterFormState('heroImageUrl', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Hero image alt text</span>
                      <input
                        type="text"
                        value={charterFormState.heroImageAlt}
                        onChange={(event) => updateCharterFormState('heroImageAlt', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>

                    <label className="admin-field admin-field--wide">
                      <span>Description paragraphs</span>
                      <textarea
                        rows="8"
                        value={charterFormState.descriptionText}
                        onChange={(event) => updateCharterFormState('descriptionText', event.target.value)}
                        disabled={!charterSaveEnabled}
                      />
                    </label>
                  </div>

                  <div className="admin-form-actions">
                    <button
                      className="button-link button-link--primary admin-submit"
                      type="submit"
                      disabled={!charterSaveEnabled || charterSaveStatus === 'saving'}
                    >
                      {charterSaveStatus === 'saving'
                        ? 'Saving...'
                        : charterEditorState.mode === 'create'
                          ? 'Create charter'
                          : 'Save charter'}
                    </button>
                    <button
                      className="button-link button-link--ghost admin-action"
                      type="button"
                      onClick={openCreateCharterForm}
                    >
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
                <h2>Current site routes</h2>
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
