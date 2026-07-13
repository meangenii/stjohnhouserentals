import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminAdvertiseInquiriesPanel } from '../components/AdminAdvertiseInquiriesPanel'
import { AdminBackupManager } from '../components/AdminBackupManager'
import { getAdminIdToken, observeAdminUser, signInAdminWithGoogle, signOutAdmin } from '../lib/adminAuth'
import { ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR, observeAdminFloatingStackOffset, setAdminFloatingStackOffset } from '../lib/adminFloatingLayout'
import { AdminPageEditorCanvas, AdminPagePreview } from '../components/AdminPagePreview'
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
import { isFirebaseConfigured } from '../lib/firebase'
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
import {
  fetchAdminSiteShellContent,
  fetchAdminStructuredPageContent,
  fetchAdminStructuredPageDirectory,
  isSiteContentEditingEnabled,
  publishAdminSiteShellContent,
  publishAdminStructuredPageContent,
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

const RESERVED_PAGE_PATH_PREFIXES = ['/admin', '/rental-properties/', '/1bedroom/', '/charter-boat-rentals/']

function isReservedPagePath(path) {
  if (!path || path === '/') {
    return true
  }

  return RESERVED_PAGE_PATH_PREFIXES.some((prefix) => {
    const prefixWithoutSlash = prefix.replace(/\/$/, '')
    return path === prefixWithoutSlash || path.startsWith(`${prefixWithoutSlash}/`)
  })
}

function findPagePathConflict(path, { inventory = [], structuredPages = [] } = {}) {
  if (isReservedPagePath(path)) {
    return 'That URL is reserved by the site. Choose a different one.'
  }

  const takenPaths = new Set()

  inventory.forEach((route) => {
    normalizeAdminRoutePath(route?.path) && takenPaths.add(normalizeAdminRoutePath(route.path))
    ;(route?.routeAliases ?? []).forEach((alias) => normalizeAdminRoutePath(alias) && takenPaths.add(normalizeAdminRoutePath(alias)))
  })

  structuredPages.forEach((page) => {
    normalizeAdminRoutePath(page?.path) && takenPaths.add(normalizeAdminRoutePath(page.path))
  })

  return takenPaths.has(path) ? 'A page already uses that URL. Choose a different one.' : ''
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
const ADMIN_EDITOR_TABS = new Set(['site-shell', 'pages', 'styles', 'properties', 'charters', 'media', 'submissions', 'backups'])

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

function readStoredAdminEditorLocation() {
  if (typeof window === 'undefined') {
    return DEFAULT_ADMIN_EDITOR_LOCATION
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
    amenityGroups: [createAmenityEditor()],
    reviewEntries: [createReviewEditor()],
  }

  return {
    ...nextFormState,
    shortDescription: buildPropertyShortDescription(nextFormState),
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

  return {
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
  const bedrooms = normalizeBedroomCount(formState.bedrooms)
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(formState.alternateBedroomCounts, bedrooms)

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
  const bedrooms = normalizeBedroomCount(formState.bedrooms)
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(formState.alternateBedroomCounts, bedrooms)

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
  const [initialAdminEditorLocation] = useState(() => readStoredAdminEditorLocation())
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
  const [galleryEditorExpanded, setGalleryEditorExpanded] = useState(false)
  const [propertyPreviewViewState, setPropertyPreviewViewState] = useState(() => ({
    key: '',
    mode: 'edit',
  }))
  const [feedback, setFeedback] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [propertyPublication, setPropertyPublication] = useState(null)
  const propertyEditingEnabled = isPropertyEditingEnabled()
  const propertyUsesFirebase = isFirebasePropertyData()

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

  const [pageWorkspaceState, setPageWorkspaceState] = useState(() => ({
    status: 'loading',
    inventory: [],
    pages: [],
    message: '',
  }))
  const [pageEditorState, setPageEditorState] = useState(() => ({
    status: 'idle',
    activeKey: preferredPageKey,
    draft: null,
    savedDraft: null,
  }))
  const [pageFeedback, setPageFeedback] = useState('')
  const [pageSaveStatus, setPageSaveStatus] = useState('idle')
  const [pagePublication, setPagePublication] = useState(null)
  const [newPageForm, setNewPageForm] = useState(null)
  const [newPageStatus, setNewPageStatus] = useState('idle')
  const [newPageError, setNewPageError] = useState('')
  const [pageDeleteStatus, setPageDeleteStatus] = useState('idle')
  const [pagePreviewDevice, setPagePreviewDevice] = useState('desktop')
  const [pagePreviewViewState, setPagePreviewViewState] = useState(() => ({ key: '', mode: 'edit' }))
  const propertyFloatingSaveRef = useRef(null)

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
  const propertyPreviewEditorKey = formState.originalSlug || 'new-property'
  const propertyPreviewModeKey = `${activeTab === 'properties' ? 'properties' : 'hidden'}:${propertyPreviewEditorKey}`
  const propertyPreviewMode = propertyPreviewViewState.key === propertyPreviewModeKey ? propertyPreviewViewState.mode : 'edit'

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
          setGalleryEditorExpanded(false)
          return
        }

        const preferredProperty =
          (preferredPropertySlug ? properties.find((property) => property.slug === preferredPropertySlug) : null) ?? properties[0]

        if (preferredProperty) {
          const nextFormState = createFormState(preferredProperty)
          setEditorState({ mode: 'edit', activeSlug: preferredProperty.slug })
          setFormState(nextFormState)
          setSavedFormState(nextFormState)
          setPropertyPublication(preferredProperty.publication ?? null)
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

        const preferredCharter =
          (preferredCharterSlug ? charters.find((charter) => charter.slug === preferredCharterSlug) : null) ?? charters[0]

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

        setPageWorkspaceState({
          status: 'ready',
          inventory,
          pages,
          message: '',
        })

        const nextPageKey = (preferredPageKey ? pages.find((page) => page.key === preferredPageKey)?.key : '') || pages[0]?.key || ''

        if (!nextPageKey) {
          setPageEditorState({ status: 'idle', activeKey: '', draft: null, savedDraft: null })
          setPagePublication(null)
          return
        }

        const page = await fetchAdminStructuredPageContent(nextPageKey, requestOptions)

        if (cancelled) {
          return
        }

        setPageEditorState({
          status: 'ready',
          activeKey: nextPageKey,
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
    propertyEditorSessionRef.current += 1
    const nextFormState = createEmptyFormState()
    setEditorState({ mode: 'create', activeSlug: '' })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(null)
    setGalleryEditorExpanded(false)
    setFeedback('')
  }

  function openEditForm(property) {
    propertyEditorSessionRef.current += 1
    const nextFormState = createFormState(property)
    setEditorState({ mode: 'edit', activeSlug: property.slug })
    setFormState(nextFormState)
    setSavedFormState(nextFormState)
    setPropertyPublication(property.publication ?? null)
    setGalleryEditorExpanded(false)
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
        image.id === imageId ? { ...image, [field]: value } : image,
      ),
    }))
  }

  function addGalleryImage(nextUrl = '', entry = null) {
    const normalizedUrl = String(nextUrl ?? entry?.managedUrl ?? entry?.url ?? '').trim()
    const image = createImageEditor({
      alt: repairSnapshotText(entry?.alt ?? ''),
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
      const editorMode = editorState.mode
      const formStateToPersist = {
        ...nextFormState,
        shortDescription: mergePropertyShortDescription(nextFormState, nextFormState.shortDescription),
      }
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
      const savedProperty = await saveAdminProperty(
        buildPropertyDraft(formStateToPersist),
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
      setFeedback(error instanceof Error ? error.message : 'Unable to save property changes.')
      return null
    }
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
      const requestOptions = propertyUsesFirebase ? await getAdminRequestOptions() : {}
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
      const requestOptions = await getAdminRequestOptions()
      const hadUnsavedChanges = propertyDirty
      let currentFormState = {
        ...formState,
        active: nextActive,
      }

      if (hadUnsavedChanges) {
        const savedDraftProperty = await saveAdminProperty(
          buildPropertyDraft(currentFormState),
          currentFormState.originalSlug,
          requestOptions,
        )

        currentFormState = createFormState(savedDraftProperty)
      }

      const updatedProperty = await setAdminPropertyActiveState(currentFormState.originalSlug, nextActive, requestOptions)
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
      setGalleryEditorExpanded(false)

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

  async function saveSiteShellDraft() {
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
      const requestOptions = await getAdminRequestOptions()
      const publishedSiteShell = await publishAdminSiteShellContent(requestOptions)
      setSiteShellWorkspaceState({ status: 'ready', shell: publishedSiteShell.siteShell, message: '' })
      setSiteShellDraft(publishedSiteShell.siteShell)
      setSiteShellEditedSinceLoad(false)
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
    setSiteShellEditedSinceLoad(false)
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

    if (!window.confirm(`Delete "${selectedStructuredPage.navLabel || selectedStructuredPage.key}"? This cannot be undone.`)) {
      return
    }

    try {
      setPageDeleteStatus('saving')
      const requestOptions = await getAdminRequestOptions()
      await resetAdminStructuredPageContent(selectedStructuredPage.key, requestOptions)
      await reloadStructuredPageWorkspace()
      setPageDeleteStatus('idle')
      setPageFeedback(`Deleted "${selectedStructuredPage.navLabel || selectedStructuredPage.key}".`)
    } catch (error) {
      setPageDeleteStatus('error')
      setPageFeedback(error instanceof Error ? error.message : 'Unable to delete the page.')
    }
  }

  const properties = workspaceState.properties ?? []
  const propertyLocationOptions = buildPropertyLocationOptions(properties)
  const structuredPages = pageWorkspaceState.pages ?? []
  const siteShellRouteSuggestions = buildSiteShellRouteSuggestions({
    charters: charterWorkspaceState.charters,
    inventory: pageWorkspaceState.inventory,
    properties,
  })
  const selectedStructuredPage =
    structuredPages.find((page) => page.key === pageEditorState.activeKey) ?? structuredPages[0] ?? null
  const propertySaveEnabled = propertyEditingEnabled && (!propertyUsesFirebase || Boolean(authState.user))
  const propertyHasPendingPublication = hasPendingPublication(propertyPublication)
  const propertyActionBusy = saveStatus === 'saving' || saveStatus === 'publishing'
  const propertyPublishVisible = propertyUsesFirebase && editorState.mode === 'edit' && propertyHasPendingPublication
  const propertyPublishEnabled = propertyPublishVisible && propertySaveEnabled && !propertyDirty && !propertyActionBusy
  const propertyPreviewToggleVisible = Boolean(formState)
  const propertyPreviewModel = buildPropertyPreviewModel(formState)
  const charterSaveEnabled = charterEditingEnabled && (!charterUsesFirebase || Boolean(authState.user))
  const charterHasPendingPublication = hasPendingPublication(charterPublication)
  const charterPreviewModel = buildCharterPreviewModel(charterFormState)
  const siteContentDraftEditingEnabled = siteContentEditingEnabled
  const siteContentSaveEnabled = siteContentEditingEnabled && Boolean(authState.user)
  const siteShellHasPendingPublication = hasPendingPublication(siteShellPublication)
  const showSiteShellPublishAction = siteShellHasPendingPublication && siteShellEditedSinceLoad && !siteShellDirty
  const propertyFloatingSaveVisible = propertyPreviewToggleVisible || propertyDirty || propertyPublishVisible || propertyActionBusy

  useLayoutEffect(() => {
    if (activeTab !== 'properties' || !propertyFloatingSaveVisible) {
      setAdminFloatingStackOffset(ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR, 0)

      return () => {
        setAdminFloatingStackOffset(ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR, 0)
      }
    }

    return observeAdminFloatingStackOffset(propertyFloatingSaveRef.current, ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR)
  }, [activeTab, propertyFloatingSaveVisible])
  const pageHasPendingPublication = hasPendingPublication(pagePublication)
  const pagePreviewModeKey = `${activeTab === 'pages' ? 'pages' : 'hidden'}:${pageEditorState.activeKey}`
  const pagePreviewMode = pagePreviewViewState.key === pagePreviewModeKey ? pagePreviewViewState.mode : 'edit'
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
            active={activeTab === 'styles'}
            label="Styles"
            onClick={() => setActiveTab('styles')}
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
          <AdminTabButton
            active={activeTab === 'backups'}
            label="Backups"
            onClick={() => setActiveTab('backups')}
          />
        </div>
      </section>

      <section className="page-section admin-shell">
        <div className="admin-panel-stack">
          {activeTab === 'site-shell' ? (
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
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
                        label={showSiteShellPublishAction ? 'Publish shell changes' : 'Save shell changes'}
                        onReset={handleDiscardSiteShellChanges}
                        showReset={siteShellDirty}
                        saveStatus={siteShellSaveStatus}
                        visible={siteShellDirty || showSiteShellPublishAction}
                      />

                      <div className="admin-editor-workspace admin-editor-workspace--full-width">
                        <div>
                          <AdminSiteShellEditor
                            disabled={!siteContentDraftEditingEnabled}
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
            <section className="admin-panel">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Pages</div>
                  <h2>Pages</h2>
                </div>
                {siteContentEditingEnabled ? (
                  <div className="admin-inline-actions">
                    <button className="button-link button-link--ghost admin-action" type="button" onClick={openNewPageForm}>
                      New page
                    </button>
                  </div>
                ) : null}
              </div>

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
                      {selectedStructuredPage.contentModel === 'block-page' ? (
                        <button
                          className="button-link button-link--ghost admin-action"
                          disabled={pageDeleteStatus === 'saving'}
                          type="button"
                          onClick={handleDeleteStructuredPage}
                        >
                          {pageDeleteStatus === 'saving' ? 'Deleting...' : 'Delete page'}
                        </button>
                      ) : null}
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
                    <div className="admin-toolbar-row admin-toolbar-row--sticky">
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
                      <div className="admin-floating-save">
                        <div aria-label="Editor view" className="admin-property-preview-mode-toggle" role="group">
                          <button
                            aria-pressed={pagePreviewMode === 'edit'}
                            className={`button-link admin-action ${pagePreviewMode === 'edit' ? 'button-link--secondary' : 'button-link--ghost'}`}
                            type="button"
                            onClick={() => setPagePreviewViewState({ key: pagePreviewModeKey, mode: 'edit' })}
                          >
                            Edit
                          </button>
                          <button
                            aria-pressed={pagePreviewMode === 'preview'}
                            className={`button-link admin-action ${pagePreviewMode === 'preview' ? 'button-link--secondary' : 'button-link--ghost'}`}
                            type="button"
                            onClick={() => setPagePreviewViewState({ key: pagePreviewModeKey, mode: 'preview' })}
                          >
                            Preview
                          </button>
                        </div>

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

                        {pageDirty || pageHasPendingPublication ? (
                          <button
                            className="button-link button-link--primary admin-submit"
                            disabled={!siteContentSaveEnabled || pageSaveStatus === 'saving' || pageSaveStatus === 'publishing'}
                            type="submit"
                          >
                            {pageSaveStatus === 'publishing'
                              ? 'Publishing...'
                              : pageSaveStatus === 'saving'
                                ? 'Saving...'
                                : pageHasPendingPublication
                                  ? 'Publish page changes'
                                  : 'Save page changes'}
                          </button>
                        ) : null}
                      </div>

                      {pagePreviewMode === 'preview' ? (
                        <AdminPagePreview
                          device={pagePreviewDevice}
                          page={pageEditorState.draft}
                          pageKey={pageEditorState.activeKey}
                          routeInventory={pageWorkspaceState.inventory}
                          siteShell={siteShellDraft ?? siteShellWorkspaceState.shell}
                        />
                      ) : (
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
                      )}
                    </div>
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

              <AdminStyleEditor
                canPublishSiteShell={showSiteShellPublishAction}
                disabled={!siteContentDraftEditingEnabled || siteShellWorkspaceState.status !== 'ready'}
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
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Properties</div>
                  <h2>Properties</h2>
                </div>
                <div className="admin-inline-actions">
                  <button
                    className="button-link button-link--ghost admin-action"
                    disabled={propertyActionBusy}
                    type="button"
                    onClick={handleNewPropertyClick}
                  >
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
                    <select
                      disabled={propertyActionBusy}
                      value={editorState.mode === 'edit' ? editorState.activeSlug : ''}
                      onChange={handlePropertySelectionChange}
                    >
                      <option disabled hidden value="">
                        {editorState.mode === 'create' ? 'New property draft' : 'Select a property'}
                      </option>
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
                      {editorState.mode === 'edit' ? (
                        <span className="admin-chip">{propertyHasPendingPublication ? 'Draft saved' : 'Live version current'}</span>
                      ) : null}
                    </div>

                    <div className="admin-inline-actions">
                      {editorState.mode === 'edit' && editorState.activeSlug ? (
                        <Link className="button-link button-link--ghost admin-action" to={`/rental-properties/${editorState.activeSlug}`}>
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
                            ? 'Create active draft'
                            : 'Create inactive draft'}
                      </button>
                    </div>
                  </div>

                  <div className="admin-floating-save-shell">
                    {propertyFloatingSaveVisible ? (
                      <div className="admin-floating-save" ref={propertyFloatingSaveRef}>
                        {propertyPreviewToggleVisible ? (
                          <div aria-label="Editor view" className="admin-property-preview-mode-toggle" role="group">
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
                          <button
                            className="button-link button-link--ghost admin-action"
                            disabled={propertyActionBusy}
                            type="button"
                            onClick={handleDiscardPropertyChanges}
                          >
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

                        {(propertyDirty || saveStatus === 'saving') ? (
                          <button
                            className="button-link button-link--primary admin-submit"
                            disabled={!propertySaveEnabled || propertyActionBusy}
                            type="submit"
                          >
                            {saveStatus === 'saving' ? 'Saving...' : 'Save draft'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <AdminPropertyPreview
                      key={propertyPreviewEditorKey}
                      disabled={!propertySaveEnabled}
                      editable
                      formState={formState}
                      galleryEditorExpanded={galleryEditorExpanded}
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
