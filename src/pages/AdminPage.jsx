import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '../lib/router'
import { Eye, LayoutPanelTop, Plus, Redo2, RefreshCw, SlidersHorizontal, Trash2, Undo2 } from 'lucide-react'
import { AdminAdvertiseInquiriesPanel } from '../components/AdminAdvertiseInquiriesPanel'
import { AdminBackupManager } from '../components/AdminBackupManager'
import { AdminClientsPanel } from '../components/AdminClientsPanel'
import { AdminBackToSiteButton, AdminViewLiveButton } from '../components/AdminViewLiveButton'
import { getAdminIdToken, observeAdminUser, signInAdminWithGoogle, signOutAdmin } from '../lib/adminAuth'
import { AdminPageEditorCanvas, AdminPagePreview } from '../components/AdminPagePreview'
import { AdminPreviewModeSplitButton } from '../components/AdminPreviewModeSplitButton'
import { BlockInspectorPanel } from '../components/BlockInspectorPanel'
import { BlockLayoutOutline, BlockOutline } from '../components/BlockOutline'
import { EditorIconButton } from '../components/EditorIconButton'
import { EditorReviewToolbar } from '../components/EditorReviewToolbar'
import { PageChangeSummaryPanel } from '../components/PageChangeSummaryPanel'
import { PageQualityPanel } from '../components/PageQualityPanel'
import { PageRevisionHistoryPanel } from '../components/PageRevisionHistoryPanel'
import { CarRentalCompaniesPanel } from '../components/AdminStructuredPageEditor'
import { AdminPropertyPreview } from '../components/AdminPropertyPreview'
import { AdminCharterEditorPreview } from '../components/AdminCharterEditorPreview'
import { AdminMediaManager } from '../components/AdminMediaManager'
import { AdminSiteShellEditor } from '../components/AdminSiteShellEditor'
import { AdminStyleEditor } from '../components/AdminStyleEditor'
import {
  isCharterEditingEnabled,
  isFirebaseCharterData,
  listAllCharters,
  publishAdminCharter,
  saveAdminCharter,
} from '../lib/charterRepository'
import { listEditLockStatuses } from '../lib/editLockRepository'
import { isFirebaseConfigured } from '../lib/firebase'
import { useEditLock } from '../lib/useEditLock'
import {
  deleteAdminProperty,
  isFirebasePropertyData,
  isPropertyEditingEnabled,
  listAllProperties,
  publishAdminProperty,
  saveAdminProperty,
  setAdminPropertyActiveState,
} from '../lib/propertyRepository'
import { buildPropertyLocationOptions } from '../lib/propertyLocationFilters'
import { buildPropertyShortDescription, mergePropertyShortDescription } from '../lib/propertyShortDescription'
import { DEFAULT_PROPERTY_TEMPLATE_VARIANT } from '../lib/propertyTemplateVariants'
import { richTextValueToHtml, richTextValueToInlineHtml, richTextValueToPlainLineText } from '../lib/richTextValue'
import { getRouteSlugVariants } from '../lib/routeSlug'
import { validateEditorBlockPageDraft } from '../lib/blockPageValidation'
import { collectBlockOutlineEntries } from '../lib/blockTree'
import { updateValueAtPath } from '../lib/inlinePageEditor'
import { buildPageDiff } from '../lib/pageDiff'
import { findValidationIssueOwner } from '../lib/pageValidationIssues'
import { validatePageRouteSettings } from '../lib/pageRouteSettings'
import {
  getPageEditorHistoryStatus,
  recordPageEditorHistory,
  redoPageEditorHistory,
  resetPageEditorHistory,
  undoPageEditorHistory,
} from '../lib/pageEditorHistory'
import {
  fetchAdminSiteShellContent,
  fetchAdminStructuredPageContent,
  fetchAdminStructuredPageDirectory,
  fetchAdminStructuredPageRevision,
  fetchAdminStructuredPageRevisions,
  isSiteContentEditingEnabled,
  normalizeAdminStructuredPageConflict,
  publishAdminSiteShellContent,
  publishAdminStructuredPageContent,
  resetAdminStructuredPageContent,
  restoreAdminDeletedStructuredPage,
  restoreAdminStructuredPageRevision,
  saveAdminSiteShellContent,
  saveAdminStructuredPageContent,
} from '../lib/siteContentRepository'

const PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES = ['ratesHtml', 'ratesTableHtml']
const PROPERTY_DESCRIPTION_SECTION_FIELD_NAMES = [...PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES, 'bookingHtml', 'policyHtml']
const EMPTY_PAGE_LAYOUT_METRICS = Object.freeze({ bySelectionId: {}, entries: [] })
const EXPECTED_PROPERTY_IMAGE_STORAGE_BUCKET =
  String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() || 'st-john-house-rentals.firebasestorage.app'
const PROPERTY_HTML_IMAGE_FIELDS = [
  ['descriptionHtml', 'Description'],
  ['ratesHtml', 'Rates'],
  ['ratesTableHtml', 'Rates table'],
  ['bookingHtml', 'Booking'],
  ['policyHtml', 'Policy'],
  ['existingAmenitiesHtml', 'Amenities'],
  ['existingReviewsHtml', 'Reviews'],
]

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

function getSnapshotValueAtPath(value, path = []) {
  return path.reduce((current, segment) => current?.[segment], value)
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

function createRouteSlugCandidate(value = '') {
  return repairSnapshotText(String(value ?? ''))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeAdminRoutePath(value = '') {
  const candidate = repairSnapshotText(String(value ?? '')).trim()

  if (!candidate) {
    return ''
  }

  const withoutOrigin = candidate.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const withoutQueryOrHash = withoutOrigin.split(/[?#]/, 1)[0] || '/'
  const normalizedPath = withoutQueryOrHash.startsWith('/') ? withoutQueryOrHash : `/${withoutQueryOrHash}`

  return normalizedPath === '/' ? '/' : normalizedPath.replace(/\/+$/, '') || '/'
}

function isActualPublicRoutePath(path) {
  return Boolean(path) && path !== '/admin' && !path.includes('/:')
}

function getRoutePathSlug(path = '') {
  const normalizedPath = normalizeAdminRoutePath(path)
  return normalizedPath.split('/').filter(Boolean).pop() ?? ''
}

function findRecordByRouteSlug(records = [], requestedSlug = '') {
  const requestedVariants = new Set(getRouteSlugVariants(requestedSlug))

  if (requestedVariants.size === 0) {
    return null
  }

  return (
    records.find((record) => {
      const recordVariants = new Set()

      ;[record?.slug, record?.adminOriginalSlug, getRoutePathSlug(record?.path)].filter(Boolean).forEach((candidate) => {
        getRouteSlugVariants(candidate).forEach((variant) => recordVariants.add(variant))
      })

      return Array.from(requestedVariants).some((variant) => recordVariants.has(variant))
    }) ?? null
  )
}

const BLOCK_RICH_TEXT_PATTERN = /<\/?(?:blockquote|div|h[1-6]|li|ol|p|ul)\b/i

function findPagePathConflict(path, { inventory = [], structuredPages = [] } = {}) {
  const validation = validatePageRouteSettings(
    {
      blocks: [],
      contentModel: 'block-page',
      group: 'custom',
      navLabel: 'New page',
      path,
      routeAliases: [],
    },
    { routeInventory: inventory, structuredPages },
  )

  return validation.errors.find((issue) => issue.path.join('.') === 'path')?.message ?? ''
}

function findPageKeyConflict(key, structuredPages = []) {
  return structuredPages.some((page) => page.key === key) ? 'A page already uses that key. Choose a different title.' : ''
}

function buildNewPageDraft({ path, title }) {
  return {
    blocks: [],
    contentModel: 'block-page',
    group: 'custom',
    metaDescription: '',
    navLabel: title,
    path,
    routeAliases: [],
    title,
  }
}

const ADMIN_EDITOR_LOCATION_STORAGE_KEY = 'genericcms.admin.editor-location'
const DEFAULT_ADMIN_EDITOR_LOCATION = {
  tab: 'pages',
  pageKey: '',
  propertyMode: 'create',
  propertySlug: '',
  charterMode: 'create',
  charterSlug: '',
}
const STRUCTURED_PAGE_EDITOR_FORM_ID = 'admin-structured-page-editor-form'
const PROPERTY_EDITOR_FORM_ID = 'admin-property-editor-form'
const ADMIN_EDITOR_TABS = new Set(['site-shell', 'pages', 'styles', 'properties', 'charters', 'media', 'clients', 'submissions', 'backups'])
const ADMIN_EDITOR_TAB_OPTIONS = [
  { label: 'Header & Footer', value: 'site-shell' },
  { label: 'Pages', value: 'pages' },
  { label: 'Styles', value: 'styles' },
  { label: 'Properties', value: 'properties' },
  { label: 'Charters', value: 'charters' },
  { label: 'Media', value: 'media' },
  { label: 'Clients', value: 'clients' },
  { label: 'Advertise', value: 'submissions' },
  { label: 'Backups', value: 'backups' },
]

function normalizeAdminEditorTab(value = '') {
  const candidate = String(value ?? '').trim()
  return ADMIN_EDITOR_TABS.has(candidate) ? candidate : DEFAULT_ADMIN_EDITOR_LOCATION.tab
}

function normalizeAdminEditorMode(value = '') {
  return String(value ?? '').trim() === 'edit' ? 'edit' : 'create'
}

function normalizeAdminEditorLocation(value = {}) {
  const propertySlug = String(value?.propertySlug ?? '').trim()
  const charterSlug = String(value?.charterSlug ?? '').trim()
  const propertyMode = normalizeAdminEditorMode(value?.propertyMode)
  const charterMode = normalizeAdminEditorMode(value?.charterMode)

  return {
    tab: normalizeAdminEditorTab(value?.tab),
    pageKey: String(value?.pageKey ?? '').trim(),
    propertyMode: propertyMode === 'edit' && propertySlug ? 'edit' : 'create',
    propertySlug: propertyMode === 'edit' && propertySlug ? propertySlug : '',
    charterMode: charterMode === 'edit' && charterSlug ? 'edit' : 'create',
    charterSlug: charterMode === 'edit' && charterSlug ? charterSlug : '',
  }
}

function readAdminEditorLocationFromSearch(search = '') {
  const params = new URLSearchParams(search)

  if (Array.from(params.keys()).length === 0) {
    return null
  }

  const propertySlug = params.get('propertySlug') ?? ''
  const charterSlug = params.get('charterSlug') ?? ''

  return {
    tab: params.get('tab') ?? '',
    pageKey: params.get('pageKey') ?? '',
    propertyMode: propertySlug ? 'edit' : '',
    propertySlug,
    charterMode: charterSlug ? 'edit' : '',
    charterSlug,
  }
}

function readStoredAdminEditorLocation() {
  if (typeof window === 'undefined') {
    return DEFAULT_ADMIN_EDITOR_LOCATION
  }

  const queryLocation = readAdminEditorLocationFromSearch(window.location.search)

  if (queryLocation) {
    return normalizeAdminEditorLocation(queryLocation)
  }

  try {
    const rawValue = window.sessionStorage.getItem(ADMIN_EDITOR_LOCATION_STORAGE_KEY)

    if (!rawValue) {
      return DEFAULT_ADMIN_EDITOR_LOCATION
    }

    return normalizeAdminEditorLocation(JSON.parse(rawValue))
  } catch {
    return DEFAULT_ADMIN_EDITOR_LOCATION
  }
}

function persistAdminEditorLocation(value = {}) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(ADMIN_EDITOR_LOCATION_STORAGE_KEY, JSON.stringify(normalizeAdminEditorLocation(value)))
  } catch {
    // Ignore session storage failures.
  }
}

function buildSiteShellRouteSuggestions({ charters = [], inventory = [], properties = [] } = {}) {
  const routePaths = new Set()

  const addRoutePath = (value) => {
    const path = normalizeAdminRoutePath(value)

    if (isActualPublicRoutePath(path)) {
      routePaths.add(path)
    }
  }

  inventory.forEach((route) => {
    if (String(route?.group ?? '').trim() === 'internal') {
      return
    }

    addRoutePath(route?.path)

    if (Array.isArray(route?.routeAliases)) {
      route.routeAliases.forEach((alias) => addRoutePath(alias))
    }
  })

  properties
    .filter((property) => property?.active !== false)
    .forEach((property) => {
      addRoutePath(property?.path || (property?.slug ? `/rental-properties/${property.slug}` : ''))
    })

  charters
    .filter((charter) => charter?.active !== false)
    .forEach((charter) => {
      addRoutePath(charter?.path || (charter?.slug ? `/charter-boat-rentals/${charter.slug}` : ''))
    })

  return Array.from(routePaths).sort((left, right) => left.localeCompare(right))
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

function normalizeBedroomCount(value) {
  const count = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isInteger(count) && count > 0 ? count : 0
}

function normalizeAlternateBedroomCounts(values, primaryBedrooms = 0) {
  const normalizedPrimaryBedrooms = normalizeBedroomCount(primaryBedrooms)

  if (!Array.isArray(values) || normalizedPrimaryBedrooms <= 1) {
    return []
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeBedroomCount(value))
        .filter((value) => value > 0 && value < normalizedPrimaryBedrooms),
    ),
  ).sort((left, right) => left - right)
}

function createAmenityEditor(group = {}) {
  return {
    id: makeToken(),
    title: richTextValueToInlineHtml(repairSnapshotText(group.title ?? '')),
    itemsText: linesToText(Array.isArray(group.items) ? group.items : []),
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
    title: richTextValueToInlineHtml(repairSnapshotText(group.title ?? '').trim()),
    items: Array.isArray(group.items)
      ? group.items.map((item) => richTextValueToInlineHtml(repairSnapshotText(item).trim())).filter(Boolean)
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
    fileName: String(image.fileName ?? '').trim(),
    originalFileName: String(image.originalFileName ?? '').trim(),
    storagePath: String(image.storagePath ?? '').trim(),
  }
}

function createGalleryAssets(galleryImages = []) {
  return galleryImages
    .map((image) => ({
      url: String(image.url ?? '').trim(),
      alt: repairSnapshotText(image.alt ?? '').trim(),
      title: repairSnapshotText(image.title ?? '').trim(),
      fileName: String(image.fileName ?? '').trim(),
      originalFileName: String(image.originalFileName ?? '').trim(),
      storagePath: String(image.storagePath ?? '').trim(),
    }))
    .filter((image) => image.url)
}

function isExpectedFirebaseStorageUrl(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return true
  }

  let parsedUrl

  try {
    parsedUrl = new URL(candidate)
  } catch {
    return false
  }

  if (parsedUrl.hostname === 'firebasestorage.googleapis.com') {
    const pathMatch = parsedUrl.pathname.match(/^\/v0\/b\/([^/]+)\/o\//)
    return decodeURIComponent(pathMatch?.[1] ?? '') === EXPECTED_PROPERTY_IMAGE_STORAGE_BUCKET
  }

  if (parsedUrl.hostname === 'storage.googleapis.com') {
    return parsedUrl.pathname.startsWith(`/${EXPECTED_PROPERTY_IMAGE_STORAGE_BUCKET}/`)
  }

  return false
}

function truncateImageUrl(value) {
  const candidate = String(value ?? '').trim()

  if (candidate.length <= 92) {
    return candidate
  }

  return `${candidate.slice(0, 89)}...`
}

function findFirstHtmlImageUrl(value) {
  const html = String(value ?? '')
  const match = html.match(/<img\b[^>]*\bsrc=['"]([^'"]+)['"][^>]*>/i)

  return match?.[1] ?? ''
}

function getPropertyImageValidationMessage(formState = {}) {
  const invalidReferences = []
  const heroImageUrl = String(formState.heroImageUrl ?? '').trim()

  if (heroImageUrl && !isExpectedFirebaseStorageUrl(heroImageUrl)) {
    invalidReferences.push({ label: 'Hero image', url: heroImageUrl })
  }

  const galleryImages = Array.isArray(formState.galleryImages) ? formState.galleryImages : []

  galleryImages.some((image, index) => {
    const imageUrl = String(image?.url ?? '').trim()

    if (imageUrl && !isExpectedFirebaseStorageUrl(imageUrl)) {
      invalidReferences.push({ label: `Gallery image ${index + 1}`, url: imageUrl })
      return true
    }

    return false
  })

  if (invalidReferences.length === 0) {
    PROPERTY_HTML_IMAGE_FIELDS.some(([field, label]) => {
      const imageUrl = findFirstHtmlImageUrl(formState[field])

      if (imageUrl && !isExpectedFirebaseStorageUrl(imageUrl)) {
        invalidReferences.push({ label: `${label} image`, url: imageUrl })
        return true
      }

      return false
    })
  }

  const invalidReference = invalidReferences[0]

  if (!invalidReference) {
    return ''
  }

  return `${invalidReference.label} uses an image URL outside this site's Firebase Storage bucket: ${truncateImageUrl(
    invalidReference.url,
  )}. Choose an uploaded image from Media, then save again.`
}

function buildValidatedPropertyDraft(formState = {}) {
  const imageValidationMessage = getPropertyImageValidationMessage(formState)

  if (imageValidationMessage) {
    throw new Error(imageValidationMessage)
  }

  return buildPropertyDraft(formState)
}

function createEmptyFormState() {
  const nextFormState = {
    originalSlug: '',
    name: '',
    slug: '',
    active: false,
    templateVariant: DEFAULT_PROPERTY_TEMPLATE_VARIANT,
    bedrooms: '1',
    rentFewerRooms: false,
    alternateBedroomCounts: [],
    bathrooms: '1',
    maxGuests: '2',
    location: 'St. John, USVI',
    price: '',
    shortDescription: '',
    calendarUrl: '',
    clientId: '',
    listingFeeAmount: '',
    listingFeeInterval: '',
    lastPaidAt: '',
    renewalDueAt: '',
    descriptionHtml: '',
    ratesHtml: '',
    ratesTableHtml: '',
    bookingHtml: '',
    policyHtml: '',
    enabledDescriptionSections: [],
    existingAmenitiesHtml: '',
    existingReviewsHtml: '',
    heroImageUrl: '',
    heroImageAlt: '',
    bookingContactName: '',
    bookingEmail: '',
    bookingPhone: '',
    bookingNote: '',
    galleryImages: [],
    amenityGroups: [createAmenityEditor()],
    reviewEntries: [createReviewEditor()],
  }

  return {
    ...nextFormState,
    shortDescription: buildPropertyShortDescription(nextFormState),
  }
}

function createDescriptionSectionFormState(property = {}) {
  const descriptionHtml = String(property.descriptionHtml ?? '').trim() || paragraphListToHtml(property.description ?? [])
  const rawSections = {
    descriptionHtml,
    ratesHtml: String(property.ratesHtml ?? '').trim(),
    ratesTableHtml: String(property.ratesTableHtml ?? '').trim(),
    bookingHtml: String(property.bookingHtml ?? '').trim(),
    policyHtml: String(property.policyHtml ?? '').trim(),
  }
  const sections = {
    ...rawSections,
    ...normalizeRateDescriptionSections(rawSections, property.enabledDescriptionSections),
  }

  return {
    ...sections,
    enabledDescriptionSections: normalizeEnabledDescriptionSections(property.enabledDescriptionSections, sections),
  }
}

function getActiveRateDescriptionSectionKey(value, sections = {}) {
  const explicitRateSectionKeys = Array.isArray(value)
    ? value.filter((sectionKey) => PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey))
    : []
  const explicitRateSectionKey = explicitRateSectionKeys[explicitRateSectionKeys.length - 1] ?? ''
  const hasTextRates = Boolean(String(sections?.ratesHtml ?? '').trim())
  const hasTableRates = Boolean(String(sections?.ratesTableHtml ?? '').trim())

  if (explicitRateSectionKey && String(sections?.[explicitRateSectionKey] ?? '').trim()) {
    return explicitRateSectionKey
  }

  if (hasTextRates) {
    return 'ratesHtml'
  }

  if (hasTableRates) {
    return 'ratesTableHtml'
  }

  return explicitRateSectionKey || ''
}

function normalizeRateDescriptionSections(sections = {}, enabledDescriptionSections = []) {
  const activeRateSectionKey = getActiveRateDescriptionSectionKey(enabledDescriptionSections, sections)

  return {
    ratesHtml: activeRateSectionKey === 'ratesHtml' ? String(sections?.ratesHtml ?? '').trim() : '',
    ratesTableHtml: activeRateSectionKey === 'ratesTableHtml' ? String(sections?.ratesTableHtml ?? '').trim() : '',
  }
}

function normalizeDescriptionSectionFields(source = {}) {
  const sections = {
    descriptionHtml: String(source.descriptionHtml ?? '').trim(),
    ratesHtml: String(source.ratesHtml ?? '').trim(),
    ratesTableHtml: String(source.ratesTableHtml ?? '').trim(),
    bookingHtml: String(source.bookingHtml ?? '').trim(),
    policyHtml: String(source.policyHtml ?? '').trim(),
  }

  return {
    ...sections,
    ...normalizeRateDescriptionSections(sections, source.enabledDescriptionSections),
  }
}

function normalizeEnabledDescriptionSections(value, sections = {}) {
  const contentSectionKeys = PROPERTY_DESCRIPTION_SECTION_FIELD_NAMES.filter((sectionKey) => String(sections?.[sectionKey] ?? '').trim())
  const sourceKeys = Array.isArray(value) ? [...value, ...contentSectionKeys] : contentSectionKeys
  const activeRateSectionKey = sourceKeys.some((sectionKey) => PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey))
    ? getActiveRateDescriptionSectionKey(value, sections)
    : ''
  let hasAddedActiveRateSection = false

  return Array.from(
    new Set(
      sourceKeys
        .map((sectionKey) => {
          if (!PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey)) {
            return sectionKey
          }

          if (!activeRateSectionKey || hasAddedActiveRateSection) {
            return ''
          }

          hasAddedActiveRateSection = true
          return activeRateSectionKey
        })
        .filter((sectionKey) => PROPERTY_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey)),
    ),
  )
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
  return [createAmenityEditor({ items: amenityLines })]
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
  const bedrooms = normalizeBedroomCount(property.bedrooms)
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(property.alternateBedroomCounts, bedrooms)
  const descriptionSections = createDescriptionSectionFormState(property)

  const nextFormState = {
    originalSlug: property.adminOriginalSlug ?? property.slug,
    name: repairSnapshotText(property.name ?? ''),
    slug: property.slug ?? '',
    active: property.active !== false,
    templateVariant: property.templateVariant ?? DEFAULT_PROPERTY_TEMPLATE_VARIANT,
    bedrooms: String(bedrooms),
    rentFewerRooms: (property.rentFewerRooms === true || alternateBedroomCounts.length > 0) && bedrooms > 1,
    alternateBedroomCounts,
    bathrooms: String(property.bathrooms ?? 0),
    maxGuests: String(property.maxGuests ?? 0),
    location: repairSnapshotText(property.location ?? 'St. John, USVI'),
    price: repairSnapshotText(property.price ?? ''),
    shortDescription: repairSnapshotText(property.shortDescription ?? ''),
    calendarUrl: repairSnapshotText(property.calendarUrl ?? ''),
    clientId: String(property.clientId ?? '').trim(),
    listingFeeAmount: String(property.listingFeeAmount ?? '').trim(),
    listingFeeInterval: String(property.listingFeeInterval ?? '').trim(),
    lastPaidAt: String(property.lastPaidAt ?? '').trim(),
    renewalDueAt: String(property.renewalDueAt ?? '').trim(),
    descriptionHtml: descriptionSections.descriptionHtml,
    ratesHtml: descriptionSections.ratesHtml,
    ratesTableHtml: descriptionSections.ratesTableHtml,
    bookingHtml: descriptionSections.bookingHtml,
    policyHtml: descriptionSections.policyHtml,
    enabledDescriptionSections: descriptionSections.enabledDescriptionSections,
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

  return {
    ...nextFormState,
    shortDescription: mergePropertyShortDescription(nextFormState, nextFormState.shortDescription),
  }
}

function buildPropertyDraft(formState) {
  const bedrooms = normalizeBedroomCount(formState.bedrooms)
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(formState.alternateBedroomCounts, bedrooms)
  const descriptionSections = normalizeDescriptionSectionFields(formState)

  const amenityGroups = formState.amenityGroups
    .map((group) => ({
      title: richTextValueToInlineHtml(group.title),
      items: parseLineList(group.itemsText).map((item) => richTextValueToInlineHtml(item)).filter(Boolean),
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
    bedrooms,
    rentFewerRooms: Boolean(formState.rentFewerRooms) && bedrooms > 1,
    alternateBedroomCounts,
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(richTextValueToPlainLineText(formState.shortDescription)).trim(),
    calendarUrl: repairSnapshotText(formState.calendarUrl).trim(),
    clientId: String(formState.clientId ?? '').trim(),
    listingFeeAmount: String(formState.listingFeeAmount ?? '').trim(),
    listingFeeInterval: String(formState.listingFeeInterval ?? '').trim(),
    lastPaidAt: String(formState.lastPaidAt ?? '').trim(),
    renewalDueAt: String(formState.renewalDueAt ?? '').trim(),
    hasStructuredDescriptionSections: true,
    descriptionHtml: descriptionSections.descriptionHtml,
    ratesHtml: descriptionSections.ratesHtml,
    ratesTableHtml: descriptionSections.ratesTableHtml,
    bookingHtml: descriptionSections.bookingHtml,
    policyHtml: descriptionSections.policyHtml,
    enabledDescriptionSections: normalizeEnabledDescriptionSections(formState.enabledDescriptionSections, descriptionSections),
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
      const title = richTextValueToInlineHtml(group?.title ?? '')
      const items = parseLineList(group?.itemsText ?? '').map((item) => richTextValueToInlineHtml(item)).filter(Boolean)
      const lines = []

      if (title) {
        lines.push(`<h4>${title}</h4>`)
      }

      if (items.length > 0) {
        lines.push(`<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`)
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
        const quoteHtml = richTextValueToHtml(quote)
        lines.push(BLOCK_RICH_TEXT_PATTERN.test(quoteHtml) ? quoteHtml : `<p>${quoteHtml}</p>`)
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
  const bedrooms = normalizeBedroomCount(formState.bedrooms)
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(formState.alternateBedroomCounts, bedrooms)
  const descriptionSections = normalizeDescriptionSectionFields(formState)

  return {
    slug: repairSnapshotText(formState.slug).trim(),
    name: repairSnapshotText(formState.name).trim() || 'Untitled Property',
    active: formState.active,
    templateVariant: formState.templateVariant,
    bedrooms,
    rentFewerRooms: Boolean(formState.rentFewerRooms) && bedrooms > 1,
    alternateBedroomCounts,
    bedroomLabel: bedrooms > 0 ? `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}` : '',
    bathrooms: Number(formState.bathrooms) || 0,
    maxGuests: Number(formState.maxGuests) || 0,
    location: repairSnapshotText(formState.location).trim(),
    price: repairSnapshotText(formState.price).trim(),
    shortDescription: repairSnapshotText(richTextValueToPlainLineText(formState.shortDescription)).trim(),
    calendarUrl: repairSnapshotText(formState.calendarUrl).trim(),
    clientId: String(formState.clientId ?? '').trim(),
    listingFeeAmount: String(formState.listingFeeAmount ?? '').trim(),
    listingFeeInterval: String(formState.listingFeeInterval ?? '').trim(),
    lastPaidAt: String(formState.lastPaidAt ?? '').trim(),
    renewalDueAt: String(formState.renewalDueAt ?? '').trim(),
    hasStructuredDescriptionSections: true,
    descriptionHtml: descriptionSections.descriptionHtml,
    ratesHtml: descriptionSections.ratesHtml,
    ratesTableHtml: descriptionSections.ratesTableHtml,
    bookingHtml: descriptionSections.bookingHtml,
    policyHtml: descriptionSections.policyHtml,
    enabledDescriptionSections: normalizeEnabledDescriptionSections(formState.enabledDescriptionSections, descriptionSections),
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

function AdminSectionSelect({ activeTab, onChange }) {
  return (
    <label className="admin-section-select">
      <span className="visually-hidden">Admin section</span>
      <select value={activeTab} onChange={(event) => onChange?.(event.target.value)}>
        {ADMIN_EDITOR_TAB_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function AdminEditLockNotice({ lock, resourceLabel }) {
  if (lock.status === 'locked-by-other') {
    return (
      <div className="admin-feedback admin-feedback--warning" role="status">
        <span>
          {lock.message || `This ${resourceLabel} is currently being edited by ${lock.lockedByEmail || 'another admin'}.`} You can look
          around, or take over editing if you need control.
        </span>
        <button className="button-link button-link--primary" type="button" onClick={lock.takeOver}>
          Take Over Editing
        </button>
      </div>
    )
  }

  if (lock.status === 'acquiring') {
    return (
      <p className="admin-note" role="status">
        Securing exclusive edit access to this {resourceLabel}...
      </p>
    )
  }

  if (lock.status === 'expired') {
    return (
      <div className="admin-feedback admin-feedback--warning" role="status">
        <span>{lock.message || 'Your edit lock is no longer active.'}</span>
        <button className="button-link button-link--primary" type="button" onClick={lock.takeOver}>
          Take Over Editing
        </button>
      </div>
    )
  }

  if (lock.status === 'error') {
    return (
      <p className="admin-feedback admin-feedback--error" role="alert">
        Editing is disabled because edit access could not be secured. {lock.message || 'Refresh the editor and try again.'}
      </p>
    )
  }

  return null
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

async function loadPageRevisionState(pageKey, requestOptions) {
  const normalizedKey = String(pageKey ?? '').trim()

  if (!normalizedKey) {
    return { activeRevisionId: '', message: '', revisions: [], status: 'idle' }
  }

  try {
    const payload = await fetchAdminStructuredPageRevisions(normalizedKey, { ...requestOptions, limit: 80 })
    return {
      activeRevisionId: '',
      message: '',
      revisions: payload.revisions ?? [],
      status: 'ready',
    }
  } catch (error) {
    return {
      activeRevisionId: '',
      message: error instanceof Error ? error.message : 'Unable to load page revisions.',
      revisions: [],
      status: 'error',
    }
  }
}

export function AdminPage() {
  const initialPropertyFormState = createEmptyFormState()
  const initialCharterFormState = createEmptyCharterFormState()
  const [initialAdminEditorLocation] = useState(() => readStoredAdminEditorLocation())

  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.search) {
      return
    }

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`)
  }, [])

  const preferredPropertyMode = initialAdminEditorLocation.propertyMode
  const preferredPropertySlug = initialAdminEditorLocation.propertySlug
  const preferredCharterMode = initialAdminEditorLocation.charterMode
  const preferredCharterSlug = initialAdminEditorLocation.charterSlug
  const preferredPageKey = initialAdminEditorLocation.pageKey
  const [activeTab, setActiveTab] = useState(initialAdminEditorLocation.tab)
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', properties: [] })
  const [formState, setFormState] = useState(initialPropertyFormState)
  const [savedFormState, setSavedFormState] = useState(initialPropertyFormState)
  const [editorState, setEditorState] = useState(() => ({
    mode: preferredPropertyMode,
    activeSlug: preferredPropertyMode === 'edit' ? preferredPropertySlug : '',
  }))
  const propertyEditorSessionRef = useRef(0)
  const pageEditorSessionRef = useRef(0)
  const [propertyPreviewViewState, setPropertyPreviewViewState] = useState(() => ({
    key: '',
    mode: 'edit',
  }))
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [propertyPublication, setPropertyPublication] = useState(null)
  const [propertyConflict, setPropertyConflict] = useState(null)
  const propertyEditingEnabled = isPropertyEditingEnabled()
  const propertyUsesFirebase = isFirebasePropertyData()

  const charterEditorSessionRef = useRef(0)
  const [charterWorkspaceState, setCharterWorkspaceState] = useState({ status: 'loading', charters: [] })
  const [charterFormState, setCharterFormState] = useState(initialCharterFormState)
  const [savedCharterFormState, setSavedCharterFormState] = useState(initialCharterFormState)
  const [charterEditorState, setCharterEditorState] = useState(() => ({
    mode: preferredCharterMode,
    activeSlug: preferredCharterMode === 'edit' ? preferredCharterSlug : '',
  }))
  const [charterFeedback, setCharterFeedback] = useState('')
  const [charterSaveStatus, setCharterSaveStatus] = useState('idle')
  const [charterPublication, setCharterPublication] = useState(null)
  const [charterConflict, setCharterConflict] = useState(null)
  const charterEditingEnabled = isCharterEditingEnabled()
  const charterUsesFirebase = isFirebaseCharterData()

  const [siteShellWorkspaceState, setSiteShellWorkspaceState] = useState({
    status: 'loading',
    message: '',
    shell: null,
  })
  const [siteShellDraft, setSiteShellDraft] = useState(null)
  const [siteShellEditedSinceLoad, setSiteShellEditedSinceLoad] = useState(false)
  const [siteShellFeedback, setSiteShellFeedback] = useState('')
  const [siteShellSaveStatus, setSiteShellSaveStatus] = useState('idle')
  const [siteShellPublication, setSiteShellPublication] = useState(null)
  const [siteShellConflict, setSiteShellConflict] = useState(null)

  const [pageWorkspaceState, setPageWorkspaceState] = useState(() => ({
    status: 'loading',
    deletedPages: [],
    inventory: [],
    pages: [],
    message: '',
  }))
  const [pageEditorState, setPageEditorState] = useState(() => ({
    status: 'idle',
    activeKey: preferredPageKey,
    draft: null,
    publishedPage: null,
    savedDraft: null,
  }))
  const [pageFeedback, setPageFeedback] = useState('')
  const [pageSaveStatus, setPageSaveStatus] = useState('idle')
  const [pagePublication, setPagePublication] = useState(null)
  const [pageConflict, setPageConflict] = useState(null)
  const [pageRevisionState, setPageRevisionState] = useState(() => ({
    activeRevisionId: '',
    message: '',
    revisions: [],
    status: 'idle',
  }))
  const [pageRevisionPreview, setPageRevisionPreview] = useState({ id: '', message: '', page: null, status: 'idle' })
  const [newPageForm, setNewPageForm] = useState(null)
  const [newPageStatus, setNewPageStatus] = useState('idle')
  const [newPageError, setNewPageError] = useState('')
  const [pageDeleteStatus, setPageDeleteStatus] = useState('idle')
  const [pageTrashState, setPageTrashState] = useState({ activeKey: '', message: '', status: 'idle' })
  const [pagePreviewDevice, setPagePreviewDevice] = useState('desktop')
  const [pagePreviewViewState, setPagePreviewViewState] = useState(() => ({ key: '', mode: 'edit' }))
  const [selectedPageBlockId, setSelectedPageBlockId] = useState('')
  const [pageContextView, setPageContextView] = useState('')
  const [pageLayoutMetrics, setPageLayoutMetrics] = useState(EMPTY_PAGE_LAYOUT_METRICS)
  const [pageReviewView, setPageReviewView] = useState('')
  const [pageHistoryState, setPageHistoryState] = useState(() => resetPageEditorHistory(preferredPageKey))
  const pageDraftRef = useRef(null)

  const siteContentEditingEnabled = isSiteContentEditingEnabled()
  const requiresAdminSignIn = propertyUsesFirebase || charterUsesFirebase || siteContentEditingEnabled
  const [authState, setAuthState] = useState(() => ({
    status: requiresAdminSignIn ? (isFirebaseConfigured() ? 'loading' : 'unconfigured') : 'disabled',
    user: null,
  }))
  const [authFeedback, setAuthFeedback] = useState('')
  const [authFeedbackStatus, setAuthFeedbackStatus] = useState('idle')

  const propertyLock = useEditLock({
    resourceType: 'property',
    resourceId: editorState.mode === 'edit' ? formState.originalSlug || null : null,
    enabled: propertyUsesFirebase && Boolean(authState.user) && activeTab === 'properties',
  })
  const pageLock = useEditLock({
    resourceType: 'structuredPage',
    resourceId: pageEditorState.activeKey || null,
    enabled: siteContentEditingEnabled && Boolean(authState.user) && activeTab === 'pages',
  })
  const siteShellLock = useEditLock({
    resourceType: 'siteShell',
    resourceId: 'site-shell',
    enabled: siteContentEditingEnabled && Boolean(authState.user) && (activeTab === 'site-shell' || activeTab === 'styles'),
  })
  const charterLock = useEditLock({
    resourceType: 'charter',
    resourceId: charterEditorState.mode === 'edit' ? charterFormState.originalSlug || null : null,
    enabled: charterUsesFirebase && Boolean(authState.user) && activeTab === 'charters',
  })

  const [activeEditLocks, setActiveEditLocks] = useState({})

  useEffect(() => {
    if (!authState.user) {
      return undefined
    }

    let cancelled = false

    async function pollLockStatuses() {
      const requestOptions = await getAdminRequestOptions().catch(() => null)

      if (cancelled || !requestOptions?.authToken) {
        return
      }

      const resourceTypes = [
        propertyUsesFirebase ? 'property' : null,
        siteContentEditingEnabled ? 'structuredPage' : null,
        charterUsesFirebase ? 'charter' : null,
      ].filter(Boolean)

      const results = await Promise.all(
        resourceTypes.map((resourceType) =>
          listEditLockStatuses(resourceType, requestOptions).catch(() => []),
        ),
      )

      if (cancelled) {
        return
      }

      const nextLocks = {}

      const currentUserEmail = String(authState.user?.email ?? '').trim().toLowerCase()
      const currentUserId = String(authState.user?.uid ?? '').trim()

      results.flat().forEach((lock) => {
        if (lock?.resourceType && lock?.resourceId) {
          const lockedByEmail = String(lock.lockedByEmail ?? '').trim()
          const lockedByUserId = String(lock.lockedBy ?? '').trim()

          if (
            (currentUserId && lockedByUserId === currentUserId) ||
            (currentUserEmail && lockedByEmail.toLowerCase() === currentUserEmail)
          ) {
            return
          }

          nextLocks[`${lock.resourceType}:${lock.resourceId}`] = lockedByEmail || ''
        }
      })

      setActiveEditLocks(nextLocks)
    }

    pollLockStatuses()
    const intervalId = setInterval(pollLockStatuses, 10000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      setActiveEditLocks({})
    }
    // getAdminRequestOptions is a new function reference every render; adding it here would defeat the 10s polling interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.user, propertyUsesFirebase, siteContentEditingEnabled, charterUsesFirebase])

  function lockBadgeSuffix(resourceType, resourceId) {
    const lockedByEmail = activeEditLocks[`${resourceType}:${resourceId}`]
    return lockedByEmail ? ` — editing: ${lockedByEmail}` : ''
  }

  const propertyDirty = jsonSnapshot(formState) !== jsonSnapshot(savedFormState)
  const charterDirty = jsonSnapshot(charterFormState) !== jsonSnapshot(savedCharterFormState)
  const siteShellDirty = jsonSnapshot(siteShellDraft) !== jsonSnapshot(siteShellWorkspaceState.shell)
  const pageDirty = useMemo(
    () => jsonSnapshot(pageEditorState.draft) !== jsonSnapshot(pageEditorState.savedDraft),
    [pageEditorState.draft, pageEditorState.savedDraft],
  )
  const deferredPageDraft = useDeferredValue(pageEditorState.draft)
  const propertyPreviewEditorKey = formState.originalSlug || 'new-property'
  const propertyPreviewModeKey = `${activeTab === 'properties' ? 'properties' : 'hidden'}:${propertyPreviewEditorKey}`
  const propertyPreviewMode = propertyPreviewViewState.key === propertyPreviewModeKey ? propertyPreviewViewState.mode : 'edit'

  useEffect(() => {
    pageDraftRef.current = pageEditorState.draft
  }, [pageEditorState.draft])

  useEffect(() => {
    persistAdminEditorLocation({
      tab: activeTab,
      pageKey: pageEditorState.activeKey,
      propertyMode: editorState.mode,
      propertySlug: editorState.mode === 'edit' ? editorState.activeSlug : '',
      charterMode: charterEditorState.mode,
      charterSlug: charterEditorState.mode === 'edit' ? charterEditorState.activeSlug : '',
    })
  }, [
    activeTab,
    charterEditorState.activeSlug,
    charterEditorState.mode,
    editorState.activeSlug,
    editorState.mode,
    pageEditorState.activeKey,
  ])

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

        if (preferredPropertyMode === 'create') {
          const nextFormState = createEmptyFormState()
          setEditorState({ mode: 'create', activeSlug: '' })
          setFormState(nextFormState)
          setSavedFormState(nextFormState)
          setPropertyPublication(null)
          return
        }

        const preferredProperty = preferredPropertySlug ? findRecordByRouteSlug(properties, preferredPropertySlug) : properties[0]

        if (preferredProperty) {
          const nextFormState = createFormState(preferredProperty)
          setEditorState({ mode: 'edit', activeSlug: preferredProperty.slug })
          setFormState(nextFormState)
          setSavedFormState(nextFormState)
          setPropertyPublication(preferredProperty.publication ?? null)
          return
        }

        const nextFormState = createEmptyFormState()
        setEditorState({ mode: 'create', activeSlug: '' })
        setFormState(nextFormState)
        setSavedFormState(nextFormState)
        setPropertyPublication(null)
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
  }, [authState.status, authState.user, preferredPropertyMode, preferredPropertySlug, propertyUsesFirebase, requiresAdminSignIn])

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

        if (preferredCharterMode === 'create') {
          const nextFormState = createEmptyCharterFormState()
          setCharterEditorState({ mode: 'create', activeSlug: '' })
          setCharterFormState(nextFormState)
          setSavedCharterFormState(nextFormState)
          setCharterPublication(null)
          return
        }

        const preferredCharter = preferredCharterSlug ? findRecordByRouteSlug(charters, preferredCharterSlug) : charters[0]

        if (preferredCharter) {
          const nextFormState = createCharterFormState(preferredCharter)
          setCharterEditorState({ mode: 'edit', activeSlug: preferredCharter.slug })
          setCharterFormState(nextFormState)
          setSavedCharterFormState(nextFormState)
          setCharterPublication(preferredCharter.publication ?? null)
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
  }, [authState.status, authState.user, charterUsesFirebase, preferredCharterMode, preferredCharterSlug, requiresAdminSignIn])

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
        setSiteShellEditedSinceLoad(false)
        setSiteShellPublication(response.publication ?? null)
      } catch (error) {
        if (!cancelled) {
          setSiteShellWorkspaceState({
            status: 'error',
            shell: null,
            message: error instanceof Error ? error.message : 'Unable to load the site shell.',
          })
          setSiteShellDraft(null)
          setSiteShellEditedSinceLoad(false)
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
        const deletedPages = Array.isArray(directory?.deletedPages) ? directory.deletedPages : []

        setPageWorkspaceState({
          status: 'ready',
          deletedPages,
          inventory,
          pages,
          message: '',
        })

        const nextPageKey = (preferredPageKey ? pages.find((page) => page.key === preferredPageKey)?.key : '') || pages[0]?.key || ''

        if (!nextPageKey) {
          setPageEditorState({ status: 'idle', activeKey: '', draft: null, publishedPage: null, savedDraft: null })
          setPagePublication(null)
          setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })
          return
        }

        setPageRevisionState((current) => ({ ...current, activeRevisionId: '', message: '', status: 'loading' }))

        const [page, nextRevisionState] = await Promise.all([
          fetchAdminStructuredPageContent(nextPageKey, requestOptions),
          loadPageRevisionState(nextPageKey, requestOptions),
        ])

        if (cancelled) {
          return
        }

        setPageEditorState({
          status: 'ready',
          activeKey: nextPageKey,
          draft: page?.page ?? {},
          publishedPage: page?.publishedPage ?? null,
          savedDraft: page?.page ?? {},
        })
        setPagePublication(page?.publication ?? null)
        setPageRevisionState(nextRevisionState)
      } catch (error) {
        if (!cancelled) {
          setPageWorkspaceState({
            status: 'error',
            deletedPages: [],
            inventory: [],
            pages: [],
            message: error instanceof Error ? error.message : 'Unable to load structured pages.',
          })
          setPageEditorState({ status: 'error', activeKey: '', draft: null, publishedPage: null, savedDraft: null })
          setPagePublication(null)
          setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })
        }
      }
    }

    loadStructuredPagesWorkspace()

    return () => {
      cancelled = true
    }
  }, [authState.status, authState.user, preferredPageKey, requiresAdminSignIn])

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

  function confirmLivePageNavigation() {
    if (!propertyDirty && !charterDirty && !pageDirty && !siteShellDirty) {
      return true
    }

    return window.confirm('You have unsaved admin edits. View the live page and discard those changes?')
  }

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
      setSiteShellEditedSinceLoad(false)
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

    pageEditorSessionRef.current += 1

    try {
      setPageConflict(null)
      setPageRevisionPreview({ id: '', message: '', page: null, status: 'idle' })
      setSelectedPageBlockId('')
      setPageContextView('')
      setPageLayoutMetrics(EMPTY_PAGE_LAYOUT_METRICS)
      setPageReviewView('')
      setPageHistoryState(resetPageEditorHistory(pageKey))
      setPageEditorState((current) => ({ ...current, status: 'loading', activeKey: pageKey }))
      setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })
      const requestOptions = await getAdminRequestOptions()
      const page = await fetchAdminStructuredPageContent(pageKey, requestOptions)
      setPageEditorState({
        status: 'ready',
        activeKey: pageKey,
        draft: page?.page ?? {},
        publishedPage: page?.publishedPage ?? null,
        savedDraft: page?.page ?? {},
      })
      setPageHistoryState(resetPageEditorHistory(pageKey))
      setPagePublication(page?.publication ?? null)
      setPageFeedback('')
      setPageSaveStatus('idle')
    } catch (error) {
      setSelectedPageBlockId('')
      setPageContextView('')
      setPageLayoutMetrics(EMPTY_PAGE_LAYOUT_METRICS)
      setPageReviewView('')
      setPageHistoryState(resetPageEditorHistory(pageKey))
      setPageEditorState({ status: 'error', activeKey: pageKey, draft: null, publishedPage: null, savedDraft: null })
      setPageFeedback(error instanceof Error ? error.message : 'Unable to load the structured page.')
      setPageSaveStatus('error')
      setPagePublication(null)
      setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })
    }
  }

  async function reloadStructuredPageWorkspace(preferredKey = '', { sessionToken = null } = {}) {
    const requestOptions = await getAdminRequestOptions()
    const directory = await fetchAdminStructuredPageDirectory(requestOptions)
    const inventory = Array.isArray(directory?.inventory) ? directory.inventory : []
    const pages = Array.isArray(directory?.pages) ? directory.pages : []
    const deletedPages = Array.isArray(directory?.deletedPages) ? directory.deletedPages : []
    const nextKey = preferredKey || pages[0]?.key || ''

    setPageWorkspaceState({
      status: 'ready',
      deletedPages,
      inventory,
      pages,
      message: '',
    })

    // If the caller is applying the result of a save/publish for a specific editor
    // session, and the admin has since switched to a different page, skip overwriting
    // the now-active editor with this stale result.
    if (sessionToken !== null && pageEditorSessionRef.current !== sessionToken) {
      return null
    }

    if (!nextKey) {
      setSelectedPageBlockId('')
      setPageContextView('')
      setPageLayoutMetrics(EMPTY_PAGE_LAYOUT_METRICS)
      setPageReviewView('')
      setPageHistoryState(resetPageEditorHistory(''))
      setPageEditorState({ status: 'idle', activeKey: '', draft: null, publishedPage: null, savedDraft: null })
      setPagePublication(null)
      setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })
      setPageRevisionPreview({ id: '', message: '', page: null, status: 'idle' })
      return null
    }

    setPageRevisionState({ activeRevisionId: '', message: '', revisions: [], status: 'idle' })

    const page = await fetchAdminStructuredPageContent(nextKey, requestOptions)

    if (sessionToken !== null && pageEditorSessionRef.current !== sessionToken) {
      return null
    }

    const nextDraft = page?.page ?? pages.find((entry) => entry.key === nextKey) ?? {}

    setPageEditorState({
      status: 'ready',
      activeKey: nextKey,
      draft: nextDraft,
      publishedPage: page?.publishedPage ?? null,
      savedDraft: nextDraft,
    })
    setSelectedPageBlockId('')
    setPageContextView('')
    setPageLayoutMetrics(EMPTY_PAGE_LAYOUT_METRICS)
    setPageReviewView('')
    setPageHistoryState(resetPageEditorHistory(nextKey))
    setPagePublication(page?.publication ?? null)
    setPageRevisionPreview({ id: '', message: '', page: null, status: 'idle' })

    return page
  }

  function openCreateForm() {
    propertyEditorSessionRef.current += 1
    const nextFormState = createEmptyFormState()
    setEditorState({ mode: 'create', activeSlug: '' })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(null)
    setFeedback('')
  }

  function openEditForm(property) {
    propertyEditorSessionRef.current += 1
    const nextFormState = createFormState(property)
    setEditorState({ mode: 'edit', activeSlug: property.slug })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(property.publication ?? null)
    setFeedback('')
  }

  function confirmDiscardPropertyChangesIfNeeded() {
    if (!propertyDirty) {
      return true
    }

    return window.confirm('You have unsaved property edits. Switch properties and discard those changes?')
  }

  function updateFormState(field, value) {
    setFormState((currentState) => {
      if (field && typeof field === 'object' && !Array.isArray(field)) {
        return {
          ...currentState,
          ...field,
        }
      }

      if (field === 'slug') {
        return {
          ...currentState,
          slug: createRouteSlugCandidate(value),
        }
      }

      if (field === 'name' && editorState.mode === 'create') {
        const previousGeneratedSlug = createRouteSlugCandidate(currentState.name)
        const currentSlug = String(currentState.slug ?? '').trim()
        const nextGeneratedSlug = createRouteSlugCandidate(value)
        const shouldRefreshSlug = !currentSlug || currentSlug === previousGeneratedSlug

        return {
          ...currentState,
          name: value,
          slug: shouldRefreshSlug ? nextGeneratedSlug : currentState.slug,
        }
      }

      if (field === 'shortDescription') {
        return {
          ...currentState,
          shortDescription: mergePropertyShortDescription(currentState, value),
        }
      }

      if (field === 'bedrooms') {
        const bedrooms = normalizeBedroomCount(value)
        const alternateBedroomCounts = normalizeAlternateBedroomCounts(currentState.alternateBedroomCounts, bedrooms)
        const rentFewerRooms = currentState.rentFewerRooms && bedrooms > 1
        const nextState = {
          ...currentState,
          bedrooms: value,
          rentFewerRooms,
          alternateBedroomCounts,
        }

        return {
          ...nextState,
          shortDescription: mergePropertyShortDescription(nextState, currentState.shortDescription),
        }
      }

      if (field === 'rentFewerRooms') {
        const bedrooms = normalizeBedroomCount(currentState.bedrooms)

        return {
          ...currentState,
          rentFewerRooms: Boolean(value) && bedrooms > 1,
          alternateBedroomCounts: Boolean(value) && bedrooms > 1 ? currentState.alternateBedroomCounts : [],
        }
      }

      if (field === 'alternateBedroomCounts') {
        return {
          ...currentState,
          alternateBedroomCounts: normalizeAlternateBedroomCounts(value, currentState.bedrooms),
        }
      }

      if (field === 'location') {
        const nextState = {
          ...currentState,
          location: value,
        }

        return {
          ...nextState,
          shortDescription: mergePropertyShortDescription(nextState, currentState.shortDescription, {
            generatedLocations: [currentState.location, value],
          }),
        }
      }

      if (field === 'bathrooms' || field === 'maxGuests') {
        const nextState = {
          ...currentState,
          [field]: value,
        }

        return {
          ...nextState,
          shortDescription: mergePropertyShortDescription(nextState, currentState.shortDescription),
        }
      }

      return {
        ...currentState,
        [field]: value,
      }
    })
  }

  function updateGalleryImage(imageId, field, value) {
    setFormState((currentState) => ({
      ...currentState,
      galleryImages: currentState.galleryImages.map((image) =>
        image.id === imageId
          ? {
              ...image,
              ...(field && typeof field === 'object' && !Array.isArray(field) ? field : { [field]: value }),
            }
          : image,
      ),
    }))
  }

  function addGalleryImage(nextUrl = '', entry = null) {
    const normalizedUrl = String(nextUrl ?? entry?.managedUrl ?? entry?.url ?? '').trim()
    const image = createImageEditor({
      alt: repairSnapshotText(entry?.alt ?? ''),
      fileName: entry?.fileName,
      originalFileName: entry?.originalFileName,
      storagePath: entry?.storagePath,
      title: repairSnapshotText(entry?.title ?? ''),
      url: normalizedUrl,
    })

    setFormState((currentState) => ({
      ...currentState,
      galleryImages: [...currentState.galleryImages, image],
    }))
  }

  function addGalleryImagesFromFolder(entries = []) {
    const galleryImagesToAdd = (Array.isArray(entries) ? entries : [])
      .map((entry) => ({
        alt: repairSnapshotText(entry?.alt ?? ''),
        fileName: String(entry?.fileName ?? '').trim(),
        originalFileName: String(entry?.originalFileName ?? '').trim(),
        storagePath: String(entry?.storagePath ?? '').trim(),
        title: repairSnapshotText(entry?.title ?? ''),
        url: String(entry?.managedUrl ?? entry?.url ?? '').trim(),
      }))
      .filter((image) => image.url)

    if (galleryImagesToAdd.length === 0) {
      return
    }

    setFormState((currentState) => {
      const existingUrls = new Set(currentState.galleryImages.map((image) => String(image?.url ?? '').trim()).filter(Boolean))
      const nextGalleryImages = galleryImagesToAdd
        .filter((image) => !existingUrls.has(image.url))
        .map((image) => createImageEditor(image))

      if (nextGalleryImages.length === 0) {
        return currentState
      }

      return {
        ...currentState,
        galleryImages: [...currentState.galleryImages, ...nextGalleryImages],
      }
    })
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
        amenityGroups: nextGroups.length > 0 ? nextGroups : [createAmenityEditor()],
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
    const sessionAtStart = propertyEditorSessionRef.current

    try {
      setSaveStatus('saving')
      setPropertyConflict(null)
      const editorMode = editorState.mode
      const formStateToPersist = {
        ...nextFormState,
        shortDescription: mergePropertyShortDescription(nextFormState, nextFormState.shortDescription),
      }
      const requestOptions = propertyUsesFirebase
        ? { ...(await getAdminRequestOptions()), expectedUpdatedAt: editorMode === 'edit' ? propertyPublication?.savedAt ?? null : null }
        : {}
      const savedProperty = await saveAdminProperty(
        buildValidatedPropertyDraft(formStateToPersist),
        editorMode === 'edit' ? formStateToPersist.originalSlug : '',
        requestOptions,
      )
      const properties = await listAllProperties(requestOptions)
      setWorkspaceState({ status: 'ready', properties })

      if (propertyEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different property draft; don't clobber it with this save's result.
        setSaveStatus('idle')
        return savedProperty
      }

      const persistedFormState = createFormState(savedProperty)
      setEditorState({ mode: 'edit', activeSlug: savedProperty.slug })
      setFormState(persistedFormState)
      setSavedFormState(persistedFormState)
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

      if (error?.status === 409 && error?.payload?.latest) {
        setPropertyConflict(error.payload.latest)
        setFeedback('Someone else saved changes to this property since you loaded it. Load the latest version to continue.')
        return null
      }

      setFeedback(error instanceof Error ? error.message : 'Unable to save property changes.')
      return null
    }
  }

  function handleLoadLatestProperty() {
    if (!propertyConflict) {
      return
    }

    openEditForm(propertyConflict)
    setPropertyConflict(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!propertyDirty) {
      return
    }

    await persistPropertyForm(formState)
  }

  async function handlePublishProperty() {
    const sessionAtStart = propertyEditorSessionRef.current

    try {
      setSaveStatus('publishing')
      setPropertyConflict(null)
      const requestOptions = propertyUsesFirebase
        ? { ...(await getAdminRequestOptions()), expectedUpdatedAt: propertyPublication?.savedAt ?? null }
        : {}
      const publishedProperty = await publishAdminProperty(formState.originalSlug, requestOptions)
      const properties = await listAllProperties(requestOptions)
      setWorkspaceState({ status: 'ready', properties })

      if (propertyEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different property draft; don't clobber it with this publish's result.
        setSaveStatus('idle')
        return
      }

      const nextFormState = createFormState(publishedProperty)
      setEditorState({ mode: 'edit', activeSlug: publishedProperty.slug })
      setFormState(nextFormState)
      setSavedFormState(nextFormState)
      setPropertyPublication(publishedProperty.publication ?? null)
      setFeedback(`Published ${publishedProperty.name} live.`)
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')

      if (error?.status === 409 && error?.payload?.latest) {
        setPropertyConflict(error.payload.latest)
        setFeedback('Someone else saved changes to this property since you loaded it. Load the latest version to continue.')
        return
      }

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
      setFeedback(`This draft will be created as ${nextActive ? 'active' : 'inactive'}.`)
      return
    }

    if (!propertyUsesFirebase) {
      await persistPropertyForm(
        {
          ...formState,
          active: nextActive,
        },
        `${nextActive ? 'Activated' : 'Deactivated'} ${formState.name || 'this property'} in the draft.`,
      )
      return
    }

    const sessionAtStart = propertyEditorSessionRef.current

    try {
      setSaveStatus('saving')
      setPropertyConflict(null)
      const requestOptions = await getAdminRequestOptions()
      const hadUnsavedChanges = propertyDirty
      let expectedUpdatedAt = propertyPublication?.savedAt ?? null
      let currentFormState = {
        ...formState,
        active: nextActive,
      }

      if (hadUnsavedChanges) {
        const savedDraftProperty = await saveAdminProperty(
          buildValidatedPropertyDraft(currentFormState),
          currentFormState.originalSlug,
          { ...requestOptions, expectedUpdatedAt: propertyPublication?.savedAt ?? null },
        )

        currentFormState = createFormState(savedDraftProperty)
        expectedUpdatedAt = savedDraftProperty?.publication?.savedAt ?? null
      }

      const updatedProperty = await setAdminPropertyActiveState(currentFormState.originalSlug, nextActive, {
        ...requestOptions,
        expectedUpdatedAt,
      })
      const properties = await listAllProperties(requestOptions)
      setWorkspaceState({ status: 'ready', properties })

      if (propertyEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different property draft; don't clobber it with this toggle's result.
        setSaveStatus('idle')
        return
      }

      const nextFormState = createFormState(updatedProperty)

      setEditorState({ mode: 'edit', activeSlug: updatedProperty.slug })
      setFormState(nextFormState)
      setSavedFormState(nextFormState)
      setPropertyPublication(updatedProperty.publication ?? null)
      setFeedback(
        `${nextActive ? 'Activated' : 'Deactivated'} ${updatedProperty.name || 'this property'} live.${
          hadUnsavedChanges ? ' Other draft changes remain unpublished.' : ''
        }`,
      )
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')

      if (error?.status === 409 && error?.payload?.latest) {
        setPropertyConflict(error.payload.latest)
        setFeedback('Someone else saved changes to this property since you loaded it. Load the latest version to continue.')
        return
      }

      setFeedback(error instanceof Error ? error.message : 'Unable to update property visibility.')
    }
  }

  async function handleDeleteProperty() {
    if (editorState.mode !== 'edit' || !formState.originalSlug) {
      return
    }

    const propertyName = formState.name || formState.originalSlug
    const confirmationMessage = `Delete ${propertyName} from the property catalog? This removes the saved draft and any published version.`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    try {
      setSaveStatus('saving')
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      await deleteAdminProperty(formState.originalSlug, requestOptions)
      const properties = await listAllProperties(requestOptions)

      setWorkspaceState({ status: 'ready', properties })

      if (properties.length > 0) {
        const nextFormState = createFormState(properties[0])
        setEditorState({ mode: 'edit', activeSlug: properties[0].slug })
        setFormState(nextFormState)
        setSavedFormState(nextFormState)
        setPropertyPublication(properties[0].publication ?? null)
      } else {
        const nextFormState = createEmptyFormState()
        setEditorState({ mode: 'create', activeSlug: '' })
        setFormState(nextFormState)
        setSavedFormState(nextFormState)
        setPropertyPublication(null)
      }

      setFeedback(`Deleted ${propertyName}.`)
      setSaveStatus('idle')
    } catch (error) {
      setSaveStatus('error')
      setFeedback(error instanceof Error ? error.message : 'Unable to delete the property.')
    }
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

  function confirmDiscardCharterChangesIfNeeded() {
    if (!charterDirty) {
      return true
    }

    return window.confirm('You have unsaved charter edits. Switch charters and discard those changes?')
  }

  function openCreateCharterForm() {
    charterEditorSessionRef.current += 1
    const nextFormState = createEmptyCharterFormState()
    setCharterEditorState({ mode: 'create', activeSlug: '' })
    setCharterFormState(nextFormState)
    setSavedCharterFormState(nextFormState)
    setCharterPublication(null)
    setCharterFeedback('')
  }

  function openEditCharterForm(charter) {
    charterEditorSessionRef.current += 1
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

    const sessionAtStart = charterEditorSessionRef.current

    try {
      setCharterSaveStatus('saving')
      setCharterConflict(null)
      const requestOptions = charterUsesFirebase
        ? {
            ...(await getAdminRequestOptions()),
            expectedUpdatedAt: charterEditorState.mode === 'edit' ? charterPublication?.savedAt ?? null : null,
          }
        : {}
      const saved = await saveAdminCharter(
        buildCharterDraft(charterFormState),
        charterEditorState.mode === 'edit' ? charterFormState.originalSlug : '',
        requestOptions,
      )
      const charters = await listAllCharters(requestOptions)
      setCharterWorkspaceState({ status: 'ready', charters })

      if (charterEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different charter draft; don't clobber it with this save's result.
        setCharterSaveStatus('idle')
        return
      }

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

      if (error?.status === 409 && error?.payload?.latest) {
        setCharterConflict(error.payload.latest)
        setCharterFeedback('Someone else saved changes to this charter since you loaded it. Load the latest version to continue.')
        return
      }

      setCharterFeedback(error instanceof Error ? error.message : 'Unable to save charter changes.')
    }
  }

  function handleLoadLatestCharter() {
    if (!charterConflict) {
      return
    }

    openEditCharterForm(charterConflict)
    setCharterConflict(null)
  }

  async function handlePublishCharter() {
    const sessionAtStart = charterEditorSessionRef.current

    try {
      setCharterSaveStatus('publishing')
      setCharterConflict(null)
      const requestOptions = charterUsesFirebase
        ? { ...(await getAdminRequestOptions()), expectedUpdatedAt: charterPublication?.savedAt ?? null }
        : {}
      const publishedCharter = await publishAdminCharter(charterFormState.originalSlug, requestOptions)
      const charters = await listAllCharters(requestOptions)
      setCharterWorkspaceState({ status: 'ready', charters })

      if (charterEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different charter draft; don't clobber it with this publish's result.
        setCharterSaveStatus('idle')
        return
      }

      const nextFormState = createCharterFormState(publishedCharter)
      setCharterEditorState({ mode: 'edit', activeSlug: publishedCharter.slug })
      setCharterFormState(nextFormState)
      setSavedCharterFormState(nextFormState)
      setCharterPublication(publishedCharter.publication ?? null)
      setCharterFeedback(`Published ${publishedCharter.name} live.`)
      setCharterSaveStatus('idle')
    } catch (error) {
      setCharterSaveStatus('error')

      if (error?.status === 409 && error?.payload?.latest) {
        setCharterConflict(error.payload.latest)
        setCharterFeedback('Someone else saved changes to this charter since you loaded it. Load the latest version to continue.')
        return
      }

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

    if (!confirmDiscardPropertyChangesIfNeeded()) {
      return
    }

    if (!selectedSlug) {
      openCreateForm()
      return
    }

    const selectedProperty = properties.find((property) => property.slug === selectedSlug)

    if (selectedProperty) {
      openEditForm(selectedProperty)
    }
  }

  function handleNewPropertyClick() {
    if (!confirmDiscardPropertyChangesIfNeeded()) {
      return
    }

    openCreateForm()
  }

  function handleCharterSelectionChange(event) {
    const selectedSlug = String(event.target.value ?? '').trim()

    if (!confirmDiscardCharterChangesIfNeeded()) {
      return
    }

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

  function handleSiteShellDraftChange(updater) {
    setSiteShellEditedSinceLoad(true)
    setSiteShellDraft(updater)
  }

  function handleStructuredPageDraftChange(updater, historyOptions = {}) {
    const previousDraft = pageDraftRef.current
    const nextDraft = typeof updater === 'function' ? updater(previousDraft) : updater
    const comparisonPath = Array.isArray(historyOptions.path) ? historyOptions.path : null
    const previousValue = comparisonPath ? getSnapshotValueAtPath(previousDraft, comparisonPath) : previousDraft
    const nextValue = comparisonPath ? getSnapshotValueAtPath(nextDraft, comparisonPath) : nextDraft

    if (jsonSnapshot(previousValue) === jsonSnapshot(nextValue)) {
      return
    }

    setPageHistoryState((currentHistory) =>
      recordPageEditorHistory(currentHistory, {
        activeKey: pageEditorState.activeKey,
        ...historyOptions,
        nextDraft,
        previousDraft,
      }),
    )
    pageDraftRef.current = nextDraft
    setPageEditorState((current) => ({
      ...current,
      draft: nextDraft,
    }))
  }

  function updateStructuredPageDraftPath(path, nextValue) {
    handleStructuredPageDraftChange((currentDraft) => updateValueAtPath(currentDraft ?? {}, path, nextValue), {
      coalesce: typeof nextValue === 'string' || typeof nextValue === 'number',
      path,
    })
  }

  function handleStructuredPageValidationIssue(issue) {
    const entries = collectBlockOutlineEntries(pageEditorState.draft?.blocks)
    const owner = findValidationIssueOwner(issue, entries)

    setPagePreviewViewState({ key: pagePreviewModeKey, mode: 'edit' })
    setSelectedPageBlockId(owner?.selectionId ?? '')
    setPageContextView(owner?.selectionId ? '' : 'settings')
  }

  function handlePageEditorNodeSelection(selectionId) {
    setSelectedPageBlockId(selectionId)
    setPageContextView((currentView) => (selectionId ? (currentView === 'layout' ? 'layout' : '') : ''))
  }

  function openStructuredPageSettings() {
    setSelectedPageBlockId('')
    setPageContextView('settings')
  }

  function clearStructuredPageSelection() {
    setSelectedPageBlockId('')
    setPageContextView('')
  }


  function applyStructuredPageHistoryResult(result, feedbackMessage) {
    if (!result?.changed) {
      return
    }

    pageDraftRef.current = result.draft
    setPageHistoryState(result.history)
    setPageEditorState((current) => ({
      ...current,
      draft: result.draft,
    }))
    setSelectedPageBlockId('')
    setPageContextView('')
    setPageSaveStatus('idle')
    setPageFeedback(feedbackMessage)
  }

  function handleUndoStructuredPageEdit() {
    if (!pageDraftEditingEnabled) {
      return
    }

    applyStructuredPageHistoryResult(
      undoPageEditorHistory(pageHistoryState, {
        activeKey: pageEditorState.activeKey,
        currentDraft: pageDraftRef.current,
      }),
      'Undid the last page edit.',
    )
  }

  function handleRedoStructuredPageEdit() {
    if (!pageDraftEditingEnabled) {
      return
    }

    applyStructuredPageHistoryResult(
      redoPageEditorHistory(pageHistoryState, {
        activeKey: pageEditorState.activeKey,
        currentDraft: pageDraftRef.current,
      }),
      'Redid the page edit.',
    )
  }

  async function saveSiteShellDraft() {
    try {
      setSiteShellSaveStatus('saving')
      setSiteShellConflict(false)
      const requestOptions = { ...(await getAdminRequestOptions()), expectedUpdatedAt: siteShellPublication?.savedAt ?? null }
      const savedSiteShell = await saveAdminSiteShellContent(siteShellDraft ?? {}, requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: savedSiteShell.siteShell, message: '' })
      setSiteShellDraft(savedSiteShell.siteShell)
      setSiteShellPublication(savedSiteShell.publication ?? null)
      setSiteShellFeedback('Saved draft changes to the site shell.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')

      if (error?.status === 409) {
        setSiteShellConflict(true)
        setSiteShellFeedback('Someone else saved changes to the site shell since you loaded it. Load the latest version to continue.')
        return
      }

      setSiteShellFeedback(error instanceof Error ? error.message : 'Unable to save the site shell.')
    }
  }

  async function handleLoadLatestSiteShell() {
    await loadCurrentSiteShellIntoEditor()
    setSiteShellConflict(false)
  }

  async function handleSiteShellSubmit(event) {
    event.preventDefault()

    if (!siteShellDirty && hasPendingPublication(siteShellPublication)) {
      await handlePublishSiteShell()
      return
    }

    await saveSiteShellDraft()
  }

  async function handlePublishSiteShell() {
    try {
      setSiteShellSaveStatus('publishing')
      setSiteShellConflict(false)
      const requestOptions = { ...(await getAdminRequestOptions()), expectedUpdatedAt: siteShellPublication?.savedAt ?? null }
      const publishedSiteShell = await publishAdminSiteShellContent(requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: publishedSiteShell.siteShell, message: '' })
      setSiteShellDraft(publishedSiteShell.siteShell)
      setSiteShellEditedSinceLoad(false)
      setSiteShellPublication(publishedSiteShell.publication ?? null)
      setSiteShellFeedback('Published the site shell live.')
      setSiteShellSaveStatus('idle')
    } catch (error) {
      setSiteShellSaveStatus('error')

      if (error?.status === 409) {
        setSiteShellConflict(true)
        setSiteShellFeedback('Someone else saved changes to the site shell since you loaded it. Load the latest version to continue.')
        return
      }

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
    setSiteShellEditedSinceLoad(false)
    setSiteShellSaveStatus('idle')
    setSiteShellFeedback('Restored the last saved shell draft.')
  }

  function captureStructuredPageConflict(error, operation) {
    const latest = normalizeAdminStructuredPageConflict(error?.payload)

    setPageConflict({
      latest: latest?.page ? latest : null,
      localDraft: cloneSnapshotValue(pageDraftRef.current),
      operation,
    })
    setPageFeedback('This page changed after you loaded it. Compare both versions before deciding which draft to keep.')
  }

  async function handleStructuredPageSubmit(event) {
    event.preventDefault()

    if (!pageEditorState.activeKey || !pageDirty) {
      return
    }

    if (!pageLock.isReady) {
      setPageSaveStatus('error')
      setPageFeedback(pageLock.message || 'Wait until this editor has secured the page lock before saving.')
      return
    }

    const currentPageValidation = validateEditorBlockPageDraft(pageEditorState.draft, {
      activeKey: pageEditorState.activeKey,
      routeInventory: pageWorkspaceState.inventory,
      structuredPages: pageWorkspaceState.pages,
    })

    if (currentPageValidation.applies && !currentPageValidation.valid) {
      setPageSaveStatus('error')
      setPageFeedback('Fix page check errors before saving.')
      return
    }

    const sessionAtStart = pageEditorSessionRef.current

    try {
      setPageSaveStatus('saving')
      setPageConflict(null)
      const requestOptions = {
        ...(await getAdminRequestOptions()),
        editLeaseId: pageLock.leaseId,
        expectedUpdatedAt: pagePublication?.savedAt ?? null,
      }
      const savedPage = await saveAdminStructuredPageContent(pageEditorState.activeKey, pageEditorState.draft ?? {}, requestOptions)
      await reloadStructuredPageWorkspace(savedPage?.page?.key ?? pageEditorState.activeKey, { sessionToken: sessionAtStart })

      if (pageEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different page; don't clobber it with this save's result.
        setPageSaveStatus('idle')
        return
      }

      setPageFeedback(`Saved draft changes to ${savedPage?.page?.navLabel || savedPage?.page?.key || pageEditorState.activeKey}.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')

      if (error?.status === 409) {
        captureStructuredPageConflict(error, 'save')
        return
      }

      setPageFeedback(error instanceof Error ? error.message : 'Unable to save the structured page.')
    }
  }

  async function handleLoadLatestStructuredPage() {
    if (!pageEditorState.activeKey) {
      return
    }

    await loadStructuredPageIntoEditor(pageEditorState.activeKey)
    setPageConflict(null)
  }

  function handleUseLatestStructuredPageConflict() {
    const latest = pageConflict?.latest

    if (!latest?.page) {
      handleLoadLatestStructuredPage()
      return
    }

    const latestDraft = cloneSnapshotValue(latest.page)
    setPageEditorState((current) => ({
      ...current,
      draft: latestDraft,
      publishedPage: cloneSnapshotValue(latest.publishedPage),
      savedDraft: cloneSnapshotValue(latest.page),
      status: 'ready',
    }))
    pageDraftRef.current = latestDraft
    setPagePublication(latest.publication ?? null)
    setPageHistoryState(resetPageEditorHistory(pageEditorState.activeKey))
    setSelectedPageBlockId('')
    setPageContextView('')
    setPageConflict(null)
    setPageSaveStatus('idle')
    setPageFeedback('Loaded the latest saved version. Your previous local draft was not saved.')
  }

  function handleKeepLocalStructuredPageConflict() {
    const latest = pageConflict?.latest
    const localDraft = pageConflict?.localDraft

    if (!latest?.page || !localDraft) {
      return
    }

    const rebasedDraft = cloneSnapshotValue(localDraft)
    setPageEditorState((current) => ({
      ...current,
      draft: rebasedDraft,
      publishedPage: cloneSnapshotValue(latest.publishedPage),
      savedDraft: cloneSnapshotValue(latest.page),
      status: 'ready',
    }))
    pageDraftRef.current = rebasedDraft
    setPagePublication(latest.publication ?? null)
    setPageHistoryState(resetPageEditorHistory(pageEditorState.activeKey))
    setPageConflict(null)
    setPageSaveStatus('idle')
    setPageFeedback('Kept your local draft on top of the latest saved version. Review the comparison, then save explicitly.')
  }

  function handleDownloadStructuredPageConflictDraft() {
    const localDraft = pageConflict?.localDraft

    if (!localDraft) {
      return
    }

    const blob = new Blob([`${JSON.stringify(localDraft, null, 2)}\n`], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${pageEditorState.activeKey || 'page'}-local-draft.json`
    link.href = downloadUrl
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  async function handlePublishStructuredPage() {
    if (!pageEditorState.activeKey) {
      return
    }

    if (pageDirty) {
      setPageSaveStatus('error')
      setPageFeedback('Save the current draft before publishing it live.')
      return
    }

    if (!pageLock.isReady) {
      setPageSaveStatus('error')
      setPageFeedback(pageLock.message || 'Wait until this editor has secured the page lock before publishing.')
      return
    }

    const currentPageValidation = validateEditorBlockPageDraft(pageEditorState.draft, {
      activeKey: pageEditorState.activeKey,
      routeInventory: pageWorkspaceState.inventory,
      structuredPages: pageWorkspaceState.pages,
    })

    if (currentPageValidation.applies && !currentPageValidation.valid) {
      setPageSaveStatus('error')
      setPageFeedback('Fix page check errors before publishing.')
      return
    }

    const sessionAtStart = pageEditorSessionRef.current

    try {
      setPageSaveStatus('publishing')
      setPageConflict(null)
      const requestOptions = {
        ...(await getAdminRequestOptions()),
        editLeaseId: pageLock.leaseId,
        expectedUpdatedAt: pagePublication?.savedAt ?? null,
      }
      const publishedPage = await publishAdminStructuredPageContent(pageEditorState.activeKey, requestOptions)
      await reloadStructuredPageWorkspace(publishedPage?.page?.key ?? pageEditorState.activeKey, { sessionToken: sessionAtStart })

      if (pageEditorSessionRef.current !== sessionAtStart) {
        // The editor has since switched to a different page; don't clobber it with this publish's result.
        setPageSaveStatus('idle')
        return
      }

      setPageFeedback(`Published ${publishedPage?.page?.navLabel || publishedPage?.page?.key || pageEditorState.activeKey} live.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')

      if (error?.status === 409) {
        captureStructuredPageConflict(error, 'publish')
        return
      }

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
    setSelectedPageBlockId('')
    setPageContextView('')
    setPageHistoryState(resetPageEditorHistory(pageEditorState.activeKey))
    setPageSaveStatus('idle')
    setPageFeedback(`Restored the last saved draft for ${selectedStructuredPage?.navLabel || selectedStructuredPage?.key || 'this page'}.`)
  }

  async function handleRefreshStructuredPageRevisions() {
    if (!pageEditorState.activeKey) {
      return
    }

    try {
      setPageRevisionState((current) => ({ ...current, activeRevisionId: '', message: '', status: 'loading' }))

      const requestOptions = await getAdminRequestOptions()
      const nextRevisionState = await loadPageRevisionState(pageEditorState.activeKey, requestOptions)
      setPageRevisionState(nextRevisionState)
    } catch (error) {
      setPageRevisionState((current) => ({
        ...current,
        activeRevisionId: '',
        message: error instanceof Error ? error.message : 'Unable to load page revisions.',
        status: 'error',
      }))
    }
  }

  function handlePageReviewViewChange(nextView) {
    setPageReviewView(nextView)

    if (nextView === 'revisions' && pageRevisionState.status === 'idle') {
      void handleRefreshStructuredPageRevisions()
    }
  }

  async function handlePreviewStructuredPageRevision(revision) {
    const revisionId = String(revision?.id ?? '').trim()

    if (!pageEditorState.activeKey || !revisionId) {
      return
    }

    try {
      setPageRevisionPreview({ id: revisionId, message: '', page: null, status: 'loading' })
      setPageRevisionState((current) => ({ ...current, activeRevisionId: revisionId, message: '', status: 'previewing' }))
      const requestOptions = await getAdminRequestOptions()
      const revisionDetail = await fetchAdminStructuredPageRevision(pageEditorState.activeKey, revisionId, requestOptions)

      if (!revisionDetail?.page) {
        throw new Error('The selected revision snapshot is unavailable.')
      }

      setSelectedPageBlockId('')
      setPageContextView('')
      setPageRevisionPreview({ id: revisionId, message: '', page: revisionDetail.page, status: 'ready' })
      setPageRevisionState((current) => ({ ...current, activeRevisionId: '', message: '', status: 'ready' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to preview the selected revision.'
      setPageRevisionPreview({ id: '', message, page: null, status: 'error' })
      setPageRevisionState((current) => ({ ...current, activeRevisionId: '', message, status: 'error' }))
    }
  }

  function handleCloseStructuredPageRevisionPreview() {
    setPageRevisionPreview({ id: '', message: '', page: null, status: 'idle' })
  }

  async function handleRestoreStructuredPageRevision(revision) {
    const revisionId = String(revision?.id ?? '').trim()

    if (!pageEditorState.activeKey || !revisionId) {
      return
    }

    const confirmationMessage = pageDirty
      ? 'Restore this revision to the draft and discard unsaved page changes?'
      : 'Restore this revision to the draft?'

    if (!window.confirm(confirmationMessage)) {
      return
    }

    const sessionAtStart = pageEditorSessionRef.current

    try {
      setPageSaveStatus('saving')
      setPageConflict(null)
      setPageRevisionState((current) => ({
        ...current,
        activeRevisionId: revisionId,
        message: '',
        status: 'restoring',
      }))

      const requestOptions = {
        ...(await getAdminRequestOptions()),
        editLeaseId: pageLock.leaseId,
        expectedUpdatedAt: pagePublication?.savedAt ?? null,
      }
      const restoredPage = await restoreAdminStructuredPageRevision(pageEditorState.activeKey, revisionId, requestOptions)
      await reloadStructuredPageWorkspace(restoredPage?.page?.key ?? pageEditorState.activeKey, { sessionToken: sessionAtStart })

      if (pageEditorSessionRef.current !== sessionAtStart) {
        setPageSaveStatus('idle')
        return
      }

      setPageFeedback(`Restored ${revision.pageTitle || revision.pageKey || 'the selected revision'} to draft.`)
      setPageSaveStatus('idle')
    } catch (error) {
      setPageSaveStatus('error')
      setPageRevisionState((current) => ({
        ...current,
        activeRevisionId: '',
        message: error instanceof Error ? error.message : 'Unable to restore the selected revision.',
        status: 'error',
      }))

      if (error?.status === 409) {
        captureStructuredPageConflict(error, 'restore')
        return
      }

      setPageFeedback(error instanceof Error ? error.message : 'Unable to restore the selected revision.')
    }
  }

  function openNewPageForm() {
    setNewPageForm({ path: '', pathTouched: false, title: '' })
    setNewPageError('')
    setNewPageStatus('idle')
  }

  function closeNewPageForm() {
    setNewPageForm(null)
    setNewPageError('')
    setNewPageStatus('idle')
  }

  function updateNewPageForm(field, value) {
    setNewPageForm((currentForm) => {
      if (!currentForm) {
        return currentForm
      }

      if (field === 'title') {
        const shouldRefreshPath = !currentForm.pathTouched
        return {
          ...currentForm,
          title: value,
          path: shouldRefreshPath ? `/${createRouteSlugCandidate(value)}` : currentForm.path,
        }
      }

      if (field === 'path') {
        const slug = createRouteSlugCandidate(value.replace(/^\//, ''))
        return { ...currentForm, path: `/${slug}`, pathTouched: true }
      }

      return { ...currentForm, [field]: value }
    })
  }

  async function handleCreatePage(event) {
    event.preventDefault()

    if (!newPageForm) {
      return
    }

    const title = repairSnapshotText(newPageForm.title).trim()
    const path = normalizeAdminRoutePath(newPageForm.path)
    const key = createRouteSlugCandidate(title)

    if (!title) {
      setNewPageError('Enter a page title.')
      return
    }

    if (!path || path === '/') {
      setNewPageError('Enter a URL for the page.')
      return
    }

    if (!key) {
      setNewPageError('That title cannot be turned into a page key. Try adding letters or numbers.')
      return
    }

    const keyConflict = findPageKeyConflict(key, structuredPages)

    if (keyConflict) {
      setNewPageError(keyConflict)
      return
    }

    const pathConflict = findPagePathConflict(path, { inventory: pageWorkspaceState.inventory, structuredPages })

    if (pathConflict) {
      setNewPageError(pathConflict)
      return
    }

    try {
      setNewPageStatus('saving')
      setNewPageError('')
      const requestOptions = await getAdminRequestOptions()
      await saveAdminStructuredPageContent(key, buildNewPageDraft({ path, title }), requestOptions)
      await reloadStructuredPageWorkspace(key)
      setNewPageStatus('idle')
      setNewPageForm(null)
      setPageFeedback(`Created "${title}". Add blocks below, then save and publish when ready.`)
    } catch (error) {
      setNewPageStatus('error')
      setNewPageError(error instanceof Error ? error.message : 'Unable to create the page.')
    }
  }

  async function handleDeleteStructuredPage() {
    if (!selectedStructuredPage || selectedStructuredPage.contentModel !== 'block-page') {
      return
    }

    if (pageDirty) {
      setPageFeedback('Save or reset the current draft before deleting or resetting this page.')
      return
    }

    if (!pageLock.isReady) {
      setPageFeedback(pageLock.message || 'Wait until this editor has secured the page lock.')
      return
    }

    const isCustomPage = selectedStructuredPage.group === 'custom'
    const confirmationMessage = isCustomPage
      ? `Move "${selectedStructuredPage.navLabel || selectedStructuredPage.key}" to deleted pages? It can be restored later.`
      : `Reset "${selectedStructuredPage.navLabel || selectedStructuredPage.key}" to its original seeded content?`

    if (!window.confirm(confirmationMessage)) {
      return
    }

    try {
      setPageDeleteStatus('saving')
      const requestOptions = {
        ...(await getAdminRequestOptions()),
        editLeaseId: pageLock.leaseId,
        expectedUpdatedAt: pagePublication?.savedAt ?? null,
      }
      await resetAdminStructuredPageContent(selectedStructuredPage.key, requestOptions)
      await reloadStructuredPageWorkspace(isCustomPage ? '' : selectedStructuredPage.key)
      setPageDeleteStatus('idle')
      setPageFeedback(
        isCustomPage
          ? `Moved "${selectedStructuredPage.navLabel || selectedStructuredPage.key}" to deleted pages.`
          : `Reset "${selectedStructuredPage.navLabel || selectedStructuredPage.key}" to its original content.`,
      )
    } catch (error) {
      setPageDeleteStatus('error')

      if (error?.status === 409) {
        captureStructuredPageConflict(error, isCustomPage ? 'delete' : 'reset')
        return
      }

      setPageFeedback(error instanceof Error ? error.message : 'Unable to delete the page.')
    }
  }

  async function handleRestoreDeletedStructuredPage(page) {
    const pageKey = String(page?.key ?? '').trim()

    if (!pageKey || !window.confirm(`Restore "${page.title || page.label || pageKey}" as an unpublished draft?`)) {
      return
    }

    try {
      setPageTrashState({ activeKey: pageKey, message: '', status: 'restoring' })
      const requestOptions = { ...(await getAdminRequestOptions()), expectedUpdatedAt: page.savedAt ?? null }
      await restoreAdminDeletedStructuredPage(pageKey, requestOptions)
      await reloadStructuredPageWorkspace(pageKey)
      setPageTrashState({ activeKey: '', message: '', status: 'idle' })
      setPageFeedback(`Restored "${page.title || page.label || pageKey}" as an unpublished draft.`)
    } catch (error) {
      setPageTrashState({
        activeKey: '',
        message: error instanceof Error ? error.message : 'Unable to restore the deleted page.',
        status: 'error',
      })
    }
  }

  const properties = workspaceState.properties ?? []
  const propertyLocationOptions = buildPropertyLocationOptions(properties)
  const structuredPages = pageWorkspaceState.pages ?? []
  const deletedStructuredPages = pageWorkspaceState.deletedPages ?? []
  const siteShellRouteSuggestions = buildSiteShellRouteSuggestions({
    charters: charterWorkspaceState.charters,
    inventory: pageWorkspaceState.inventory,
    properties,
  })
  const selectedStructuredPage =
    structuredPages.find((page) => page.key === pageEditorState.activeKey) ?? structuredPages[0] ?? null
  const selectedStructuredPageIsBlockPage = selectedStructuredPage?.contentModel === 'block-page'
  const propertySaveEnabled =
    propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user)) && propertyLock.isReady
  const propertyHasPendingPublication = hasPendingPublication(propertyPublication)
  const propertyActionBusy = saveStatus === 'saving' || saveStatus === 'publishing'
  const propertyPublishVisible = propertyUsesFirebase && editorState.mode === 'edit' && propertyHasPendingPublication
  const propertyPublishEnabled = propertyPublishVisible && propertySaveEnabled && !propertyDirty && !propertyActionBusy
  const propertyPreviewToggleVisible = Boolean(formState)
  const propertyPreviewModel = buildPropertyPreviewModel(formState)
  const charterSaveEnabled =
    charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user)) && charterLock.isReady
  const charterActionBusy = charterSaveStatus === 'saving' || charterSaveStatus === 'publishing'
  const charterHasPendingPublication = hasPendingPublication(charterPublication)
  const charterPreviewModel = buildCharterPreviewModel(charterFormState)
  const siteContentDraftEditingEnabled = siteContentEditingEnabled
  const siteContentSaveEnabled = siteContentEditingEnabled && Boolean(authState.user)
  const siteShellDraftEditingEnabled = siteContentDraftEditingEnabled && siteShellLock.isReady
  const siteShellSaveEnabled = siteContentSaveEnabled && siteShellLock.isReady
  const pageDraftEditingEnabled = siteContentDraftEditingEnabled && pageLock.isReady
  const pageValidation = validateEditorBlockPageDraft(deferredPageDraft, {
    activeKey: pageEditorState.activeKey,
    routeInventory: pageWorkspaceState.inventory,
    structuredPages,
  })
  const pageHasBlockingValidationErrors = pageValidation.applies && !pageValidation.valid
  const pageAuthenticatedSaveEnabled = siteContentSaveEnabled && pageLock.isReady
  const pageSaveEnabled = pageAuthenticatedSaveEnabled && !pageHasBlockingValidationErrors
  const siteShellHasPendingPublication = hasPendingPublication(siteShellPublication)
  const showSiteShellPublishAction = siteShellHasPendingPublication && siteShellEditedSinceLoad && !siteShellDirty
  const pageHasPendingPublication = hasPendingPublication(pagePublication)
  const pageDraftDiff = buildPageDiff(pageEditorState.savedDraft, deferredPageDraft)
  const pagePublishDiff = buildPageDiff(pageEditorState.publishedPage, pageEditorState.savedDraft)
  const pageConflictDiff = pageConflict?.latest?.page
    ? buildPageDiff(pageConflict.latest.page, pageConflict.localDraft)
    : null
  const pageRevisionPreviewDiff = pageRevisionPreview.page
    ? buildPageDiff(pageRevisionPreview.page, pageEditorState.savedDraft)
    : null
  const pageChangeSummaryMode = pageDirty ? 'draft' : pageHasPendingPublication ? 'publish' : ''
  const pageChangeSummaryDiff = pageChangeSummaryMode === 'draft' ? pageDraftDiff : pageChangeSummaryMode === 'publish' ? pagePublishDiff : null
  const pageReviewDiff = pageRevisionPreviewDiff ?? pageChangeSummaryDiff
  const pageReviewDiffMode = pageRevisionPreviewDiff ? 'revision' : pageChangeSummaryMode
  const pageReviewIssueCount = (pageValidation.errors?.length ?? 0) + (pageValidation.warnings?.length ?? 0)
  const pagePreviewModeKey = `${activeTab === 'pages' ? 'pages' : 'hidden'}:${pageEditorState.activeKey}`
  const pagePreviewMode = pagePreviewViewState.key === pagePreviewModeKey ? pagePreviewViewState.mode : 'edit'
  const pageCanvasView = pageContextView === 'layout' ? 'layout' : 'visual'
  const pageSettingsOpen = pageContextView === 'settings'
  const pageHistoryStatus = getPageEditorHistoryStatus(pageHistoryState, pageEditorState.activeKey)
  const pageHistoryActionsDisabled =
    !selectedStructuredPageIsBlockPage || pagePreviewMode !== 'edit' || !pageDraftEditingEnabled || Boolean(pageRevisionPreview.id)
  const pageUndoEnabled = !pageHistoryActionsDisabled && pageHistoryStatus.canUndo
  const pageRedoEnabled = !pageHistoryActionsDisabled && pageHistoryStatus.canRedo
  const activeLivePageButtonVisible =
    (activeTab === 'pages' && Boolean(selectedStructuredPage?.path)) ||
    (activeTab === 'properties' && editorState.mode === 'edit' && Boolean(editorState.activeSlug)) ||
    (activeTab === 'charters' && charterEditorState.mode === 'edit' && Boolean(charterEditorState.activeSlug))
  const showGoogleSignInButton = authState.status === 'signed-out'
  const isGoogleSignInBusy = authState.status === 'loading' || authFeedbackStatus === 'saving'
  const requiresAuthenticationScreen = requiresAdminSignIn && !authState.user
  const adminToolbarContextSelector =
    activeTab === 'pages' && pageWorkspaceState.status === 'ready' && structuredPages.length > 0 ? (
      <label className="admin-field admin-selector-field">
        <span className="visually-hidden">Page</span>
        <select value={pageEditorState.activeKey || ''} onChange={handleStructuredPageSelectionChange}>
          {structuredPages.map((page) => (
            <option key={page.key} value={page.key}>
              {formatPageSelectorLabel(page)}
              {lockBadgeSuffix('structuredPage', page.key)}
            </option>
          ))}
        </select>
      </label>
    ) : activeTab === 'properties' && workspaceState.status === 'ready' ? (
      <label className="admin-field admin-selector-field">
        <span className="visually-hidden">Property</span>
        <select disabled={propertyActionBusy} value={editorState.mode === 'edit' ? editorState.activeSlug : ''} onChange={handlePropertySelectionChange}>
          <option disabled hidden value="">
            {editorState.mode === 'create' ? 'New property draft' : 'Select a property'}
          </option>
          {properties.map((property) => (
            <option key={property.slug} value={property.slug}>
              {formatPropertySelectorLabel(property)}
              {lockBadgeSuffix('property', property.adminOriginalSlug || property.slug)}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <span className="admin-page-editor-heading-spacer" />
    )

  if (requiresAuthenticationScreen) {
    return (
      <article className="admin-page">
        <h1 className="visually-hidden">Site administration</h1>
        <AdminBackToSiteButton />
        <section className="page-section admin-header admin-header--auth-only">
          <div className="admin-auth-shell">
            <div className="admin-auth-shell-header">
              <div className="eyebrow">Admin</div>
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
    <article className={`admin-page admin-page--app-shell${activeTab === 'pages' ? ' admin-page--editor-workspace' : ''}`}>
      <h1 className="visually-hidden">Site administration</h1>
      {!activeLivePageButtonVisible ? <AdminBackToSiteButton onBeforeNavigate={confirmLivePageNavigation} /> : null}

      <section className="page-section admin-command-bar" aria-label="Admin toolbar">
        <div className="admin-page-editor-heading-toolbar">
          <AdminSectionSelect activeTab={activeTab} onChange={setActiveTab} />
          {adminToolbarContextSelector}

          <div className="admin-page-editor-heading-actions">
            {activeTab === 'site-shell' ? (
              <div className="admin-page-editor-heading-tool-group">
                <EditorIconButton icon={RefreshCw} label="Refresh site shell" onClick={handleReloadSiteShell} />
              </div>
            ) : null}

            {activeTab === 'pages' ? (
              <>
                <div className="admin-page-editor-heading-tool-group">
                  {selectedStructuredPage ? (
                    <>
                      <EditorIconButton icon={RefreshCw} label="Refresh page" onClick={() => handleReloadStructuredPage(selectedStructuredPage.key)} />
                      {selectedStructuredPage.contentModel === 'block-page' ? (
                        <EditorIconButton
                          disabled={pageDeleteStatus === 'saving' || pageDirty || !pageLock.isReady}
                          icon={Trash2}
                          label={
                            pageDeleteStatus === 'saving'
                              ? selectedStructuredPage.group === 'custom'
                                ? 'Moving page to trash'
                                : 'Resetting page'
                              : selectedStructuredPage.group === 'custom'
                                ? 'Delete page'
                                : 'Reset page'
                          }
                          tone="danger"
                          onClick={handleDeleteStructuredPage}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {siteContentEditingEnabled ? <EditorIconButton icon={Plus} label="New page" onClick={openNewPageForm} /> : null}
                </div>

                {selectedStructuredPage ? (
                  <div className="admin-page-editor-heading-tool-group admin-page-editor-heading-tool-group--page">
                    {selectedStructuredPage?.path ? (
                      <Link
                        className="button-link button-link--ghost admin-action"
                        to={selectedStructuredPage.path}
                        onClick={(event) => {
                          if (!confirmLivePageNavigation()) {
                            event.preventDefault()
                          }
                        }}
                      >
                        View on site
                      </Link>
                    ) : null}
                    {selectedStructuredPageIsBlockPage ? (
                      <>
                        <EditorIconButton disabled={!pageUndoEnabled} icon={Undo2} label="Undo" onClick={handleUndoStructuredPageEdit} />
                        <EditorIconButton disabled={!pageRedoEnabled} icon={Redo2} label="Redo" onClick={handleRedoStructuredPageEdit} />
                        <EditorReviewToolbar
                          activeView={pageReviewView}
                          changeCount={pageReviewDiff?.totalChanges ?? 0}
                          changesAvailable={Boolean(pageReviewDiff && !pageReviewDiff.empty)}
                          disabled={pageEditorState.status !== 'ready'}
                          issueCount={pageReviewIssueCount}
                          revisionsCount={pageRevisionState.revisions.length}
                          onViewChange={handlePageReviewViewChange}
                        />
                      </>
                    ) : null}
                  </div>
                ) : null}

                <div className="admin-page-editor-heading-save-actions">
                  {selectedStructuredPage ? (
                    <>
                      <AdminPreviewModeSplitButton
                        device={pagePreviewDevice}
                        mode={pagePreviewMode}
                        onDeviceChange={setPagePreviewDevice}
                        onModeChange={(nextMode) => setPagePreviewViewState({ key: pagePreviewModeKey, mode: nextMode })}
                      />

                      {pageDirty ? (
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={pageSaveStatus === 'saving' || pageSaveStatus === 'publishing'}
                          type="button"
                          onClick={handleDiscardStructuredPageChanges}
                        >
                          Reset
                        </button>
                      ) : null}

                      {pageDirty ? (
                        <button
                          className="button-link button-link--primary admin-submit"
                          disabled={!pageSaveEnabled || pageSaveStatus === 'saving' || pageSaveStatus === 'publishing'}
                          form={STRUCTURED_PAGE_EDITOR_FORM_ID}
                          type="submit"
                        >
                          {pageSaveStatus === 'saving' ? 'Saving...' : 'Save draft'}
                        </button>
                      ) : null}

                      {pageHasPendingPublication ? (
                        <button
                          className="button-link button-link--secondary admin-submit"
                          disabled={!pageSaveEnabled || pageDirty || pageSaveStatus === 'saving' || pageSaveStatus === 'publishing'}
                          title={pageDirty ? 'Save the current draft before publishing.' : undefined}
                          type="button"
                          onClick={handlePublishStructuredPage}
                        >
                          {pageSaveStatus === 'publishing' ? 'Publishing...' : 'Publish saved draft'}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}

            {activeTab === 'properties' ? (
              <>
                <div className="admin-page-editor-heading-tool-group">
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={propertyActionBusy}
                    type="button"
                    onClick={handleNewPropertyClick}
                  >
                    New property
                  </button>
                </div>

                <div className="admin-page-editor-heading-tool-group admin-page-editor-heading-tool-group--page">
                  {editorState.mode === 'edit' && editorState.activeSlug ? (
                    <Link
                      className="button-link button-link--ghost admin-action"
                      to={`/rental-properties/${editorState.activeSlug}`}
                      onClick={(event) => {
                        if (!confirmLivePageNavigation()) {
                          event.preventDefault()
                        }
                      }}
                    >
                      View on site
                    </Link>
                  ) : null}
                  {editorState.mode === 'edit' && formState.originalSlug ? (
                    <button
                      className="button-link button-link--ghost admin-action"
                      disabled={!propertySaveEnabled || propertyActionBusy}
                      type="button"
                      onClick={handleDeleteProperty}
                    >
                      Delete property
                    </button>
                  ) : null}
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={!propertySaveEnabled || propertyActionBusy}
                    type="button"
                    onClick={handlePropertyVisibilityToggle}
                  >
                    {editorState.mode === 'edit'
                      ? formState.active !== false
                        ? 'Deactivate property'
                        : 'Activate property'
                      : formState.active !== false
                        ? 'Set draft inactive'
                        : 'Set draft active'}
                  </button>
                </div>

                <div className="admin-page-editor-heading-save-actions">
                  {propertyPreviewToggleVisible ? (
                    <div aria-label="Property editor view" className="admin-property-preview-mode-toggle" role="group">
                      <button
                        aria-pressed={propertyPreviewMode === 'edit'}
                        className={`button-link admin-action ${propertyPreviewMode === 'edit' ? 'button-link--secondary' : 'button-link--ghost'}`}
                        type="button"
                        onClick={() => setPropertyPreviewViewState({ key: propertyPreviewModeKey, mode: 'edit' })}
                      >
                        Edit
                      </button>
                      <button
                        aria-pressed={propertyPreviewMode === 'preview'}
                        className={`button-link admin-action ${propertyPreviewMode === 'preview' ? 'button-link--secondary' : 'button-link--ghost'}`}
                        type="button"
                        onClick={() => setPropertyPreviewViewState({ key: propertyPreviewModeKey, mode: 'preview' })}
                      >
                        Preview
                      </button>
                    </div>
                  ) : null}

                  {propertyDirty ? (
                    <button className="button-link button-link--ghost admin-action" disabled={propertyActionBusy} type="button" onClick={handleDiscardPropertyChanges}>
                      Reset
                    </button>
                  ) : null}

                  {propertyPublishVisible ? (
                    <button
                      className="button-link button-link--secondary admin-submit"
                      disabled={!propertyPublishEnabled}
                      title={propertyDirty ? 'Save the draft before publishing it live.' : 'Publish the saved draft live.'}
                      type="button"
                      onClick={handlePublishProperty}
                    >
                      {saveStatus === 'publishing' ? 'Publishing...' : 'Publish draft'}
                    </button>
                  ) : null}

                  {propertyDirty || saveStatus === 'saving' ? (
                    <button
                      className="button-link button-link--primary admin-submit"
                      disabled={!propertySaveEnabled || propertyActionBusy}
                      form={PROPERTY_EDITOR_FORM_ID}
                      type="submit"
                    >
                      {saveStatus === 'saving' ? 'Saving...' : 'Save draft'}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {requiresAdminSignIn ? (
              <div className="admin-page-editor-heading-save-actions admin-page-editor-heading-save-actions--persistent">
                <button className="button-link button-link--ghost admin-action admin-sign-out-action" type="button" onClick={handleAdminSignOut}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={`page-section admin-shell${activeTab === 'pages' ? ' admin-shell--page-editor' : ''}`}>
        <div className="admin-panel-stack">
          {activeTab === 'site-shell' ? (
            <section className="admin-panel admin-panel--page-editor">
              <div className="admin-panel-header">
                <div>
                  <h2>Site Shell</h2>
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
                {siteShellFeedback ? (
                  <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(siteShellSaveStatus)}`}>{siteShellFeedback}</p>
                ) : null}

                {siteShellConflict ? (
                  <button className="button-link button-link--secondary admin-action" type="button" onClick={handleLoadLatestSiteShell}>
                    Load latest version
                  </button>
                ) : null}

                <AdminEditLockNotice lock={siteShellLock} resourceLabel="site shell" />

                {siteShellWorkspaceState.status === 'loading' ? (
                  <p className="admin-empty">Loading header and footer content...</p>
                ) : (
                  <form className="admin-form" onSubmit={handleSiteShellSubmit}>
                    <div className="admin-floating-save-shell">
                      <AdminFloatingSaveButton
                        disabled={!siteShellSaveEnabled}
                        label={showSiteShellPublishAction ? 'Publish shell changes' : 'Save shell changes'}
                        onReset={handleDiscardSiteShellChanges}
                        showReset={siteShellDirty}
                        saveStatus={siteShellSaveStatus}
                        visible={siteShellDirty || showSiteShellPublishAction}
                      />

                      <div className="admin-editor-workspace admin-editor-workspace--full-width">
                        <div>
                          <AdminSiteShellEditor
                            disabled={!siteShellDraftEditingEnabled}
                            onChange={handleSiteShellDraftChange}
                            routeInventory={pageWorkspaceState.inventory}
                            routeSuggestions={siteShellRouteSuggestions}
                            value={siteShellDraft}
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
            <section className="admin-panel admin-panel--page-editor">
              {!siteContentEditingEnabled ? (
                <p className="admin-note">Page editing is not available in the current content mode.</p>
              ) : null}

              {newPageForm ? (
                <form className="admin-form admin-new-page-form" onSubmit={handleCreatePage}>
                  {newPageError ? <p className="admin-feedback admin-feedback--error">{newPageError}</p> : null}
                  <label className="admin-field">
                    <span>Page Title</span>
                    <input
                      autoFocus
                      type="text"
                      value={newPageForm.title}
                      onChange={(event) => updateNewPageForm('title', event.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span>URL Path</span>
                    <input type="text" value={newPageForm.path} onChange={(event) => updateNewPageForm('path', event.target.value)} />
                  </label>
                  <div className="admin-inline-actions">
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={closeNewPageForm}>
                      Cancel
                    </button>
                    <button className="button-link button-link--primary admin-action" disabled={newPageStatus === 'saving'} type="submit">
                      {newPageStatus === 'saving' ? 'Creating...' : 'Create page'}
                    </button>
                  </div>
                </form>
              ) : null}

              {pageWorkspaceState.status === 'error' ? <p className="admin-empty">{pageWorkspaceState.message}</p> : null}

              {pageWorkspaceState.status === 'loading' ? <p className="admin-empty">Loading pages...</p> : null}

              {pageWorkspaceState.status === 'ready' && structuredPages.length === 0 ? (
                <p className="admin-empty">No structured pages are available yet.</p>
              ) : null}

              {pageWorkspaceState.status === 'ready' && deletedStructuredPages.length > 0 ? (
                <details className="admin-page-trash">
                  <summary>Deleted pages ({deletedStructuredPages.length})</summary>
                  {pageTrashState.message ? <p className="admin-feedback admin-feedback--error">{pageTrashState.message}</p> : null}
                  <ul>
                    {deletedStructuredPages.map((page) => (
                      <li key={page.key}>
                        <div>
                          <strong>{page.title || page.label || page.key}</strong>
                          <span>{page.path || 'No path'}</span>
                          {page.deletedAt ? <time>{new Date(page.deletedAt).toLocaleString()}</time> : null}
                        </div>
                        <button
                          className="button-link button-link--secondary admin-action"
                          disabled={pageTrashState.status === 'restoring'}
                          type="button"
                          onClick={() => handleRestoreDeletedStructuredPage(page)}
                        >
                          {pageTrashState.status === 'restoring' && pageTrashState.activeKey === page.key ? 'Restoring...' : 'Restore'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="admin-editor admin-editor--page">
                {pageFeedback ? <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(pageSaveStatus)}`}>{pageFeedback}</p> : null}

                {pageConflict ? (
                  <section className="admin-page-conflict" aria-label="Page edit conflict">
                    <div>
                      <strong>Another saved version exists</strong>
                      <p>Your local draft is preserved. Compare it with the latest saved version before choosing what to keep.</p>
                    </div>
                    <div className="admin-inline-actions">
                      <button
                        className="button-link button-link--secondary admin-action"
                        disabled={!pageConflict.latest}
                        type="button"
                        onClick={handleKeepLocalStructuredPageConflict}
                      >
                        Keep my draft
                      </button>
                      <button
                        className="button-link button-link--ghost admin-action"
                        type="button"
                        onClick={handleUseLatestStructuredPageConflict}
                      >
                        Use latest saved
                      </button>
                      <button
                        className="button-link button-link--ghost admin-action"
                        disabled={!pageConflict.localDraft}
                        type="button"
                        onClick={handleDownloadStructuredPageConflictDraft}
                      >
                        Download my draft
                      </button>
                    </div>
                  </section>
                ) : null}

                {pageConflictDiff ? <PageChangeSummaryPanel diff={pageConflictDiff} mode="conflict" /> : null}

                {pageEditorState.status === 'loading' ? <p className="admin-empty">Loading structured page content...</p> : null}

                <AdminEditLockNotice lock={pageLock} resourceLabel="page" />

                {pageEditorState.status !== 'loading' && selectedStructuredPage ? (
                  <form className="admin-form admin-form--flush" id={STRUCTURED_PAGE_EDITOR_FORM_ID} onSubmit={handleStructuredPageSubmit}>
                    {selectedStructuredPageIsBlockPage && pageReviewView ? (
                      <div className="admin-page-editor-review-view">
                        {pageReviewView === 'checks' ? (
                          <PageQualityPanel defaultOpen validation={pageValidation} onSelectIssue={handleStructuredPageValidationIssue} />
                        ) : null}
                        {pageReviewView === 'changes' ? (
                          <PageChangeSummaryPanel
                            defaultOpen
                            diff={pageReviewDiff}
                            mode={pageReviewDiffMode}
                            publication={pagePublication}
                          />
                        ) : null}
                        {pageReviewView === 'revisions' ? (
                          <PageRevisionHistoryPanel
                            defaultOpen
                            disabled={!pageAuthenticatedSaveEnabled || pageSaveStatus === 'saving' || pageSaveStatus === 'publishing'}
                            message={pageRevisionState.message}
                            previewRevisionId={pageRevisionPreview.id || (pageRevisionState.status === 'previewing' ? pageRevisionState.activeRevisionId : '')}
                            restoringRevisionId={pageRevisionState.activeRevisionId}
                            revisions={pageRevisionState.revisions}
                            status={pageRevisionState.status}
                            onClosePreview={handleCloseStructuredPageRevisionPreview}
                            onPreview={handlePreviewStructuredPageRevision}
                            onRefresh={handleRefreshStructuredPageRevisions}
                            onRestore={handleRestoreStructuredPageRevision}
                          />
                        ) : null}
                      </div>
                    ) : null}

                    <div className="admin-floating-save-shell">
                      <div
                        className={`admin-page-editor-shell${
                          selectedStructuredPageIsBlockPage && pagePreviewMode === 'edit' && !pageRevisionPreview.id
                            ? ''
                            : ' admin-page-editor-shell--single'
                        }`}
                      >
                        {selectedStructuredPageIsBlockPage && pagePreviewMode === 'edit' && !pageRevisionPreview.id ? (
                          <aside className="admin-page-editor-layers-rail" aria-label="Page layers">
                            <BlockOutline
                              blocks={pageEditorState.draft?.blocks}
                              disabled={pagePreviewMode !== 'edit' || Boolean(pageRevisionPreview.id)}
                              pageSelected={pageSettingsOpen}
                              selectedBlockId={selectedPageBlockId}
                              validation={pageValidation}
                              onBlocksChange={(nextBlocks) => updateStructuredPageDraftPath(['blocks'], nextBlocks)}
                              onSelectBlock={handlePageEditorNodeSelection}
                              onSelectPage={openStructuredPageSettings}
                            />
                          </aside>
                        ) : null}

                        <div className="admin-page-editor-main">
                          {selectedStructuredPageIsBlockPage && pagePreviewMode === 'edit' && !pageRevisionPreview.id ? (
                            <div className="admin-page-editor-canvas-toolbar">
                              <div aria-label="Canvas view" className="admin-page-editor-view-toggle" role="group">
                                <button
                                  aria-pressed={pageCanvasView === 'visual'}
                                  className={`admin-page-editor-view-toggle-button${
                                    pageCanvasView === 'visual' ? ' admin-page-editor-view-toggle-button--active' : ''
                                  }`}
                                  type="button"
                                  onClick={() => setPageContextView('')}
                                >
                                  <Eye aria-hidden="true" size={16} strokeWidth={2} />
                                  <span>Visual</span>
                                </button>
                                <button
                                  aria-pressed={pageCanvasView === 'layout'}
                                  className={`admin-page-editor-view-toggle-button${
                                    pageCanvasView === 'layout' ? ' admin-page-editor-view-toggle-button--active' : ''
                                  }`}
                                  type="button"
                                  onClick={() => setPageContextView('layout')}
                                >
                                  <LayoutPanelTop aria-hidden="true" size={16} strokeWidth={2} />
                                  <span>Layout</span>
                                </button>
                              </div>
                              <EditorIconButton
                                aria-pressed={pageSettingsOpen}
                                className={pageSettingsOpen ? 'editor-icon-button--active' : ''}
                                icon={SlidersHorizontal}
                                label="Page settings"
                                onClick={() => {
                                  if (pageSettingsOpen) {
                                    setPageContextView('')
                                  } else {
                                    openStructuredPageSettings()
                                  }
                                }}
                              />
                            </div>
                          ) : null}

                          {selectedStructuredPageIsBlockPage && pagePreviewMode === 'edit' && !pageRevisionPreview.id && pageSettingsOpen ? (
                            <div className="admin-page-editor-page-settings">
                              <BlockInspectorPanel
                                disabled={!pageDraftEditingEnabled}
                                page={pageEditorState.draft}
                                routeInventory={pageWorkspaceState.inventory}
                                selectedBlockId=""
                                siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                                validation={pageValidation}
                                onClearSelection={clearStructuredPageSelection}
                                onUpdatePath={updateStructuredPageDraftPath}
                              />
                            </div>
                          ) : null}

                          <div className="admin-page-editor-canvas">
                            {pageRevisionPreview.status === 'loading' ? (
                              <p className="admin-empty">Loading revision preview...</p>
                            ) : pageRevisionPreview.page ? (
                              <AdminPagePreview
                                device={pagePreviewDevice}
                                page={pageRevisionPreview.page}
                                pageKey={pageEditorState.activeKey}
                                routeInventory={pageWorkspaceState.inventory}
                                siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                              />
                            ) : pagePreviewMode === 'preview' ? (
                              <AdminPagePreview
                                device={pagePreviewDevice}
                                page={pageEditorState.draft}
                                pageKey={pageEditorState.activeKey}
                                routeInventory={pageWorkspaceState.inventory}
                                siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                              />
                            ) : selectedStructuredPageIsBlockPage && pageCanvasView === 'layout' ? (
                              <div className="admin-page-editor-layout-view">
                                <BlockLayoutOutline
                                  blocks={pageEditorState.draft?.blocks}
                                  layoutMetrics={pageLayoutMetrics}
                                  selectedBlockId={selectedPageBlockId}
                                  onSelectBlock={handlePageEditorNodeSelection}
                                />
                              </div>
                            ) : (
                              <AdminPageEditorCanvas
                                device={pagePreviewDevice}
                                disabled={!pageDraftEditingEnabled}
                                renderSelectionInspector={
                                  selectedStructuredPageIsBlockPage
                                    ? (selectionId) => (
                                        <BlockInspectorPanel
                                          disabled={!pageDraftEditingEnabled}
                                          page={pageEditorState.draft}
                                          routeInventory={pageWorkspaceState.inventory}
                                          selectedBlockId={selectionId}
                                          siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                                          validation={pageValidation}
                                          onClearSelection={clearStructuredPageSelection}
                                          onUpdatePath={updateStructuredPageDraftPath}
                                        />
                                      )
                                    : undefined
                                }
                                onChange={handleStructuredPageDraftChange}
                                onLayoutMetricsChange={setPageLayoutMetrics}
                                onSelectedBlockIdChange={handlePageEditorNodeSelection}
                                page={pageEditorState.draft}
                                pageKey={pageEditorState.activeKey}
                                routeInventory={pageWorkspaceState.inventory}
                                selectedBlockId={selectedPageBlockId}
                                siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {pageEditorState.activeKey === 'stJohnCarRentals' ? (
                      <CarRentalCompaniesPanel
                        disabled={!pageDraftEditingEnabled}
                        page={pageEditorState.draft}
                        onChange={handleStructuredPageDraftChange}
                      />
                    ) : null}
                  </form>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === 'styles' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <h2>Appearance</h2>
                </div>
              </div>

              <AdminEditLockNotice lock={siteShellLock} resourceLabel="site appearance" />

              <AdminStyleEditor
                canPublishSiteShell={showSiteShellPublishAction}
                disabled={!siteShellDraftEditingEnabled || siteShellWorkspaceState.status !== 'ready'}
                feedback={siteShellFeedback}
                publication={siteShellPublication}
                saveStatus={siteShellSaveStatus}
                siteShell={siteShellDraft}
                siteShellDirty={siteShellDirty}
                onPublishSiteShell={handlePublishSiteShell}
                onSaveSiteShell={saveSiteShellDraft}
                onSiteShellChange={handleSiteShellDraftChange}
              />
            </section>
          ) : null}

          {activeTab === 'properties' ? (
            <section className="admin-panel">
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

              <div className="admin-editor">
                <AdminEditLockNotice lock={propertyLock} resourceLabel="property" />

                {feedback ? <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(saveStatus)}`}>{feedback}</p> : null}

                {propertyConflict ? (
                  <button className="button-link button-link--secondary admin-action" type="button" onClick={handleLoadLatestProperty}>
                    Load latest version
                  </button>
                ) : null}

                <form className="admin-form admin-form--flush" id={PROPERTY_EDITOR_FORM_ID} onSubmit={handleSubmit}>
                  {editorState.mode === 'edit' ? (
                    <div className="admin-toolbar-row">
                      <div className="admin-chip-row admin-chip-row--compact">
                        <span className="admin-chip">{propertyHasPendingPublication ? 'Draft saved' : 'Live version current'}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="admin-floating-save-shell">
                    <AdminPropertyPreview
                      key={propertyPreviewEditorKey}
                      disabled={!propertySaveEnabled}
                      editable
                      formState={formState}
                      locationOptions={propertyLocationOptions}
                      mode={propertyPreviewMode}
                      onAddAmenityGroup={addAmenityGroup}
                      onAddGalleryFolderImages={addGalleryImagesFromFolder}
                      onAddGalleryImage={addGalleryImage}
                      onAddReviewEntry={addReviewEntry}
                      onAmenityGroupChange={updateAmenityGroup}
                      onFieldChange={updateFormState}
                      onGalleryImageChange={updateGalleryImage}
                      onMoveGalleryImage={moveGalleryImage}
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
                  <h2>Charter Editor</h2>
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
                    <select
                      disabled={charterActionBusy}
                      value={charterEditorState.mode === 'edit' ? charterEditorState.activeSlug : ''}
                      onChange={handleCharterSelectionChange}
                    >
                      <option value="">Create a new charter</option>
                      {charterWorkspaceState.charters.map((charter) => (
                        <option key={charter.slug} value={charter.slug}>
                          {formatCharterSelectorLabel(charter)}
                          {lockBadgeSuffix('charter', charter.adminOriginalSlug || charter.slug)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="admin-editor">
                <AdminEditLockNotice lock={charterLock} resourceLabel="charter" />

                {charterFeedback ? (
                  <p className={`admin-feedback admin-feedback--${getFeedbackStatusTone(charterSaveStatus)}`}>{charterFeedback}</p>
                ) : null}

                {charterConflict ? (
                  <button className="button-link button-link--secondary admin-action" type="button" onClick={handleLoadLatestCharter}>
                    Load latest version
                  </button>
                ) : null}

                {charterEditorState.mode === 'edit' && charterEditorState.activeSlug ? (
                  <AdminViewLiveButton path={`/charter-boat-rentals/${charterEditorState.activeSlug}`} onBeforeNavigate={confirmLivePageNavigation} />
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
            <section className="admin-panel admin-panel--media">
              <div className="admin-editor admin-editor--media">
                <AdminMediaManager
                  defaultOpen
                  showToggle={false}
                  title=""
                />
              </div>
            </section>
          ) : null}

          {activeTab === 'clients' ? <AdminClientsPanel authUser={authState.user} /> : null}
          {activeTab === 'submissions' ? <AdminAdvertiseInquiriesPanel authUser={authState.user} /> : null}

          {activeTab === 'backups' ? (
            <section className="admin-panel">
              <AdminBackupManager authUser={authState.user} />
            </section>
          ) : null}
        </div>
      </section>
    </article>
  )
}
