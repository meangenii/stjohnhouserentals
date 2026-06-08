import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAdminAutoLoginCredentials, getAdminIdToken, observeAdminUser, signInAdmin, signInAdminWithGoogle, signOutAdmin } from '../lib/adminAuth'
import { AdminPageEditorCanvas, AdminSiteShellPreview } from '../components/AdminPagePreview'
import { AdminPropertyPreview } from '../components/AdminPropertyPreview'
import { AdminCharterEditorPreview } from '../components/AdminCharterEditorPreview'
import { AdminMediaManager } from '../components/AdminMediaManager'
import { AdminSiteShellEditor } from '../components/AdminSiteShellEditor'
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
  listAllProperties,
  resetAdminProperties,
  saveAdminProperty,
} from '../lib/propertyRepository'
import { DEFAULT_PROPERTY_TEMPLATE_VARIANT } from '../lib/propertyTemplateVariants'
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

function makeToken() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function jsonSnapshot(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
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

function readAmenityNodeText(node) {
  if (!node) {
    return ''
  }

  if (node.nodeType === 3) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== 1) {
    return ''
  }

  if (node.tagName === 'BR') {
    return '\n'
  }

  return Array.from(node.childNodes)
    .map((childNode) => readAmenityNodeText(childNode))
    .join('')
}

function parseAmenityTextLines(value = '') {
  return String(value ?? '')
    .split(/\r?\n+/)
    .map((entry) => repairSnapshotText(entry).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function normalizeAmenityGroup(group = {}) {
  return {
    title: repairSnapshotText(group.title ?? '').trim(),
    items: Array.isArray(group.items)
      ? group.items.map((item) => repairSnapshotText(item).trim()).filter(Boolean)
      : [],
  }
}

function parseAmenityGroupsFromHtml(html = '') {
  const markup = String(html ?? '').trim()

  if (!markup || typeof DOMParser !== 'function') {
    return []
  }

  const documentNode = new DOMParser().parseFromString(`<div>${markup}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return []
  }

  const groups = []
  let currentGroup = null

  const startGroup = (title = '') => {
    const group = normalizeAmenityGroup({ title, items: [] })
    groups.push(group)
    currentGroup = group
    return group
  }

  const ensureGroup = () => currentGroup ?? startGroup(groups.length === 0 ? 'Amenities' : '')

  Array.from(root.children).forEach((element) => {
    if (!element?.tagName) {
      return
    }

    if (/^H[1-6]$/i.test(element.tagName)) {
      const title = repairSnapshotText(element.textContent ?? '').replace(/\s+/g, ' ').trim()

      if (title) {
        startGroup(title)
      }

      return
    }

    if (/^(UL|OL)$/i.test(element.tagName)) {
      const items = Array.from(element.children)
        .filter((child) => child.tagName === 'LI')
        .map((child) => repairSnapshotText(child.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)

      if (items.length > 0) {
        ensureGroup().items.push(...items)
      }

      return
    }

    if (element.tagName !== 'P') {
      return
    }

    const lines = parseAmenityTextLines(readAmenityNodeText(element))

    if (lines.length === 0) {
      return
    }

    const firstElementChild = element.firstElementChild
    const strongLead =
      firstElementChild && /^(STRONG|B)$/i.test(firstElementChild.tagName)
        ? repairSnapshotText(firstElementChild.textContent ?? '').replace(/\s+/g, ' ').trim()
        : ''

    if (strongLead) {
      if (lines.length === 1 && lines[0] === strongLead) {
        startGroup(strongLead)
        return
      }

      if (lines[0] === strongLead || lines[0].startsWith(`${strongLead}:`) || lines[0].startsWith(`${strongLead} -`)) {
        const group = startGroup(strongLead)
        const remainder = lines[0]
          .slice(strongLead.length)
          .replace(/^[:\-\u2013\u2014]\s*/, '')
          .trim()
        const items = [remainder, ...lines.slice(1)].filter(Boolean)

        if (items.length > 0) {
          group.items.push(...items)
        }

        return
      }
    }

    ensureGroup().items.push(...lines)
  })

  return groups.filter((group) => group.title || group.items.length)
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
    active: true,
    templateVariant: DEFAULT_PROPERTY_TEMPLATE_VARIANT,
    bedrooms: '1',
    bathrooms: '1',
    maxGuests: '2',
    location: 'St. John, USVI',
    price: '',
    shortDescription: '',
    descriptionHtml: '',
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

  const parsedAmenityGroups = parseAmenityGroupsFromHtml(property.amenitiesHtml ?? '')

  if (parsedAmenityGroups.length > 0) {
    return parsedAmenityGroups.map((group) => createAmenityEditor(group))
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
    active: property.active !== false,
    templateVariant: property.templateVariant ?? DEFAULT_PROPERTY_TEMPLATE_VARIANT,
    bedrooms: String(property.bedrooms ?? 0),
    bathrooms: String(property.bathrooms ?? 0),
    maxGuests: String(property.maxGuests ?? 0),
    location: repairSnapshotText(property.location ?? 'St. John, USVI'),
    price: repairSnapshotText(property.price ?? ''),
    shortDescription: repairSnapshotText(property.shortDescription ?? ''),
    descriptionHtml: String(property.descriptionHtml ?? '').trim() || paragraphListToHtml(property.description ?? []),
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
    active: formState.active,
    templateVariant: formState.templateVariant,
    bedrooms: Number(formState.bedrooms) || 0,
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    descriptionHtml: String(formState.descriptionHtml ?? '').trim(),
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

      if (items.length > 0) {
        lines.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
      }

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
    active: formState.active,
    templateVariant: formState.templateVariant,
    bedrooms,
    bedroomLabel: bedrooms > 0 ? `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}` : '',
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    descriptionHtml: String(formState.descriptionHtml ?? '').trim(),
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

function buildCharterPreviewModel(formState) {
  const descriptionParagraphs = parseParagraphList(formState.descriptionText)

  return {
    slug: repairSnapshotText(formState.slug).trim(),
    name: repairSnapshotText(formState.name).trim() || 'Untitled Charter',
    active: formState.active,
    shortDescription: repairSnapshotText(formState.shortDescription).trim(),
    phoneNumber: repairSnapshotText(formState.phoneNumber).trim(),
    email: repairSnapshotText(formState.email).trim(),
    website: repairSnapshotText(formState.website).trim(),
    heroImage: formState.heroImageUrl.trim()
      ? {
          url: formState.heroImageUrl.trim(),
          alt: repairSnapshotText(formState.heroImageAlt).trim(),
          title: repairSnapshotText(formState.name).trim(),
        }
      : null,
    contentHtml: paragraphListToHtml(descriptionParagraphs),
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

function formatPageSelectorLabel(page) {
  const title = repairSnapshotText(page?.title || 'Untitled page')
  const label = repairSnapshotText(page?.label || page?.key || 'Untitled page')
  const path = String(page?.path ?? '').trim()

  return [label, title && title !== label ? title : '', path].filter(Boolean).join(' | ')
}

function formatPropertySelectorLabel(property) {
  const name = repairSnapshotText(property?.name || 'Untitled property')
  const visibility = property?.active !== false ? 'Active' : 'Hidden'
  const details = [property?.bedroomLabel, property?.maxGuests ? `${property.maxGuests} guests` : '', repairSnapshotText(property?.location || '')]
    .filter(Boolean)
    .join(' | ')

  return [name, visibility, details].filter(Boolean).join(' | ')
}

function formatCharterSelectorLabel(charter) {
  const name = repairSnapshotText(charter?.name || 'Untitled charter')
  return `${name} | ${charter?.active ? 'Active' : 'Hidden'}`
}

function AdminTabButton({ active, label, onClick }) {
  return (
    <button
      className={`admin-tab-button ${active ? 'admin-tab-button--active' : ''}`.trim()}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function AdminPreviewDeviceButton({ active, label, onClick }) {
  return (
    <button
      className={`button-link button-link--ghost admin-preview-device ${active ? 'admin-preview-device--active' : ''}`.trim()}
      type="button"
      onClick={onClick}
    >
      {label}
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
  const [galleryEditorExpanded, setGalleryEditorExpanded] = useState(false)
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
  const [siteShellPreviewDevice, setSiteShellPreviewDevice] = useState('desktop')

  const [pageWorkspaceState, setPageWorkspaceState] = useState(() => ({
    status: 'loading',
    pages: readStructuredPageSummaries(),
    message: '',
  }))
  const [pageEditorState, setPageEditorState] = useState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
  const [pageFeedback, setPageFeedback] = useState('')
  const [pageSaveStatus, setPageSaveStatus] = useState('idle')
  const [pagePreviewDevice, setPagePreviewDevice] = useState('desktop')

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
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  const siteShellDirty = jsonSnapshot(siteShellDraft) !== jsonSnapshot(siteShellWorkspaceState.shell)
  const pageDirty = jsonSnapshot(pageEditorState.draft) !== jsonSnapshot(pageEditorState.savedDraft)

  useEffect(() => {
    if (requiresAdminSignIn && authState.status === 'loading') {
      return undefined
    }

    let cancelled = false

    async function loadWorkspace() {
      try {
        let requestOptions = {}

        if (propertyUsesFirebase && authState.user) {
          const authToken = await getAdminIdToken()

          if (authToken) {
            requestOptions = { authToken }
          }
        }

        const properties = await listAllProperties(requestOptions)

        if (cancelled) {
          return
        }

        setWorkspaceState({ status: 'ready', properties })

        if (properties.length > 0) {
          setEditorState({ mode: 'edit', activeSlug: properties[0].slug })
          setFormState(createFormState(properties[0]))
          setGalleryEditorExpanded(false)
          return
        }

        setEditorState({ mode: 'create', activeSlug: '' })
        setFormState(createEmptyFormState())
        setGalleryEditorExpanded(false)
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
  }, [authState.status, authState.user, propertyUsesFirebase, requiresAdminSignIn])

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
          setPageEditorState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
          return
        }

        const page = await fetchAdminStructuredPageContent(firstPage.key)

        if (cancelled) {
          return
        }

        setPageEditorState({
          status: 'ready',
          activeKey: firstPage.key,
          draft: page ?? {},
          savedDraft: page ?? {},
        })
      } catch (error) {
        if (!cancelled) {
          setPageWorkspaceState({
            status: 'error',
            pages: readStructuredPageSummaries(),
            message: error instanceof Error ? error.message : 'Unable to load structured pages.',
          })
          setPageEditorState({ status: 'error', activeKey: '', draft: null, savedDraft: null })
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

      if (user) {
        setAuthPanelOpen(false)
      }
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
        setAuthFeedback('Signing in automatically for local development…')
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
        setAuthFeedback('Signed in automatically.')
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
        setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in automatically.')
        setAuthFeedbackStatus('error')
        setAutoLoginStatus('error')
        setAuthPanelOpen(true)
      }
    }

    signInAutomatically()

    return () => {
      cancelled = true
    }
  }, [adminAutoLoginCredentials, authState.status, authState.user, requiresAdminSignIn])

  useEffect(() => {
    if (!pageDirty && !siteShellDirty) {
      return undefined
    }

    function handleBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [pageDirty, siteShellDirty])

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
      setAuthFeedback('Signed in successfully.')
      setAuthFeedbackStatus('idle')
      setAuthPanelOpen(false)
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in.')
      setAuthFeedbackStatus('error')
      setAuthPanelOpen(true)
    }
  }

  async function handleGoogleSignIn() {
    try {
      setAuthFeedbackStatus('saving')
      setAuthFeedback('Opening Google sign-in…')
      await signInAdminWithGoogle()
      setAuthFeedback('Signed in successfully.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in with Google.')
      setAuthFeedbackStatus('error')
      setAuthPanelOpen(true)
    }
  }

  async function handleAdminSignOut() {
    try {
      setAuthFeedbackStatus('saving')
      setAutoLoginStatus(adminAutoLoginEnabled ? 'manual' : 'disabled')
      await signOutAdmin()
      setAuthFeedback('Signed out.')
      setAuthFeedbackStatus('idle')
      setAuthPanelOpen(false)
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign out.')
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
        savedDraft: page ?? {},
      })
      setPageFeedback('')
      setPageSaveStatus('idle')
    } catch (error) {
      setPageEditorState({ status: 'error', activeKey: pageKey, draft: null, savedDraft: null })
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
      setPageEditorState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
      return null
    }

    const page = await fetchAdminStructuredPageContent(nextKey)

    setPageEditorState({
      status: 'ready',
      activeKey: nextKey,
      draft: page ?? pages.find((entry) => entry.key === nextKey) ?? {},
      savedDraft: page ?? pages.find((entry) => entry.key === nextKey) ?? {},
    })

    return page
  }

  function openCreateForm() {
    setEditorState({ mode: 'create', activeSlug: '' })
    setFormState(createEmptyFormState())
    setGalleryEditorExpanded(false)
    setFeedback('')
  }

  function openEditForm(property) {
    setEditorState({ mode: 'edit', activeSlug: property.slug })
    setFormState(createFormState(property))
    setGalleryEditorExpanded(false)
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

  async function persistPropertyForm(nextFormState, successMessage = '') {
    try {
      setSaveStatus('saving')
      const editorMode = editorState.mode
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      const savedProperty = await saveAdminProperty(
        buildPropertyDraft(nextFormState),
        editorMode === 'edit' ? nextFormState.originalSlug : '',
        requestOptions,
      )
      const properties = await listAllProperties(requestOptions)
      setWorkspaceState({ status: 'ready', properties })
      setEditorState({ mode: 'edit', activeSlug: savedProperty.slug })
      setFormState(createFormState(savedProperty))
      setFeedback(
        successMessage ||
          (editorMode === 'create'
            ? propertyUsesFirebase
              ? `Added ${savedProperty.name} to Firebase-backed property content.`
              : `Added ${savedProperty.name} to the browser-local property catalog.`
            : `Saved changes to ${savedProperty.name}.`),
      )
      setSaveStatus('idle')
      return savedProperty
    } catch (error) {
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to save property changes.')
      return null
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    await persistPropertyForm(formState)
  }

  async function handlePropertyVisibilityToggle() {
    const nextActive = formState.active !== false ? false : true

    if (editorState.mode !== 'edit') {
      setFormState((currentState) => ({
        ...currentState,
        active: nextActive,
      }))
      setSaveStatus('idle')
      setFeedback(`This draft will be created as ${nextActive ? 'published' : 'unpublished'}.`)
      return
    }

    await persistPropertyForm(
      {
        ...formState,
        active: nextActive,
      },
      `${formState.name || 'This property'} is now ${nextActive ? 'published' : 'unpublished'} on the site.`,
    )
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

      const properties = await listAllProperties(requestOptions)
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
    if (pageDirty && pageEditorState.activeKey && page?.key !== pageEditorState.activeKey) {
      const shouldDiscardChanges = window.confirm('You have unsaved page edits. Open another page and discard those changes?')

      if (!shouldDiscardChanges) {
        return
      }
    }

    await loadStructuredPageIntoEditor(page?.key ?? '')
  }

  async function handleStructuredPageSelectionChange(event) {
    const selectedKey = String(event.target.value ?? '').trim()
    const selectedPage = structuredPages.find((page) => page.key === selectedKey)
    await handleSelectStructuredPage(selectedPage ?? { key: selectedKey })
  }

  function handlePropertySelectionChange(event) {
    const selectedSlug = String(event.target.value ?? '').trim()

    if (!selectedSlug) {
      openCreateForm()
      return
    }

    const selectedProperty = properties.find((property) => property.slug === selectedSlug)

    if (selectedProperty) {
      openEditForm(selectedProperty)
    }
  }

  function handleCharterSelectionChange(event) {
    const selectedSlug = String(event.target.value ?? '').trim()

    if (!selectedSlug) {
      openCreateCharterForm()
      return
    }

    const selectedCharter = charterWorkspaceState.charters.find((charter) => charter.slug === selectedSlug)

    if (selectedCharter) {
      openEditCharterForm(selectedCharter)
    }
  }

  async function handleReloadSiteShell() {
    if (siteShellDirty) {
      const shouldDiscardChanges = window.confirm('You have unsaved shell edits. Reload the saved version and discard those changes?')

      if (!shouldDiscardChanges) {
        return
      }
    }

    await loadCurrentSiteShellIntoEditor()
  }

  async function handleReloadStructuredPage(pageKey) {
    if (pageDirty) {
      const shouldDiscardChanges = window.confirm('You have unsaved page edits. Reload the saved version and discard those changes?')

      if (!shouldDiscardChanges) {
        return
      }
    }

    await loadStructuredPageIntoEditor(pageKey)
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

    if (!window.confirm('Discard your changes and restore this page to its original content?')) {
      return
    }

    try {
      setPageSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      await resetAdminStructuredPageContent(pageEditorState.activeKey, requestOptions)
      await reloadStructuredPageWorkspace(pageEditorState.activeKey)
      setPageFeedback('Page restored to its original content.')
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to restore the page.')
    }
  }

  const properties = workspaceState.properties ?? []
  const structuredPages = pageWorkspaceState.pages ?? []
  const selectedStructuredPage =
    structuredPages.find((page) => page.key === pageEditorState.activeKey) ?? structuredPages[0] ?? null
  const propertySaveEnabled = propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user))
  const propertyPreviewModel = buildPropertyPreviewModel(formState)
  const charterSaveEnabled = charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user))
  const charterPreviewModel = buildCharterPreviewModel(charterFormState)
  const siteContentSaveEnabled = siteContentEditingEnabled && Boolean(authState.user)
  const authBadgeTone =
    authState.user
      ? 'success'
      : authState.status === 'loading' || autoLoginStatus === 'pending' || autoLoginStatus === 'saving'
        ? 'loading'
        : authState.status === 'unconfigured'
          ? 'muted'
          : authFeedbackStatus === 'error' || autoLoginStatus === 'error'
            ? 'warning'
            : 'default'
  const authBadgeLabel =
    authState.user
      ? 'Signed in'
      : authState.status === 'loading' || autoLoginStatus === 'pending' || autoLoginStatus === 'saving'
        ? 'Checking sign-in'
        : authState.status === 'unconfigured'
          ? 'Editing locked'
          : authFeedbackStatus === 'error' || autoLoginStatus === 'error'
            ? 'Sign-in issue'
            : 'Sign in'
  const authBadgeDetail = authState.user?.email ?? ''
  const authToggleLabel = authPanelOpen ? 'Hide sign-in' : authBadgeLabel

  return (
    <article className="admin-page">
      <section className="page-section admin-header">
        <div className="admin-header-bar">
          <div>
            <div className="eyebrow">Admin</div>
            <h1>Content workspace</h1>
          </div>

          {requiresAdminSignIn ? (
            <div className="admin-auth-summary">
              {authState.user ? (
                <div className={`admin-auth-badge admin-auth-badge--${authBadgeTone}`.trim()}>
                  <span>{authBadgeLabel}</span>
                  {authBadgeDetail ? <strong>{authBadgeDetail}</strong> : null}
                </div>
              ) : (
                <button
                  aria-expanded={authPanelOpen}
                  className={`admin-auth-badge admin-auth-badge--${authBadgeTone}`.trim()}
                  type="button"
                  onClick={() => setAuthPanelOpen((currentState) => !currentState)}
                >
                  <span>{authToggleLabel}</span>
                  {authBadgeDetail ? <strong>{authBadgeDetail}</strong> : null}
                </button>
              )}

              {authState.user ? (
                <button className="button-link button-link--ghost admin-action" type="button" onClick={handleAdminSignOut}>
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="admin-tab-row">
          <AdminTabButton
            active={activeTab === 'site-shell'}
            label="Header & Footer"
            onClick={() => setActiveTab('site-shell')}
          />
          <AdminTabButton
            active={activeTab === 'pages'}
            label="Page Content"
            onClick={() => setActiveTab('pages')}
          />
          <AdminTabButton
            active={activeTab === 'properties'}
            label="Properties"
            onClick={() => setActiveTab('properties')}
          />
          <AdminTabButton
            active={activeTab === 'charters'}
            label="Charters"
            onClick={() => setActiveTab('charters')}
          />
          <AdminTabButton
            active={activeTab === 'media'}
            label="Media Library"
            onClick={() => setActiveTab('media')}
          />
        </div>

        {requiresAdminSignIn && authPanelOpen && !authState.user ? (
          <div className="admin-auth-panel admin-editor">
            {authFeedback ? <p className={`admin-feedback admin-feedback--${authFeedbackStatus}`}>{authFeedback}</p> : null}

            {authState.status === 'unconfigured' ? (
              <p className="admin-note">
                Live editing is not configured for this environment. Contact your developer to enable it.
              </p>
            ) : null}

            {authState.status === 'loading' ? <p className="admin-note">Checking sign-in status...</p> : null}

            {authState.status === 'signed-out' && adminAutoLoginEnabled && (autoLoginStatus === 'pending' || autoLoginStatus === 'saving') ? (
              <p className="admin-note">Automatic localhost sign-in is enabled for this admin workspace.</p>
            ) : null}

            {authState.status === 'signed-out' &&
            (!adminAutoLoginEnabled || autoLoginStatus === 'error' || autoLoginStatus === 'success' || autoLoginStatus === 'manual') ? (
              <div className="admin-sign-in-options">
                <div className="admin-form-actions">
                  <button className="button-link button-link--primary admin-submit" type="button" onClick={handleGoogleSignIn}>
                    Sign in with Google
                  </button>
                </div>

                <div className="admin-sign-in-divider"><span>or use email and password</span></div>

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
                    <button className="button-link button-link--ghost admin-submit" type="submit">
                      Sign in with email
                    </button>
                  </div>
                </form>
              </div>
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
                  <h2>Header & Footer</h2>
                </div>
                <div className="admin-inline-actions">
                  <button className="button-link button-link--ghost admin-action" type="button" onClick={handleReloadSiteShell}>
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

              {siteShellWorkspaceState.status === 'error' ? <p className="admin-empty">{siteShellWorkspaceState.message}</p> : null}

              <div className="admin-editor">
                <div className="admin-editor-header">
                  <div>
                    <div className="eyebrow">Global Content</div>
                    <h3>Header, footer, navigation, and contact details</h3>
                  </div>
                </div>

                {siteShellFeedback ? (
                  <p className={`admin-feedback admin-feedback--${siteShellSaveStatus}`}>{siteShellFeedback}</p>
                ) : null}

                {siteShellWorkspaceState.status === 'loading' ? (
                  <p className="admin-empty">Loading header and footer content...</p>
                ) : (
                  <form className="admin-form" onSubmit={handleSiteShellSubmit}>
                    <div className="admin-editor-workspace">
                      <div>
                        <AdminSiteShellEditor
                          value={siteShellDraft}
                          onChange={setSiteShellDraft}
                          disabled={!siteContentSaveEnabled}
                        />

                        <div className="admin-form-actions">
                          <button
                            className="button-link button-link--primary admin-submit"
                            type="submit"
                            disabled={!siteContentSaveEnabled || siteShellSaveStatus === 'saving'}
                          >
                            {siteShellSaveStatus === 'saving' ? 'Saving...' : 'Save shell changes'}
                          </button>
                        </div>
                      </div>

                      <div className="admin-live-preview-column">
                        <div className="admin-preview-panel">
                          <div className="admin-panel-header">
                            <div>
                              <div className="eyebrow">Preview</div>
                              <h3>Header and footer</h3>
                            </div>
                            <div className="admin-inline-actions">
                              <AdminPreviewDeviceButton active={siteShellPreviewDevice === 'desktop'} label="Desktop" onClick={() => setSiteShellPreviewDevice('desktop')} />
                              <AdminPreviewDeviceButton active={siteShellPreviewDevice === 'mobile'} label="Mobile" onClick={() => setSiteShellPreviewDevice('mobile')} />
                            </div>
                          </div>

                          <AdminSiteShellPreview
                            device={siteShellPreviewDevice}
                            siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                          />
                        </div>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'pages' ? (
            <section className="admin-panel">
              {!siteContentEditingEnabled ? (
                <p className="admin-note">Page editing is not available in the current content mode.</p>
              ) : null}

              {pageWorkspaceState.status === 'error' ? <p className="admin-empty">{pageWorkspaceState.message}</p> : null}

              {pageWorkspaceState.status === 'loading' ? <p className="admin-empty">Loading pages...</p> : null}

              {pageWorkspaceState.status === 'ready' && structuredPages.length === 0 ? (
                <p className="admin-empty">No structured pages are available yet.</p>
              ) : null}

              {pageWorkspaceState.status === 'ready' && structuredPages.length > 0 ? (
                <div className="admin-selector-row admin-selector-row--toolbar">
                  <label className="admin-field admin-selector-field">
                    <span className="visually-hidden">Page</span>
                    <select value={pageEditorState.activeKey || ''} onChange={handleStructuredPageSelectionChange}>
                      {structuredPages.map((page) => (
                        <option key={page.key} value={page.key}>
                          {formatPageSelectorLabel(page)}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedStructuredPage ? (
                    <div className="admin-inline-actions">
                      <button
                        className="button-link button-link--ghost admin-action"
                        type="button"
                        onClick={() => handleReloadStructuredPage(selectedStructuredPage.key)}
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
              ) : null}

              <div className="admin-editor admin-editor--page">
                {pageFeedback ? <p className={`admin-feedback admin-feedback--${pageSaveStatus}`}>{pageFeedback}</p> : null}

                {pageEditorState.status === 'loading' ? <p className="admin-empty">Loading structured page content...</p> : null}

                {pageEditorState.status !== 'loading' && selectedStructuredPage ? (
                  <form className="admin-form admin-form--flush" onSubmit={handleStructuredPageSubmit}>
                    <div className="admin-toolbar-row">
                      <div className="admin-inline-actions">
                        {selectedStructuredPage?.path ? (
                          <Link className="button-link button-link--ghost admin-action" to={selectedStructuredPage.path}>
                            View on site
                          </Link>
                        ) : null}
                        <AdminPreviewDeviceButton active={pagePreviewDevice === 'desktop'} label="Desktop" onClick={() => setPagePreviewDevice('desktop')} />
                        <AdminPreviewDeviceButton active={pagePreviewDevice === 'mobile'} label="Mobile" onClick={() => setPagePreviewDevice('mobile')} />
                      </div>
                    </div>

                    <AdminPageEditorCanvas
                      device={pagePreviewDevice}
                      disabled={!siteContentSaveEnabled}
                      onChange={(updater) =>
                        setPageEditorState((current) => ({
                          ...current,
                          draft: typeof updater === 'function' ? updater(current.draft) : updater,
                        }))
                      }
                      page={pageEditorState.draft}
                      pageKey={pageEditorState.activeKey}
                      siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                    />

                    <div className="admin-form-actions">
                      <button
                        className="button-link button-link--primary admin-submit"
                        type="submit"
                        disabled={!siteContentSaveEnabled || pageSaveStatus === 'saving'}
                      >
                        {pageSaveStatus === 'saving' ? 'Saving...' : 'Save page changes'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'properties' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Properties</div>
                  <h2>Properties</h2>
                </div>
                <div className="admin-inline-actions">
                  <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateForm}>
                    New property
                  </button>
                  {propertyEditingEnabled ? (
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={handleResetLocalEdits}>
                      Reset to saved
                    </button>
                  ) : null}
                </div>
              </div>

              {!propertyEditingEnabled ? (
                <p className="admin-note">
                  Property editing is not available in this environment. Contact your developer to enable live editing.
                </p>
              ) : null}

              {workspaceState.status === 'error' ? <p className="admin-empty">{workspaceState.message}</p> : null}

              {workspaceState.status === 'loading' ? <p className="admin-empty">Loading property catalog...</p> : null}

              {workspaceState.status === 'ready' && properties.length === 0 ? (
                <p className="admin-empty">No properties are available yet. Start with a new draft.</p>
              ) : null}

              {workspaceState.status === 'ready' ? (
                <div className="admin-selector-row">
                  <label className="admin-field admin-selector-field">
                    <span>Property</span>
                    <select value={editorState.mode === 'edit' ? editorState.activeSlug : ''} onChange={handlePropertySelectionChange}>
                      <option value="">Create a new property</option>
                      {properties.map((property) => (
                        <option key={property.slug} value={property.slug}>
                          {formatPropertySelectorLabel(property)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="admin-editor">
                {feedback ? <p className={`admin-feedback admin-feedback--${saveStatus}`}>{feedback}</p> : null}

                <form className="admin-form admin-form--flush" onSubmit={handleSubmit}>
                  <div className="admin-toolbar-row admin-toolbar-row--split">
                    <div className="admin-chip-row admin-chip-row--compact">
                      <span className="admin-chip">{formState.active !== false ? 'Published' : 'Unpublished'}</span>
                    </div>

                    <div className="admin-inline-actions">
                      {editorState.mode === 'edit' && editorState.activeSlug && formState.active !== false ? (
                        <Link className="button-link button-link--ghost admin-action" to={`/rental-properties/${editorState.activeSlug}`}>
                          View on site
                        </Link>
                      ) : null}
                      <button
                        className="button-link button-link--ghost admin-action"
                        disabled={!propertySaveEnabled || saveStatus === 'saving'}
                        type="button"
                        onClick={handlePropertyVisibilityToggle}
                      >
                        {editorState.mode === 'edit'
                          ? formState.active !== false
                            ? 'Unpublish property'
                            : 'Publish property'
                          : formState.active !== false
                            ? 'Create as unpublished'
                            : 'Create as published'}
                      </button>
                    </div>
                  </div>

                  <AdminPropertyPreview
                    key={[
                      propertyPreviewModel.slug,
                      propertyPreviewModel.heroImage?.url,
                      ...propertyPreviewModel.gallery.map((image) => image.url),
                    ]
                      .filter(Boolean)
                      .join('|')}
                    disabled={!propertySaveEnabled}
                    editable
                    formState={formState}
                    galleryEditorExpanded={galleryEditorExpanded}
                    onAddAmenityGroup={addAmenityGroup}
                    onAddGalleryImage={addGalleryImage}
                    onAddReviewEntry={addReviewEntry}
                    onAmenityGroupChange={updateAmenityGroup}
                    onFieldChange={updateFormState}
                    onGalleryImageChange={updateGalleryImage}
                    onMoveGalleryImage={moveGalleryImage}
                    onToggleGalleryEditor={() => setGalleryEditorExpanded((currentState) => !currentState)}
                    onRemoveAmenityGroup={removeAmenityGroup}
                    onRemoveGalleryImage={removeGalleryImage}
                    onRemoveReviewEntry={removeReviewEntry}
                    onReviewEntryChange={updateReviewEntry}
                    property={propertyPreviewModel}
                  />

                  <div className="admin-form-actions">
                    <button
                      className="button-link button-link--primary admin-submit"
                      type="submit"
                      disabled={!propertySaveEnabled || saveStatus === 'saving'}
                    >
                      {saveStatus === 'saving' ? 'Saving...' : editorState.mode === 'create' ? 'Create property' : 'Save property'}
                    </button>
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateForm}>
                      New property
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {activeTab === 'charters' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Charter Boats</div>
                  <h2>Charters</h2>
                </div>
                <div className="admin-inline-actions">
                  <button className="button-link button-link--ghost admin-action" type="button" onClick={openCreateCharterForm}>
                    New charter
                  </button>
                  {charterEditingEnabled ? (
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={handleResetCharterEdits}>
                      Reset to saved
                    </button>
                  ) : null}
                </div>
              </div>

              {!charterEditingEnabled ? (
                <p className="admin-note">
                  Charter editing is not available in this environment. Contact your developer to enable live editing.
                </p>
              ) : null}

              {charterWorkspaceState.status === 'error' ? <p className="admin-empty">{charterWorkspaceState.message}</p> : null}

              {charterWorkspaceState.status === 'loading' ? <p className="admin-empty">Loading charter catalog...</p> : null}

              {charterWorkspaceState.status === 'ready' && charterWorkspaceState.charters.length === 0 ? (
                <p className="admin-empty">No charters available yet. Start with a new draft.</p>
              ) : null}

              {charterWorkspaceState.status === 'ready' ? (
                <div className="admin-selector-row">
                  <label className="admin-field admin-selector-field">
                    <span>Charter</span>
                    <select value={charterEditorState.mode === 'edit' ? charterEditorState.activeSlug : ''} onChange={handleCharterSelectionChange}>
                      <option value="">Create a new charter</option>
                      {charterWorkspaceState.charters.map((charter) => (
                        <option key={charter.slug} value={charter.slug}>
                          {formatCharterSelectorLabel(charter)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="admin-editor">
                {charterFeedback ? (
                  <p className={`admin-feedback admin-feedback--${charterSaveStatus}`}>{charterFeedback}</p>
                ) : null}

                <form className="admin-form admin-form--flush" onSubmit={handleCharterSubmit}>
                    {charterEditorState.mode === 'edit' && charterEditorState.activeSlug ? (
                      <div className="admin-toolbar-row">
                        <div className="admin-inline-actions">
                          <Link className="button-link button-link--ghost admin-action" to={`/charter-boat-rentals/${charterEditorState.activeSlug}`}>
                            View on site
                          </Link>
                        </div>
                      </div>
                    ) : null}

                    <AdminCharterEditorPreview
                      charter={charterPreviewModel}
                      disabled={!charterSaveEnabled}
                      formState={charterFormState}
                      onFieldChange={updateCharterFormState}
                    />

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
                        New charter
                      </button>
                    </div>
                </form>
              </div>
            </section>
          ) : null}

          {activeTab === 'media' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Media</div>
                  <h2>Media Library</h2>
                </div>
              </div>

              <p className="admin-note">
                Browse managed Firebase Storage folders, open images, and copy URLs for reuse across pages, properties, and charters.
              </p>

              <div className="admin-editor">
                <AdminMediaManager
                  defaultOpen
                  showToggle={false}
                  title="Media Library"
                />
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </article>
  )
}
