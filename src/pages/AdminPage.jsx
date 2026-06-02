import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminAutoLoginCredentials, getAdminIdToken, observeAdminUser, signInAdmin, signOutAdmin } from '../lib/adminAuth'
import { AdminDocumentEditor } from '../components/AdminDocumentEditor'
import { AdminPropertyPreview } from '../components/AdminPropertyPreview'
import { AdminStructuredPageEditor } from '../components/AdminStructuredPageEditor'
import {
  isCharterEditingEnabled,
  isFirebaseCharterData,
  listAllCharters,
  resetAdminCharters,
  saveAdminCharter,
} from '../lib/charterRepository'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  isFirebasePropertyData,
  isPropertyEditingEnabled,
  listProperties,
  resetAdminProperties,
  saveAdminProperty,
} from '../lib/propertyRepository'
import {
  fetchAdminSiteShellContent,
  fetchAdminStructuredPageContent,
  fetchAdminStructuredPageDirectory,
  isSiteContentEditingEnabled,
  readStructuredPageSummaries,
  resetAdminSiteShellContent,
  resetAdminStructuredPageContent,
  saveAdminSiteShellContent,
  saveAdminStructuredPageContent,
} from '../lib/siteContentRepository'

const SITE_SHELL_HIDDEN_KEYS = ['source', 'kind', 'assetId', 'src', 'matchPaths', 'children', 'primaryNav', 'legalNav']
const SITE_SHELL_HIDDEN_PATHS = []

const CONTENT_LABEL_OVERRIDES = {
  utility: 'Top Bar',
  socialLink: 'Facebook Link',
  bookingCallouts: 'Top Bar Callouts',
  primaryEmail: 'Contact Email',
  navLabel: 'Menu Label',
  hero: 'Hero Banner',
  titleLines: 'Heading Lines',
  leadParagraphs: 'Intro Paragraphs',
  bodyParagraphs: 'Main Paragraphs',
  bodyHtml: 'Page Body',
  metaDescription: 'Search Description',
  imageGallery: 'Gallery Images',
  image: 'Image',
  url: 'Image URL',
  href: 'Link URL',
  alt: 'Image Description',
  label: 'Link Text',
  value: 'Text',
  bodyLink: 'Inline Link',
  action: 'Button',
  trust: 'Why Choose Us',
  discover: 'Discover Section',
  about: 'About Section',
  story: 'Story Section',
  essentials: 'Essentials Section',
  intro: 'Intro Section',
  directory: 'Listings Section',
  details: 'Details Section',
  contact: 'Contact Section',
  map: 'Map Section',
  dining: 'Dining Section',
  operators: 'Ferry Companies',
  schedules: 'Schedules',
  columns: 'Columns',
  rates: 'Rates',
  rows: 'Rate Rows',
  values: 'Values',
  lines: 'List Items',
  sections: 'Sections',
  companies: 'Companies',
  features: 'Features',
  leftParagraphs: 'Left Column Text',
  rightParagraphs: 'Right Column Text',
  contactLines: 'Contact Details',
  bookingHelpParts: 'Booking Help Text',
  referenceLink: 'Reference Link',
  detailImage: 'Detail Image',
  footer: 'Footer',
  header: 'Header',
  logo: 'Logo',
  copyright: 'Copyright Line',
  designCredit: 'Footer Credit',
  redHook: 'Red Hook Ferry',
  crownBay: 'Crown Bay Ferry',
  safety: 'Safety Section',
  field: 'Field',
  placeholder: 'Placeholder Text',
  submitLabel: 'Button Text',
}

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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

function createImageEditor(image = {}) {
  return {
    id: makeToken(),
    url: String(image.url ?? '').trim(),
    alt: repairSnapshotText(image.alt ?? ''),
    title: repairSnapshotText(image.title ?? ''),
  }
}

function createGalleryAssets(galleryImages = []) {
  return galleryImages
    .map((image) => ({
      url: String(image.url ?? '').trim(),
      alt: repairSnapshotText(image.alt ?? '').trim(),
      title: repairSnapshotText(image.title ?? '').trim(),
    }))
    .filter((image) => image.url)
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
    galleryImages: [],
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

function createInitialGalleryImages(property = {}) {
  if (Array.isArray(property.gallery) && property.gallery.length > 0) {
    return property.gallery.map((image) => createImageEditor(image))
  }

  if (property.heroImage?.url) {
    return [createImageEditor(property.heroImage)]
  }

  return []
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
    galleryImages: createInitialGalleryImages(property),
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
  const gallery = createGalleryAssets(formState.galleryImages)
  const heroImage = formState.heroImageUrl.trim()
    ? {
        url: formState.heroImageUrl.trim(),
        alt: repairSnapshotText(formState.heroImageAlt).trim(),
        title: repairSnapshotText(formState.name).trim(),
      }
    : gallery[0] ?? null

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
    heroImage,
    gallery,
  }
}

function paragraphListToHtml(values = []) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join('\n')
}

function amenityGroupsToHtml(groups = []) {
  return groups
    .flatMap((group) => {
      const title = String(group?.title ?? '').trim()
      const items = parseLineList(group?.itemsText ?? '')
      const lines = []

      if (title) {
        lines.push(`<h4>${escapeHtml(title)}</h4>`)
      }

      items.forEach((item) => {
        lines.push(`<p>${escapeHtml(item)}</p>`)
      })

      return lines
    })
    .join('\n')
}

function reviewEntriesToHtml(entries = []) {
  return entries
    .flatMap((entry) => {
      const quote = repairSnapshotText(entry?.quote ?? '').trim()
      const author = repairSnapshotText(entry?.author ?? '').trim()
      const lines = []

      if (author) {
        lines.push(`<h6>${escapeHtml(author)}</h6>`)
      }

      if (quote) {
        lines.push(`<p>${escapeHtml(quote)}</p>`)
      }

      return lines
    })
    .join('\n')
}

function buildPropertyPreviewModel(formState) {
  const facts = parseLineList(formState.highlightsText)
  const descriptionParagraphs = parseParagraphList(formState.descriptionText)
  const gallery = createGalleryAssets(formState.galleryImages)
  const heroImage = formState.heroImageUrl.trim()
    ? {
        url: formState.heroImageUrl.trim(),
        alt: repairSnapshotText(formState.heroImageAlt).trim(),
        title: repairSnapshotText(formState.name).trim(),
      }
    : gallery[0] ?? null
  const amenityHtml = amenityGroupsToHtml(formState.amenityGroups)
  const reviewsHtml = reviewEntriesToHtml(formState.reviewEntries)
  const bedrooms = Number(formState.bedrooms) || 0

  return {
    slug: repairSnapshotText(formState.slug).trim(),
    name: repairSnapshotText(formState.name).trim() || 'Untitled Property',
    bedrooms,
    bedroomLabel: bedrooms > 0 ? `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}` : '',
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    facts,
    descriptionHtml:
      descriptionParagraphs.length > 0
        ? paragraphListToHtml(descriptionParagraphs)
        : String(formState.existingDescriptionHtml ?? '').trim(),
    amenitiesHtml: amenityHtml || String(formState.existingAmenitiesHtml ?? '').trim(),
    reviewsHtml: reviewsHtml || String(formState.existingReviewsHtml ?? '').trim(),
    heroImage,
    gallery,
    booking: {
      contactName: repairSnapshotText(formState.bookingContactName).trim(),
      email: repairSnapshotText(formState.bookingEmail).trim(),
      note: repairSnapshotText(formState.bookingNote).trim(),
    },
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

function PageListItem({ active, page, onSelect }) {
  return (
    <button
      className={`admin-property-button ${active ? 'admin-property-button--active' : ''}`.trim()}
      type="button"
      onClick={() => onSelect(page)}
    >
      <strong>{repairSnapshotText(page.label || page.key)}</strong>
      <span>{repairSnapshotText(page.title || 'Untitled page')}</span>
      <span>{page.path}</span>
    </button>
  )
}

function AdminTabButton({ active, detail, label, onClick }) {
  return (
    <button
      className={`admin-tab-button ${active ? 'admin-tab-button--active' : ''}`.trim()}
      type="button"
      onClick={onClick}
    >
      <strong>{label}</strong>
      {detail ? <span>{detail}</span> : null}
    </button>
  )
}

export function AdminPage() {
  const adminAutoLoginCredentials = getAdminAutoLoginCredentials()
  const adminAutoLoginEnabled = Boolean(adminAutoLoginCredentials)
  const adminAutoLoginAttemptedRef = useRef(false)
  const [activeTab, setActiveTab] = useState('pages')
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', properties: [] })
  const [formState, setFormState] = useState(createEmptyFormState())
  const [editorState, setEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const propertyEditingEnabled = isPropertyEditingEnabled()
  const propertyUsesFirebase = isFirebasePropertyData()

  const [charterWorkspaceState, setCharterWorkspaceState] = useState({ status: 'loading', charters: [] })
  const [charterFormState, setCharterFormState] = useState(createEmptyCharterFormState())
  const [charterEditorState, setCharterEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [charterFeedback, setCharterFeedback] = useState('')
  const [charterSaveStatus, setCharterSaveStatus] = useState('idle')
  const charterEditingEnabled = isCharterEditingEnabled()
  const charterUsesFirebase = isFirebaseCharterData()

  const [siteShellWorkspaceState, setSiteShellWorkspaceState] = useState({
    status: 'loading',
    message: '',
    shell: null,
  })
  const [siteShellDraft, setSiteShellDraft] = useState(null)
  const [siteShellFeedback, setSiteShellFeedback] = useState('')
  const [siteShellSaveStatus, setSiteShellSaveStatus] = useState('idle')

  const [pageWorkspaceState, setPageWorkspaceState] = useState(() => ({
    status: 'loading',
    pages: readStructuredPageSummaries(),
    message: '',
  }))
  const [pageEditorState, setPageEditorState] = useState({ status: 'idle', activeKey: '', draft: null })
  const [pageFeedback, setPageFeedback] = useState('')
  const [pageSaveStatus, setPageSaveStatus] = useState('idle')

  const siteContentEditingEnabled = isSiteContentEditingEnabled()
  const requiresAdminSignIn = propertyUsesFirebase || charterUsesFirebase || siteContentEditingEnabled
  const [authState, setAuthState] = useState(() => ({
    status: requiresAdminSignIn ? (isFirebaseConfigured() ? 'loading' : 'unconfigured') : 'disabled',
    user: null,
  }))
  const [authFormState, setAuthFormState] = useState(() => ({
    email: adminAutoLoginCredentials?.email ?? '',
    password: '',
  }))
  const [authFeedback, setAuthFeedback] = useState('')
  const [authFeedbackStatus, setAuthFeedbackStatus] = useState('idle')
  const [autoLoginStatus, setAutoLoginStatus] = useState(adminAutoLoginEnabled ? 'pending' : 'disabled')

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
    let cancelled = false

    async function loadSiteShellWorkspace() {
      try {
        const shell = await fetchAdminSiteShellContent()

        if (cancelled) {
          return
        }

        setSiteShellWorkspaceState({ status: 'ready', shell, message: '' })
        setSiteShellDraft(shell)
      } catch (error) {
        if (!cancelled) {
          setSiteShellWorkspaceState({
            status: 'error',
            shell: null,
            message: error instanceof Error ? error.message : 'Unable to load the site shell.',
          })
          setSiteShellDraft(null)
        }
      }
    }

    loadSiteShellWorkspace()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadStructuredPagesWorkspace() {
      try {
        const directory = await fetchAdminStructuredPageDirectory()

        if (cancelled) {
          return
        }

        const pages = Array.isArray(directory?.pages) && directory.pages.length > 0 ? directory.pages : readStructuredPageSummaries()

        setPageWorkspaceState({
          status: 'ready',
          pages,
          message: '',
        })

        const firstPage = pages[0]

        if (!firstPage?.key) {
          setPageEditorState({ status: 'idle', activeKey: '', draft: null })
          return
        }

        const page = await fetchAdminStructuredPageContent(firstPage.key)

        if (cancelled) {
          return
        }

        setPageEditorState({
          status: 'ready',
          activeKey: firstPage.key,
          draft: page ?? firstPage,
        })
      } catch (error) {
        if (!cancelled) {
          setPageWorkspaceState({
            status: 'error',
            pages: readStructuredPageSummaries(),
            message: error instanceof Error ? error.message : 'Unable to load structured pages.',
          })
          setPageEditorState({ status: 'error', activeKey: '', draft: null })
        }
      }
    }

    loadStructuredPagesWorkspace()

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

  useEffect(() => {
    if (!requiresAdminSignIn || !adminAutoLoginCredentials || authState.user || authState.status !== 'signed-out') {
      return undefined
    }

    if (adminAutoLoginAttemptedRef.current) {
      return undefined
    }

    let cancelled = false
    adminAutoLoginAttemptedRef.current = true

    async function signInAutomatically() {
      try {
        setAutoLoginStatus('saving')
        setAuthFeedback('Signing into Firebase automatically for this local admin workspace...')
        setAuthFeedbackStatus('saving')
        await signInAdmin(adminAutoLoginCredentials.email, adminAutoLoginCredentials.password)

        if (cancelled) {
          return
        }

        setAuthFormState((currentState) => ({
          ...currentState,
          email: adminAutoLoginCredentials.email,
          password: '',
        }))
        setAuthFeedback('Signed in automatically for live admin editing.')
        setAuthFeedbackStatus('idle')
        setAutoLoginStatus('success')
      } catch (error) {
        if (cancelled) {
          return
        }

        setAuthFormState((currentState) => ({
          ...currentState,
          email: adminAutoLoginCredentials.email,
          password: '',
        }))
        setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in to Firebase automatically.')
        setAuthFeedbackStatus('error')
        setAutoLoginStatus('error')
      }
    }

    signInAutomatically()

    return () => {
      cancelled = true
    }
  }, [adminAutoLoginCredentials, authState.status, authState.user, requiresAdminSignIn])

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
      setAutoLoginStatus(adminAutoLoginEnabled ? 'manual' : 'disabled')
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
      setAutoLoginStatus(adminAutoLoginEnabled ? 'manual' : 'disabled')
      await signOutAdmin()
      setAuthFeedback('Signed out of Firebase admin editing.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign out of Firebase.')
      setAuthFeedbackStatus('error')
    }
  }

  async function loadCurrentSiteShellIntoEditor() {
    try {
      setSiteShellWorkspaceState((current) => ({ ...current, status: 'loading', message: '' }))
      const shell = await fetchAdminSiteShellContent()
      setSiteShellWorkspaceState({ status: 'ready', shell, message: '' })
      setSiteShellDraft(shell)
      setSiteShellFeedback('Reloaded the live site shell document.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellWorkspaceState({
        status: 'error',
        shell: null,
        message: error instanceof Error ? error.message : 'Unable to load the site shell.',
      })
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to reload the site shell.')
      setSiteShellSaveStatus('error')
    }
  }

  async function loadStructuredPageIntoEditor(pageKey) {
    if (!pageKey) {
      return
    }

    try {
      setPageEditorState((current) => ({ ...current, status: 'loading', activeKey: pageKey }))
      const page = await fetchAdminStructuredPageContent(pageKey)
      setPageEditorState({
        status: 'ready',
        activeKey: pageKey,
        draft: page ?? {},
      })
      setPageFeedback('')
      setPageSaveStatus('idle')
    } catch (error) {
      setPageEditorState({ status: 'error', activeKey: pageKey, draft: null })
      setPageFeedback(error instanceof Error ? error.message : 'Unable to load the structured page.')
      setPageSaveStatus('error')
    }
  }

  async function reloadStructuredPageWorkspace(preferredKey = '') {
    const directory = await fetchAdminStructuredPageDirectory()
    const pages = Array.isArray(directory?.pages) && directory.pages.length > 0 ? directory.pages : readStructuredPageSummaries()
    const nextKey = preferredKey || pages[0]?.key || ''

    setPageWorkspaceState({
      status: 'ready',
      pages,
      message: '',
    })

    if (!nextKey) {
      setPageEditorState({ status: 'idle', activeKey: '', draft: null })
      return null
    }

    const page = await fetchAdminStructuredPageContent(nextKey)

    setPageEditorState({
      status: 'ready',
      activeKey: nextKey,
      draft: page ?? pages.find((entry) => entry.key === nextKey) ?? {},
    })

    return page
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

  function updateGalleryImage(imageId, field, value) {
    setFormState((currentState) => ({
      ...currentState,
      galleryImages: currentState.galleryImages.map((image) =>
        image.id === imageId ? { ...image, [field]: value } : image,
      ),
    }))
  }

  function addGalleryImage() {
    setFormState((currentState) => ({
      ...currentState,
      galleryImages: [...currentState.galleryImages, createImageEditor()],
    }))
  }

  function moveGalleryImage(imageId, direction) {
    setFormState((currentState) => {
      const currentIndex = currentState.galleryImages.findIndex((image) => image.id === imageId)
      const nextIndex = currentIndex + direction

      if (currentIndex === -1 || nextIndex < 0 || nextIndex >= currentState.galleryImages.length) {
        return currentState
      }

      const nextGalleryImages = [...currentState.galleryImages]
      const [selectedImage] = nextGalleryImages.splice(currentIndex, 1)
      nextGalleryImages.splice(nextIndex, 0, selectedImage)

      return {
        ...currentState,
        galleryImages: nextGalleryImages,
      }
    })
  }

  function removeGalleryImage(imageId) {
    setFormState((currentState) => ({
      ...currentState,
      galleryImages: currentState.galleryImages.filter((image) => image.id !== imageId),
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

  async function handleSelectStructuredPage(page) {
    await loadStructuredPageIntoEditor(page?.key ?? '')
  }

  async function handleSiteShellSubmit(event) {
    event.preventDefault()

    try {
      setSiteShellSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      const savedSiteShell = await saveAdminSiteShellContent(siteShellDraft ?? {}, requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: savedSiteShell, message: '' })
      setSiteShellDraft(savedSiteShell)
      setSiteShellFeedback('Saved changes to the live site shell document.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to save the site shell.')
    }
  }

  async function handleResetSiteShell() {
    if (!window.confirm('Restore the Firebase site shell document to the generated baseline?')) {
      return
    }

    try {
      setSiteShellSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      const restoredSiteShell = await resetAdminSiteShellContent(requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: restoredSiteShell, message: '' })
      setSiteShellDraft(restoredSiteShell)
      setSiteShellFeedback('Restored the site shell document to the generated baseline.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to restore the site shell.')
    }
  }

  async function handleStructuredPageSubmit(event) {
    event.preventDefault()

    if (!pageEditorState.activeKey) {
      return
    }

    try {
      setPageSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      const savedPage = await saveAdminStructuredPageContent(pageEditorState.activeKey, pageEditorState.draft ?? {}, requestOptions)
      await reloadStructuredPageWorkspace(savedPage?.key ?? pageEditorState.activeKey)
      setPageFeedback(`Saved changes to ${savedPage?.navLabel || savedPage?.key || pageEditorState.activeKey}.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to save the structured page.')
    }
  }

  async function handleResetStructuredPage() {
    if (!pageEditorState.activeKey) {
      return
    }

    if (!window.confirm('Restore this structured page document to the generated baseline?')) {
      return
    }

    try {
      setPageSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      await resetAdminStructuredPageContent(pageEditorState.activeKey, requestOptions)
      await reloadStructuredPageWorkspace(pageEditorState.activeKey)
      setPageFeedback(`Restored ${pageEditorState.activeKey} to the generated baseline.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to restore the structured page.')
    }
  }

  const properties = workspaceState.properties ?? []
  const structuredPages = pageWorkspaceState.pages ?? []
  const selectedStructuredPage =
    structuredPages.find((page) => page.key === pageEditorState.activeKey) ?? structuredPages[0] ?? null
  const propertySaveEnabled = propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user))
  const propertyPreviewModel = buildPropertyPreviewModel(formState)
  const charterSaveEnabled = charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user))
  const siteContentSaveEnabled = siteContentEditingEnabled && Boolean(authState.user)

  return (
    <article className="admin-page">
      <section className="page-section admin-header">
        <div className="eyebrow">Admin</div>
        <h1>Content workspace</h1>
        <p>
          This route is intentionally hidden from the public navigation. Use it to edit live content in
          focused sections instead of working directly in Firebase.
        </p>

        <div className="admin-tab-row">
          <AdminTabButton
            active={activeTab === 'site-shell'}
            detail="Header, footer, contact"
            label="Header & Footer"
            onClick={() => setActiveTab('site-shell')}
          />
          <AdminTabButton
            active={activeTab === 'pages'}
            detail="Homepage and inner pages"
            label="Page Content"
            onClick={() => setActiveTab('pages')}
          />
          <AdminTabButton
            active={activeTab === 'properties'}
            detail="Rental listings"
            label="Properties"
            onClick={() => setActiveTab('properties')}
          />
          <AdminTabButton
            active={activeTab === 'charters'}
            detail="Boat listings"
            label="Charters"
            onClick={() => setActiveTab('charters')}
          />
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
                Firebase client configuration is missing. Fill in the `VITE_FIREBASE_*` values before using
                Firebase-backed editing.
              </p>
            ) : null}

            {authState.status === 'loading' ? <p className="admin-note">Checking Firebase sign-in state...</p> : null}

            {authState.user ? (
              <p className="admin-note">
                Signed in as <strong>{authState.user.email}</strong>. Saves and resets for Firebase-backed
                collections are enabled.
              </p>
            ) : null}

            {authState.status === 'signed-out' && adminAutoLoginEnabled && (autoLoginStatus === 'pending' || autoLoginStatus === 'saving') ? (
              <p className="admin-note">Automatic localhost sign-in is enabled for this admin workspace.</p>
            ) : null}

            {authState.status === 'signed-out' &&
            (!adminAutoLoginEnabled || autoLoginStatus === 'error' || autoLoginStatus === 'success' || autoLoginStatus === 'manual') ? (
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
        <div className="admin-panel-stack">
          {activeTab === 'site-shell' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Header & Footer</div>
                  <h2>Edit the site-wide content visitors see on every page</h2>
                </div>
                <div className="admin-inline-actions">
                  <button className="button-link button-link--ghost admin-action" type="button" onClick={loadCurrentSiteShellIntoEditor}>
                    Refresh
                  </button>
                  {siteContentEditingEnabled ? (
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={handleResetSiteShell}>
                      Reset changes
                    </button>
                  ) : null}
                </div>
              </div>

              {!siteContentEditingEnabled ? (
                <p className="admin-note">Header and footer editing is not available in the current content mode.</p>
              ) : null}

              {siteContentEditingEnabled && !authState.user ? (
                <p className="admin-note">Sign in before saving changes.</p>
              ) : null}

              {siteShellWorkspaceState.status === 'error' ? <p className="admin-empty">{siteShellWorkspaceState.message}</p> : null}

              <div className="admin-editor">
                <div className="admin-editor-header">
                  <div>
                    <div className="eyebrow">Global Content</div>
                    <h3>Header, footer, and contact details</h3>
                  </div>
                </div>

                {siteShellFeedback ? (
                  <p className={`admin-feedback admin-feedback--${siteShellSaveStatus}`}>{siteShellFeedback}</p>
                ) : null}

                {siteShellWorkspaceState.status === 'loading' ? (
                  <p className="admin-empty">Loading header and footer content...</p>
                ) : (
                  <form className="admin-form" onSubmit={handleSiteShellSubmit}>
                    <p className="admin-note">Edit the live words, links, and images below. Site structure is fixed.</p>
                    <AdminDocumentEditor
                      value={siteShellDraft}
                      onChange={setSiteShellDraft}
                      disabled={!siteContentSaveEnabled}
                      hiddenKeys={SITE_SHELL_HIDDEN_KEYS}
                      hiddenPaths={SITE_SHELL_HIDDEN_PATHS}
                      labelOverrides={CONTENT_LABEL_OVERRIDES}
                      allowStructureChanges={false}
                      presentation="content"
                    />

                    <div className="admin-form-actions">
                      <button
                        className="button-link button-link--primary admin-submit"
                        type="submit"
                        disabled={!siteContentSaveEnabled || siteShellSaveStatus === 'saving'}
                      >
                        {siteShellSaveStatus === 'saving' ? 'Saving...' : 'Save changes'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'pages' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Page Content</div>
                  <h2>Edit the copy, links, and images on each page</h2>
                </div>
                {selectedStructuredPage ? (
                  <div className="admin-inline-actions">
                    <button
                      className="button-link button-link--ghost admin-action"
                      type="button"
                      onClick={() => loadStructuredPageIntoEditor(selectedStructuredPage.key)}
                    >
                      Refresh
                    </button>
                    {siteContentEditingEnabled ? (
                      <button
                        className="button-link button-link--ghost admin-action"
                        type="button"
                        onClick={handleResetStructuredPage}
                      >
                        Reset changes
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {!siteContentEditingEnabled ? (
                <p className="admin-note">Page editing is not available in the current content mode.</p>
              ) : null}

              {siteContentEditingEnabled && !authState.user ? (
                <p className="admin-note">Sign in before saving changes.</p>
              ) : null}

              {pageWorkspaceState.status === 'error' ? <p className="admin-empty">{pageWorkspaceState.message}</p> : null}

              <div className="admin-property-grid">
                <div className="admin-property-list">
                  {pageWorkspaceState.status === 'loading' ? <p className="admin-empty">Loading structured pages...</p> : null}

                  {pageWorkspaceState.status === 'ready' && structuredPages.length === 0 ? (
                    <p className="admin-empty">No structured pages are available yet.</p>
                  ) : null}

                  {structuredPages.map((page) => (
                    <PageListItem
                      active={pageEditorState.activeKey === page.key}
                      key={page.key}
                      page={page}
                      onSelect={handleSelectStructuredPage}
                    />
                  ))}
                </div>

                <div className="admin-editor">
                  <div className="admin-editor-header">
                    <div>
                      <div className="eyebrow">Selected Page</div>
                      <h3>{repairSnapshotText(selectedStructuredPage?.label || 'Select a page')}</h3>
                    </div>
                    {selectedStructuredPage?.path ? (
                      <Link className="button-link button-link--ghost admin-action" to={selectedStructuredPage.path}>
                        Open public route
                      </Link>
                    ) : null}
                  </div>

                  <p className="admin-note">Edit only the content visitors see on this page.</p>

                  {pageFeedback ? <p className={`admin-feedback admin-feedback--${pageSaveStatus}`}>{pageFeedback}</p> : null}

                  {pageEditorState.status === 'loading' ? <p className="admin-empty">Loading structured page content...</p> : null}

                  {pageEditorState.status !== 'loading' && selectedStructuredPage ? (
                    <form className="admin-form" onSubmit={handleStructuredPageSubmit}>
                      <p className="admin-note">Edit the page copy and images below. Page structure is fixed for this site.</p>
                      <AdminStructuredPageEditor
                        disabled={!siteContentSaveEnabled}
                        page={pageEditorState.draft}
                        onChange={(updater) =>
                          setPageEditorState((current) => ({
                            ...current,
                            draft: typeof updater === 'function' ? updater(current.draft) : updater,
                          }))
                        }
                      />

                      <div className="admin-form-actions">
                        <button
                        className="button-link button-link--primary admin-submit"
                        type="submit"
                        disabled={!siteContentSaveEnabled || pageSaveStatus === 'saving'}
                      >
                        {pageSaveStatus === 'saving' ? 'Saving...' : 'Save changes'}
                      </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'properties' ? (
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
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={handleResetLocalEdits}>
                      {propertyUsesFirebase ? 'Restore Firebase catalog' : 'Reset local edits'}
                    </button>
                  ) : null}
                </div>
              </div>

              {!propertyEditingEnabled ? (
                <p className="admin-note">
                  Property editing is read only in the current mode. Set `VITE_PROPERTY_DATA_SOURCE` to `mock`
                  for browser-local drafts or `firebase` for shared live editing.
                </p>
              ) : null}

              {propertyUsesFirebase && !authState.user ? (
                <p className="admin-note">
                  Property saves are routed through Firebase-backed admin endpoints and require a signed-in
                  Firebase user.
                </p>
              ) : null}

              {workspaceState.status === 'error' ? <p className="admin-empty">{workspaceState.message}</p> : null}

              <div className="admin-property-grid">
                <div className="admin-property-list">
                  {workspaceState.status === 'loading' ? <p className="admin-empty">Loading property catalog...</p> : null}

                  {workspaceState.status === 'ready' && properties.length === 0 ? (
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

                  <div className="admin-editor-workspace">
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
                          <div>
                            <h4>House images</h4>
                            <p className="admin-note">These images power the property gallery shown on the public house page.</p>
                          </div>
                          <button className="button-link button-link--ghost admin-action" type="button" onClick={addGalleryImage}>
                            Add image
                          </button>
                        </div>

                        <div className="admin-image-grid">
                          {formState.galleryImages.length === 0 ? (
                            <p className="admin-empty">No gallery images yet. Add the full house gallery here.</p>
                          ) : null}

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
                                <span>{index === 0 ? 'First thumbnail in the public gallery' : 'Shown in the public gallery strip'}</span>
                              </div>

                              <label className="admin-field admin-field--wide">
                                <span>Image URL</span>
                                <input
                                  type="url"
                                  value={image.url}
                                  onChange={(event) => updateGalleryImage(image.id, 'url', event.target.value)}
                                  disabled={!propertySaveEnabled}
                                />
                              </label>

                              <label className="admin-field">
                                <span>Alt text</span>
                                <input
                                  type="text"
                                  value={image.alt}
                                  onChange={(event) => updateGalleryImage(image.id, 'alt', event.target.value)}
                                  disabled={!propertySaveEnabled}
                                />
                              </label>

                              <label className="admin-field">
                                <span>Title</span>
                                <input
                                  type="text"
                                  value={image.title}
                                  onChange={(event) => updateGalleryImage(image.id, 'title', event.target.value)}
                                  disabled={!propertySaveEnabled}
                                />
                              </label>

                              <div className="admin-inline-actions">
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  type="button"
                                  onClick={() => moveGalleryImage(image.id, -1)}
                                  disabled={!propertySaveEnabled || index === 0}
                                >
                                  Move earlier
                                </button>
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  type="button"
                                  onClick={() => moveGalleryImage(image.id, 1)}
                                  disabled={!propertySaveEnabled || index === formState.galleryImages.length - 1}
                                >
                                  Move later
                                </button>
                                <button
                                  className="button-link button-link--ghost admin-action"
                                  type="button"
                                  onClick={() => removeGalleryImage(image.id)}
                                  disabled={!propertySaveEnabled}
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

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
                        <button
                          className="button-link button-link--primary admin-submit"
                          type="submit"
                          disabled={!propertySaveEnabled || saveStatus === 'saving'}
                        >
                          {saveStatus === 'saving' ? 'Saving...' : editorState.mode === 'create' ? 'Create property' : 'Save property'}
                        </button>
                        <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateForm}>
                          Clear form
                        </button>
                      </div>
                    </form>

                    <div className="admin-live-preview-column">
                      <AdminPropertyPreview
                        key={[
                          propertyPreviewModel.slug,
                          propertyPreviewModel.heroImage?.url,
                          ...propertyPreviewModel.gallery.map((image) => image.url),
                        ]
                          .filter(Boolean)
                          .join('|')}
                        property={propertyPreviewModel}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === 'charters' ? (
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
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={handleResetCharterEdits}>
                      {charterUsesFirebase ? 'Restore Firebase catalog' : 'Reset local edits'}
                    </button>
                  ) : null}
                </div>
              </div>

              {!charterEditingEnabled ? (
                <p className="admin-note">
                  Charter editing is read only in the current mode. Set `VITE_CHARTER_DATA_SOURCE` to `mock`
                  for browser-local drafts or `firebase` for shared live editing.
                </p>
              ) : null}

              {charterUsesFirebase && !authState.user ? (
                <p className="admin-note">
                  Charter saves are routed through Firebase-backed admin endpoints and require a signed-in
                  Firebase user.
                </p>
              ) : null}

              {charterWorkspaceState.status === 'error' ? <p className="admin-empty">{charterWorkspaceState.message}</p> : null}

              <div className="admin-property-grid">
                <div className="admin-property-list">
                  {charterWorkspaceState.status === 'loading' ? <p className="admin-empty">Loading charter catalog...</p> : null}

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
                      <div className="eyebrow">{charterEditorState.mode === 'create' ? 'New charter' : 'Editing charter'}</div>
                      <h3>
                        {charterEditorState.mode === 'create'
                          ? 'Create a charter draft'
                          : repairSnapshotText(charterFormState.name)}
                      </h3>
                    </div>
                    {charterEditorState.mode === 'edit' && charterEditorState.activeSlug ? (
                      <Link className="button-link button-link--ghost admin-action" to={`/charter-boat-rentals/${charterEditorState.activeSlug}`}>
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
                      <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateCharterForm}>
                        Clear form
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </article>
  )
}
