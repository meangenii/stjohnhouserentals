import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminAdvertiseInquiriesPanel } from '../components/AdminAdvertiseInquiriesPanel'
import { getAdminIdToken, observeAdminUser, signInAdminWithGoogle, signOutAdmin } from '../lib/adminAuth'
import { AdminPageEditorCanvas, AdminSiteShellPreview } from '../components/AdminPagePreview'
import { AdminPropertyPreview } from '../components/AdminPropertyPreview'
import { AdminCharterEditorPreview } from '../components/AdminCharterEditorPreview'
import { AdminMediaManager } from '../components/AdminMediaManager'
import { AdminSiteShellEditor } from '../components/AdminSiteShellEditor'
import {
  isCharterEditingEnabled,
  isFirebaseCharterData,
  listAllCharters,
  publishAdminCharter,
  saveAdminCharter,
} from '../lib/charterRepository'
import { isFirebaseConfigured } from '../lib/firebase'
import {
  isFirebasePropertyData,
  isPropertyEditingEnabled,
  listAllProperties,
  publishAdminProperty,
  saveAdminProperty,
} from '../lib/propertyRepository'
import { DEFAULT_PROPERTY_TEMPLATE_VARIANT } from '../lib/propertyTemplateVariants'
import { richTextValueToHtml } from '../lib/richTextValue'
import {
  fetchAdminSiteShellContent,
  fetchAdminStructuredPageContent,
  fetchAdminStructuredPageDirectory,
  isSiteContentEditingEnabled,
  publishAdminSiteShellContent,
  publishAdminStructuredPageContent,
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

function cloneSnapshotValue(value) {
  if (value === undefined) {
    return undefined
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
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
    bookingPhone: '',
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
    bookingPhone: repairSnapshotText(property.booking?.phone ?? ''),
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
      phone: repairSnapshotText(formState.bookingPhone).trim(),
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
        lines.push(`<h4>${richTextValueToHtml(title)}</h4>`)
      }

      if (items.length > 0) {
        lines.push(`<ul>${items.map((item) => `<li>${richTextValueToHtml(item)}</li>`).join('')}</ul>`)
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
        lines.push(`<p>${richTextValueToHtml(quote)}</p>`)
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
      phone: repairSnapshotText(formState.bookingPhone).trim(),
      note: repairSnapshotText(formState.bookingNote).trim(),
    },
  }
}

function buildCharterPreviewModel(formState) {
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
    contentHtml: String(formState.descriptionHtml ?? '').trim(),
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
    descriptionHtml: '',
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
    descriptionHtml: String(charter.contentHtml ?? '').trim(),
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
    contentHtml: String(formState.descriptionHtml ?? '').trim(),
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
  return `${name} | ${charter?.active !== false ? 'Active' : 'Hidden'}`
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

function AdminFloatingSaveButton({
  disabled = false,
  label,
  onReset = null,
  resetDisabled = false,
  resetLabel = 'Reset',
  saveStatus = 'idle',
  showReset = false,
  visible = false,
}) {
  if (!visible && saveStatus !== 'saving' && saveStatus !== 'publishing') {
    return null
  }

  const isBusy = saveStatus === 'saving' || saveStatus === 'publishing'

  return (
    <div className="admin-floating-save">
      {showReset ? (
        <button className="button-link button-link--ghost admin-action" type="button" disabled={resetDisabled || isBusy} onClick={onReset}>
          {resetLabel}
        </button>
      ) : null}
      <button
        className="button-link button-link--primary admin-submit"
        type="submit"
        disabled={disabled || isBusy}
      >
        {saveStatus === 'publishing' ? 'Publishing...' : saveStatus === 'saving' ? 'Saving...' : label}
      </button>
    </div>
  )
}

function hasPendingPublication(publication) {
  return publication?.hasUnpublishedChanges === true
}

function getFeedbackStatusTone(status = 'idle') {
  return status === 'publishing' ? 'saving' : status
}

export function AdminPage() {
  const initialPropertyFormState = createEmptyFormState()
  const initialCharterFormState = createEmptyCharterFormState()
  const [activeTab, setActiveTab] = useState('pages')
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', properties: [] })
  const [formState, setFormState] = useState(initialPropertyFormState)
  const [savedFormState, setSavedFormState] = useState(initialPropertyFormState)
  const [editorState, setEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [galleryEditorExpanded, setGalleryEditorExpanded] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [propertyPublication, setPropertyPublication] = useState(null)
  const propertyEditingEnabled = isPropertyEditingEnabled()
  const propertyUsesFirebase = isFirebasePropertyData()

  const [charterWorkspaceState, setCharterWorkspaceState] = useState({ status: 'loading', charters: [] })
  const [charterFormState, setCharterFormState] = useState(initialCharterFormState)
  const [savedCharterFormState, setSavedCharterFormState] = useState(initialCharterFormState)
  const [charterEditorState, setCharterEditorState] = useState({ mode: 'create', activeSlug: '' })
  const [charterFeedback, setCharterFeedback] = useState('')
  const [charterSaveStatus, setCharterSaveStatus] = useState('idle')
  const [charterPublication, setCharterPublication] = useState(null)
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
  const [siteShellPublication, setSiteShellPublication] = useState(null)
  const [siteShellPreviewDevice, setSiteShellPreviewDevice] = useState('desktop')

  const [pageWorkspaceState, setPageWorkspaceState] = useState(() => ({
    status: 'loading',
    inventory: [],
    pages: [],
    message: '',
  }))
  const [pageEditorState, setPageEditorState] = useState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
  const [pageFeedback, setPageFeedback] = useState('')
  const [pageSaveStatus, setPageSaveStatus] = useState('idle')
  const [pagePublication, setPagePublication] = useState(null)
  const [pagePreviewDevice, setPagePreviewDevice] = useState('desktop')

  const siteContentEditingEnabled = isSiteContentEditingEnabled()
  const requiresAdminSignIn = propertyUsesFirebase || charterUsesFirebase || siteContentEditingEnabled
  const [authState, setAuthState] = useState(() => ({
    status: requiresAdminSignIn ? (isFirebaseConfigured() ? 'loading' : 'unconfigured') : 'disabled',
    user: null,
  }))
  const [authFeedback, setAuthFeedback] = useState('')
  const [authFeedbackStatus, setAuthFeedbackStatus] = useState('idle')
  const propertyDirty = jsonSnapshot(formState) !== jsonSnapshot(savedFormState)
  const charterDirty = jsonSnapshot(charterFormState) !== jsonSnapshot(savedCharterFormState)
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
          const nextFormState = createFormState(properties[0])
          setEditorState({ mode: 'edit', activeSlug: properties[0].slug })
          setFormState(nextFormState)
          setSavedFormState(nextFormState)
          setPropertyPublication(properties[0].publication ?? null)
          setGalleryEditorExpanded(false)
          return
        }

        const nextFormState = createEmptyFormState()
        setEditorState({ mode: 'create', activeSlug: '' })
        setFormState(nextFormState)
        setSavedFormState(nextFormState)
        setPropertyPublication(null)
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
    if (requiresAdminSignIn && authState.status === 'loading') {
      return undefined
    }

    let cancelled = false

    async function loadCharterWorkspace() {
      try {
        let requestOptions = {}

        if (charterUsesFirebase && authState.user) {
          const authToken = await getAdminIdToken()

          if (authToken) {
            requestOptions = { authToken }
          }
        }

        const charters = await listAllCharters(requestOptions)

        if (cancelled) {
          return
        }

        setCharterWorkspaceState({ status: 'ready', charters })

        if (charters.length > 0) {
          const nextFormState = createCharterFormState(charters[0])
          setCharterEditorState({ mode: 'edit', activeSlug: charters[0].slug })
          setCharterFormState(nextFormState)
          setSavedCharterFormState(nextFormState)
          setCharterPublication(charters[0].publication ?? null)
          return
        }

        const nextFormState = createEmptyCharterFormState()
        setCharterEditorState({ mode: 'create', activeSlug: '' })
        setCharterFormState(nextFormState)
        setSavedCharterFormState(nextFormState)
        setCharterPublication(null)
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
  }, [authState.status, authState.user, charterUsesFirebase, requiresAdminSignIn])

  useEffect(() => {
    if (requiresAdminSignIn && authState.status === 'loading') {
      return undefined
    }

    if (requiresAdminSignIn && !authState.user) {
      return undefined
    }

    let cancelled = false

    async function loadSiteShellWorkspace() {
      try {
        let requestOptions = {}

        if (requiresAdminSignIn) {
          if (!isFirebaseConfigured()) {
            throw new Error('Firebase client configuration is missing. Fill in the VITE_FIREBASE_* values first.')
          }

          const authToken = await getAdminIdToken()

          if (!authToken) {
            throw new Error('Sign in to Firebase before saving or resetting live edits.')
          }

          requestOptions = { authToken }
        }

        const response = await fetchAdminSiteShellContent(requestOptions)

        if (cancelled) {
          return
        }

        setSiteShellWorkspaceState({ status: 'ready', shell: response.siteShell, message: '' })
        setSiteShellDraft(response.siteShell)
        setSiteShellPublication(response.publication ?? null)
      } catch (error) {
        if (!cancelled) {
          setSiteShellWorkspaceState({
            status: 'error',
            shell: null,
            message: error instanceof Error ? error.message : 'Unable to load the site shell.',
          })
          setSiteShellDraft(null)
          setSiteShellPublication(null)
        }
      }
    }

    loadSiteShellWorkspace()

    return () => {
      cancelled = true
    }
  }, [authState.status, authState.user, requiresAdminSignIn])

  useEffect(() => {
    if (requiresAdminSignIn && authState.status === 'loading') {
      return undefined
    }

    if (requiresAdminSignIn && !authState.user) {
      return undefined
    }

    let cancelled = false

    async function loadStructuredPagesWorkspace() {
      try {
        let requestOptions = {}

        if (requiresAdminSignIn) {
          if (!isFirebaseConfigured()) {
            throw new Error('Firebase client configuration is missing. Fill in the VITE_FIREBASE_* values first.')
          }

          const authToken = await getAdminIdToken()

          if (!authToken) {
            throw new Error('Sign in to Firebase before saving or resetting live edits.')
          }

          requestOptions = { authToken }
        }

        const directory = await fetchAdminStructuredPageDirectory(requestOptions)

        if (cancelled) {
          return
        }

        const inventory = Array.isArray(directory?.inventory) ? directory.inventory : []
        const pages = Array.isArray(directory?.pages) ? directory.pages : []

        setPageWorkspaceState({
          status: 'ready',
          inventory,
          pages,
          message: '',
        })

        const firstPage = pages[0]

        if (!firstPage?.key) {
          setPageEditorState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
          setPagePublication(null)
          return
        }

        const page = await fetchAdminStructuredPageContent(firstPage.key, requestOptions)

        if (cancelled) {
          return
        }

        setPageEditorState({
          status: 'ready',
          activeKey: firstPage.key,
          draft: page?.page ?? {},
          savedDraft: page?.page ?? {},
        })
        setPagePublication(page?.publication ?? null)
      } catch (error) {
        if (!cancelled) {
          setPageWorkspaceState({
            status: 'error',
            inventory: [],
            pages: [],
            message: error instanceof Error ? error.message : 'Unable to load structured pages.',
          })
          setPageEditorState({ status: 'error', activeKey: '', draft: null, savedDraft: null })
          setPagePublication(null)
        }
      }
    }

    loadStructuredPagesWorkspace()

    return () => {
      cancelled = true
    }
  }, [authState.status, authState.user, requiresAdminSignIn])

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
    if (!propertyDirty && !charterDirty && !pageDirty && !siteShellDirty) {
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
  }, [charterDirty, pageDirty, propertyDirty, siteShellDirty])

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

  async function handleGoogleSignIn() {
    try {
      setAuthFeedbackStatus('saving')
      setAuthFeedback('Opening Google sign-in...')
      await signInAdminWithGoogle()
      setAuthFeedback('Signed in successfully.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign in with Google.')
      setAuthFeedbackStatus('error')
    }
  }

  async function handleAdminSignOut() {
    try {
      setAuthFeedbackStatus('saving')
      await signOutAdmin()
      setAuthFeedback('Signed out.')
      setAuthFeedbackStatus('idle')
    } catch (error) {
      setAuthFeedback(error instanceof Error ? error.message : 'Unable to sign out.')
      setAuthFeedbackStatus('error')
    }
  }

  async function loadCurrentSiteShellIntoEditor() {
    try {
      setSiteShellWorkspaceState((current) => ({ ...current, status: 'loading', message: '' }))
      const requestOptions = await getAdminRequestOptions()
      const response = await fetchAdminSiteShellContent(requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: response.siteShell, message: '' })
      setSiteShellDraft(response.siteShell)
      setSiteShellPublication(response.publication ?? null)
      setSiteShellFeedback('Reloaded the saved site shell draft.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellWorkspaceState({
        status: 'error',
        shell: null,
        message: error instanceof Error ? error.message : 'Unable to load the site shell.',
      })
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to reload the site shell.')
      setSiteShellSaveStatus('error')
      setSiteShellPublication(null)
    }
  }

  async function loadStructuredPageIntoEditor(pageKey) {
    if (!pageKey) {
      return
    }

    try {
      setPageEditorState((current) => ({ ...current, status: 'loading', activeKey: pageKey }))
      const requestOptions = await getAdminRequestOptions()
      const page = await fetchAdminStructuredPageContent(pageKey, requestOptions)
      setPageEditorState({
        status: 'ready',
        activeKey: pageKey,
        draft: page?.page ?? {},
        savedDraft: page?.page ?? {},
      })
      setPagePublication(page?.publication ?? null)
      setPageFeedback('')
      setPageSaveStatus('idle')
    } catch (error) {
      setPageEditorState({ status: 'error', activeKey: pageKey, draft: null, savedDraft: null })
      setPageFeedback(error instanceof Error ? error.message : 'Unable to load the structured page.')
      setPageSaveStatus('error')
      setPagePublication(null)
    }
  }

  async function reloadStructuredPageWorkspace(preferredKey = '') {
    const requestOptions = await getAdminRequestOptions()
    const directory = await fetchAdminStructuredPageDirectory(requestOptions)
    const inventory = Array.isArray(directory?.inventory) ? directory.inventory : []
    const pages = Array.isArray(directory?.pages) ? directory.pages : []
    const nextKey = preferredKey || pages[0]?.key || ''

    setPageWorkspaceState({
      status: 'ready',
      inventory,
      pages,
      message: '',
    })

    if (!nextKey) {
      setPageEditorState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
      setPagePublication(null)
      return null
    }

    const page = await fetchAdminStructuredPageContent(nextKey, requestOptions)

    setPageEditorState({
      status: 'ready',
      activeKey: nextKey,
      draft: page?.page ?? pages.find((entry) => entry.key === nextKey) ?? {},
      savedDraft: page?.page ?? pages.find((entry) => entry.key === nextKey) ?? {},
    })
    setPagePublication(page?.publication ?? null)

    return page
  }

  function openCreateForm() {
    const nextFormState = createEmptyFormState()
    setEditorState({ mode: 'create', activeSlug: '' })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(null)
    setGalleryEditorExpanded(false)
    setFeedback('')
  }

  function openEditForm(property) {
    const nextFormState = createFormState(property)
    setEditorState({ mode: 'edit', activeSlug: property.slug })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(property.publication ?? null)
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
      const nextFormState = createFormState(savedProperty)
      setEditorState({ mode: 'edit', activeSlug: savedProperty.slug })
      setFormState(nextFormState)
      setSavedFormState(nextFormState)
      setPropertyPublication(savedProperty.publication ?? null)
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

    if (!propertyDirty && hasPendingPublication(propertyPublication)) {
      await handlePublishProperty()
      return
    }

    await persistPropertyForm(formState)
  }

  async function handlePublishProperty() {
    try {
      setSaveStatus('publishing')
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      const publishedProperty = await publishAdminProperty(formState.originalSlug, requestOptions)
      const properties = await listAllProperties(requestOptions)
      setWorkspaceState({ status: 'ready', properties })
      const nextFormState = createFormState(publishedProperty)
      setEditorState({ mode: 'edit', activeSlug: publishedProperty.slug })
      setFormState(nextFormState)
      setSavedFormState(nextFormState)
      setPropertyPublication(publishedProperty.publication ?? null)
      setFeedback(`Published ${publishedProperty.name} live.`)
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to publish property changes.')
    }
  }

  async function handlePropertyVisibilityToggle() {
    const nextActive = formState.active !== false ? false : true

    if (editorState.mode !== 'edit') {
      setFormState((currentState) => ({
        ...currentState,
        active: nextActive,
      }))
      setSaveStatus('idle')
      setFeedback(`This draft will be created as ${nextActive ? 'visible' : 'hidden'} when published.`)
      return
    }

    await persistPropertyForm(
      {
        ...formState,
        active: nextActive,
      },
      `Saved draft visibility for ${formState.name || 'this property'}. Publish to apply the ${nextActive ? 'visible' : 'hidden'} state live.`,
    )
  }

  function handleDiscardPropertyChanges() {
    if (!propertyDirty) {
      return
    }

    const confirmationMessage =
      editorState.mode === 'create'
        ? 'Discard this unsaved property draft and clear the form?'
        : 'Discard your unsaved property changes and restore the last saved draft?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    const nextFormState = cloneSnapshotValue(savedFormState)
    setFormState(nextFormState)
    setSaveStatus('idle')
    setFeedback(editorState.mode === 'create' ? 'Cleared the unsaved property draft.' : 'Restored the last saved property draft.')
  }

  function openCreateCharterForm() {
    const nextFormState = createEmptyCharterFormState()
    setCharterEditorState({ mode: 'create', activeSlug: '' })
    setCharterFormState(nextFormState)
    setSavedCharterFormState(nextFormState)
    setCharterPublication(null)
    setCharterFeedback('')
  }

  function openEditCharterForm(charter) {
    const nextFormState = createCharterFormState(charter)
    setCharterEditorState({ mode: 'edit', activeSlug: charter.slug })
    setCharterFormState(nextFormState)
    setSavedCharterFormState(nextFormState)
    setCharterPublication(charter.publication ?? null)
    setCharterFeedback('')
  }

  function updateCharterFormState(field, value) {
    setCharterFormState((current) => ({ ...current, [field]: value }))
  }

  async function handleCharterSubmit(event) {
    event.preventDefault()

    if (!charterDirty && hasPendingPublication(charterPublication)) {
      await handlePublishCharter()
      return
    }

    try {
      setCharterSaveStatus('saving')
      const requestOptions = charterUsesFirebase ? await getAdminRequestOptions() : {}
      const saved = await saveAdminCharter(
        buildCharterDraft(charterFormState),
        charterEditorState.mode === 'edit' ? charterFormState.originalSlug : '',
        requestOptions,
      )
      const charters = await listAllCharters(requestOptions)
      setCharterWorkspaceState({ status: 'ready', charters })
      const nextFormState = createCharterFormState(saved)
      setCharterEditorState({ mode: 'edit', activeSlug: saved.slug })
      setCharterFormState(nextFormState)
      setSavedCharterFormState(nextFormState)
      setCharterPublication(saved.publication ?? null)
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

  async function handlePublishCharter() {
    try {
      setCharterSaveStatus('publishing')
      const requestOptions = charterUsesFirebase ? await getAdminRequestOptions() : {}
      const publishedCharter = await publishAdminCharter(charterFormState.originalSlug, requestOptions)
      const charters = await listAllCharters(requestOptions)
      setCharterWorkspaceState({ status: 'ready', charters })
      const nextFormState = createCharterFormState(publishedCharter)
      setCharterEditorState({ mode: 'edit', activeSlug: publishedCharter.slug })
      setCharterFormState(nextFormState)
      setSavedCharterFormState(nextFormState)
      setCharterPublication(publishedCharter.publication ?? null)
      setCharterFeedback(`Published ${publishedCharter.name} live.`)
      setCharterSaveStatus('idle')
    } catch (error) {
      setCharterSaveStatus('error')
      setCharterFeedback(error instanceof Error ? error.message : 'Unable to publish charter changes.')
    }
  }

  function handleDiscardCharterChanges() {
    if (!charterDirty) {
      return
    }

    const confirmationMessage =
      charterEditorState.mode === 'create'
        ? 'Discard this unsaved charter draft and clear the form?'
        : 'Discard your unsaved charter changes and restore the last saved draft?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    const nextFormState = cloneSnapshotValue(savedCharterFormState)
    setCharterFormState(nextFormState)
    setCharterSaveStatus('idle')
    setCharterFeedback(charterEditorState.mode === 'create' ? 'Cleared the unsaved charter draft.' : 'Restored the last saved charter draft.')
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

    if (!siteShellDirty && hasPendingPublication(siteShellPublication)) {
      await handlePublishSiteShell()
      return
    }

    try {
      setSiteShellSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      const savedSiteShell = await saveAdminSiteShellContent(siteShellDraft ?? {}, requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: savedSiteShell.siteShell, message: '' })
      setSiteShellDraft(savedSiteShell.siteShell)
      setSiteShellPublication(savedSiteShell.publication ?? null)
      setSiteShellFeedback('Saved draft changes to the site shell.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to save the site shell.')
    }
  }

  async function handlePublishSiteShell() {
    try {
      setSiteShellSaveStatus('publishing')
      const requestOptions = await getAdminRequestOptions()
      const publishedSiteShell = await publishAdminSiteShellContent(requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: publishedSiteShell.siteShell, message: '' })
      setSiteShellDraft(publishedSiteShell.siteShell)
      setSiteShellPublication(publishedSiteShell.publication ?? null)
      setSiteShellFeedback('Published the site shell live.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')
      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to publish the site shell.')
    }
  }

  function handleDiscardSiteShellChanges() {
    if (!siteShellDirty) {
      return
    }

    if (!window.confirm('Discard your unsaved shell changes and restore the last saved draft?')) {
      return
    }

    setSiteShellDraft(cloneSnapshotValue(siteShellWorkspaceState.shell))
    setSiteShellSaveStatus('idle')
    setSiteShellFeedback('Restored the last saved shell draft.')
  }

  async function handleStructuredPageSubmit(event) {
    event.preventDefault()

    if (!pageEditorState.activeKey) {
      return
    }

    if (!pageDirty && hasPendingPublication(pagePublication)) {
      await handlePublishStructuredPage()
      return
    }

    try {
      setPageSaveStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      const savedPage = await saveAdminStructuredPageContent(pageEditorState.activeKey, pageEditorState.draft ?? {}, requestOptions)
      await reloadStructuredPageWorkspace(savedPage?.page?.key ?? pageEditorState.activeKey)
      setPageFeedback(`Saved draft changes to ${savedPage?.page?.navLabel || savedPage?.page?.key || pageEditorState.activeKey}.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to save the structured page.')
    }
  }

  async function handlePublishStructuredPage() {
    if (!pageEditorState.activeKey) {
      return
    }

    try {
      setPageSaveStatus('publishing')
      const requestOptions = await getAdminRequestOptions()
      const publishedPage = await publishAdminStructuredPageContent(pageEditorState.activeKey, requestOptions)
      await reloadStructuredPageWorkspace(publishedPage?.page?.key ?? pageEditorState.activeKey)
      setPageFeedback(`Published ${publishedPage?.page?.navLabel || publishedPage?.page?.key || pageEditorState.activeKey} live.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to publish the structured page.')
    }
  }

  function handleDiscardStructuredPageChanges() {
    if (!pageDirty || !pageEditorState.activeKey) {
      return
    }

    if (!window.confirm('Discard your unsaved page changes and restore the last saved draft?')) {
      return
    }

    setPageEditorState((current) => ({
      ...current,
      draft: cloneSnapshotValue(current.savedDraft),
    }))
    setPageSaveStatus('idle')
    setPageFeedback(`Restored the last saved draft for ${selectedStructuredPage?.navLabel || selectedStructuredPage?.key || 'this page'}.`)
  }

  const properties = workspaceState.properties ?? []
  const structuredPages = pageWorkspaceState.pages ?? []
  const selectedStructuredPage =
    structuredPages.find((page) => page.key === pageEditorState.activeKey) ?? structuredPages[0] ?? null
  const propertySaveEnabled = propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user))
  const propertyHasPendingPublication = hasPendingPublication(propertyPublication)
  const propertyActionBusy = saveStatus === 'saving' || saveStatus === 'publishing'
  const propertyPreviewModel = buildPropertyPreviewModel(formState)
  const charterSaveEnabled = charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user))
  const charterHasPendingPublication = hasPendingPublication(charterPublication)
  const charterPreviewModel = buildCharterPreviewModel(charterFormState)
  const siteContentDraftEditingEnabled = siteContentEditingEnabled
  const siteContentSaveEnabled = siteContentEditingEnabled && Boolean(authState.user)
  const siteShellHasPendingPublication = hasPendingPublication(siteShellPublication)
  const pageHasPendingPublication = hasPendingPublication(pagePublication)
  const authBadgeDetail = authState.user?.email ?? ''
  const showGoogleSignInButton = authState.status === 'signed-out'
  const isGoogleSignInBusy = authState.status === 'loading' || authFeedbackStatus === 'saving'
  const requiresAuthenticationScreen = requiresAdminSignIn && !authState.user

  if (requiresAuthenticationScreen) {
    return (
      <article className="admin-page">
        <section className="page-section admin-header admin-header--auth-only">
          <div className="admin-auth-shell">
            <div className="admin-auth-shell-header">
              <div className="eyebrow">Admin</div>
              <h1>Content workspace</h1>
              <p>Sign in with Google to open the editor.</p>
            </div>

            <div className="admin-panel admin-auth-panel admin-auth-panel--standalone">
              {authFeedback ? <p className={`admin-feedback admin-feedback--${authFeedbackStatus}`}>{authFeedback}</p> : null}

              {authState.status === 'unconfigured' ? (
                <p className="admin-note">
                  Live editing is not configured for this environment. Contact your developer to enable it.
                </p>
              ) : null}

              {authState.status === 'loading' ? <p className="admin-note">Checking sign-in status...</p> : null}

              {showGoogleSignInButton ? (
                <div className="admin-form-actions">
                  <button
                    className="button-link button-link--primary admin-submit"
                    disabled={isGoogleSignInBusy}
                    type="button"
                    onClick={handleGoogleSignIn}
                  >
                    {authFeedbackStatus === 'saving' ? 'Opening Google sign-in...' : 'Sign in with Google'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </article>
    )
  }

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
              <div className="admin-auth-badge admin-auth-badge--success">
                <span>Signed in</span>
                {authBadgeDetail ? <strong>{authBadgeDetail}</strong> : null}
              </div>
              <button className="button-link button-link--ghost admin-action" type="button" onClick={handleAdminSignOut}>
                Sign out
              </button>
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
          <AdminTabButton
            active={activeTab === 'submissions'}
            label="Form Submissions"
            onClick={() => setActiveTab('submissions')}
          />
        </div>
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
                  <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(siteShellSaveStatus)}`}>{siteShellFeedback}</p>
                ) : null}

                {!siteContentSaveEnabled ? (
                  <p className="admin-note">You can edit the header and footer draft here, but you must sign in before saving drafts or publishing changes live.</p>
                ) : null}

                {siteShellWorkspaceState.status === 'loading' ? (
                  <p className="admin-empty">Loading header and footer content...</p>
                ) : (
                  <form className="admin-form" onSubmit={handleSiteShellSubmit}>
                    <div className="admin-floating-save-shell">
                      <AdminFloatingSaveButton
                        disabled={!siteContentSaveEnabled}
                        label={siteShellHasPendingPublication ? 'Publish shell changes' : 'Save shell changes'}
                        onReset={handleDiscardSiteShellChanges}
                        showReset={siteShellDirty}
                        saveStatus={siteShellSaveStatus}
                        visible={siteShellDirty || siteShellHasPendingPublication}
                      />

                      <div className="admin-editor-workspace">
                        <div>
                          <AdminSiteShellEditor
                            value={siteShellDraft}
                            onChange={setSiteShellDraft}
                            disabled={!siteContentDraftEditingEnabled}
                          />
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
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="admin-editor admin-editor--page">
                {pageFeedback ? <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(pageSaveStatus)}`}>{pageFeedback}</p> : null}

                {pageEditorState.status === 'loading' ? <p className="admin-empty">Loading structured page content...</p> : null}

                {!siteContentSaveEnabled ? (
                  <p className="admin-note">You can edit this page draft now, but you must sign in before saving drafts or publishing changes live.</p>
                ) : null}

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

                    <div className="admin-floating-save-shell">
                      <AdminFloatingSaveButton
                        disabled={!siteContentSaveEnabled}
                        label={pageHasPendingPublication ? 'Publish page changes' : 'Save page changes'}
                        onReset={handleDiscardStructuredPageChanges}
                        showReset={pageDirty}
                        saveStatus={pageSaveStatus}
                        visible={pageDirty || pageHasPendingPublication}
                      />

                      <AdminPageEditorCanvas
                        device={pagePreviewDevice}
                        disabled={!siteContentDraftEditingEnabled}
                        onChange={(updater) =>
                          setPageEditorState((current) => ({
                            ...current,
                            draft: typeof updater === 'function' ? updater(current.draft) : updater,
                          }))
                        }
                        page={pageEditorState.draft}
                        pageKey={pageEditorState.activeKey}
                        routeInventory={pageWorkspaceState.inventory}
                        siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                      />
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
                {feedback ? <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(saveStatus)}`}>{feedback}</p> : null}

                <form className="admin-form admin-form--flush" onSubmit={handleSubmit}>
                  <div className="admin-toolbar-row admin-toolbar-row--split">
                    <div className="admin-chip-row admin-chip-row--compact">
                      <span className="admin-chip">{formState.active !== false ? 'Visible when published' : 'Hidden when published'}</span>
                      {editorState.mode === 'edit' ? (
                        <span className="admin-chip">{propertyHasPendingPublication ? 'Draft saved' : 'Live version current'}</span>
                      ) : null}
                    </div>

                    <div className="admin-inline-actions">
                      {editorState.mode === 'edit' && editorState.activeSlug && formState.active !== false ? (
                        <Link className="button-link button-link--ghost admin-action" to={`/rental-properties/${editorState.activeSlug}`}>
                          View on site
                        </Link>
                      ) : null}
                      <button
                        className="button-link button-link--ghost admin-action"
                        disabled={!propertySaveEnabled || propertyActionBusy}
                        type="button"
                        onClick={handlePropertyVisibilityToggle}
                      >
                        {editorState.mode === 'edit'
                          ? formState.active !== false
                            ? 'Hide when published'
                            : 'Show when published'
                          : formState.active !== false
                            ? 'Create draft as visible'
                            : 'Create draft as hidden'}
                      </button>
                    </div>
                  </div>

                  <div className="admin-floating-save-shell">
                    <AdminFloatingSaveButton
                      disabled={!propertySaveEnabled}
                      label={
                        propertyHasPendingPublication
                          ? 'Publish property'
                          : editorState.mode === 'create'
                            ? 'Create property'
                            : 'Save property'
                      }
                      onReset={handleDiscardPropertyChanges}
                      saveStatus={saveStatus}
                      showReset={propertyDirty}
                      visible={propertyDirty || propertyHasPendingPublication}
                    />

                    <AdminPropertyPreview
                      key={formState.originalSlug || 'new-property'}
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
                  <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(charterSaveStatus)}`}>{charterFeedback}</p>
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

                    <div className="admin-floating-save-shell">
                      <AdminFloatingSaveButton
                        disabled={!charterSaveEnabled}
                        label={
                          charterHasPendingPublication
                            ? 'Publish charter'
                            : charterEditorState.mode === 'create'
                              ? 'Create charter'
                              : 'Save charter'
                        }
                        onReset={handleDiscardCharterChanges}
                        saveStatus={charterSaveStatus}
                        showReset={charterDirty}
                        visible={charterDirty || charterHasPendingPublication}
                      />

                      <AdminCharterEditorPreview
                        charter={charterPreviewModel}
                        disabled={!charterSaveEnabled}
                        formState={charterFormState}
                        onFieldChange={updateCharterFormState}
                      />
                    </div>
                </form>
              </div>
            </section>
          ) : null}

          {activeTab === 'media' ? (
            <section className="admin-panel">
              <div className="admin-editor">
                <AdminMediaManager
                  defaultOpen
                  showToggle={false}
                  title=""
                />
              </div>
            </section>
          ) : null}

          {activeTab === 'submissions' ? <AdminAdvertiseInquiriesPanel authUser={authState.user} /> : null}
        </div>
      </section>
    </article>
  )
}


