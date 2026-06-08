import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { deleteJson, getApiBaseUrl, getJson, postJson } from './api'
import { getFirestoreDb } from './firebase'
import { DEFAULT_PROPERTY_TEMPLATE_VARIANT, normalizePropertyTemplateVariant } from './propertyTemplateVariants'
import { getRouteSlugVariants } from './routeSlug'
import { isApiBackedSiteContentSource } from './siteContentRepository'

const FIRESTORE_PROPERTY_COLLECTION = 'cmsProperties'
const liveCatalogUrl = '/livePropertyCatalog.json'
const liveSummaryCatalogUrl = '/livePropertySummaryCatalog.json'
const MOCK_STORAGE_KEY = 'propertyCatalog'
const propertyDataSource = import.meta.env.VITE_PROPERTY_DATA_SOURCE ?? 'local'

let firebasePropertyCatalogPromise = null
let localPropertyCatalogPromise = null
let remotePropertyCatalogPromise = null
let localPropertySummaryCatalogPromise = null
let remotePropertySummaryCatalogPromise = null
let mockCatalog = null

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatBedroomLabel(bedrooms) {
  return `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}`
}

function normalizeImageAsset(asset) {
  if (!asset?.url) {
    return null
  }

  return {
    url: String(asset.url).trim(),
    alt: String(asset.alt ?? '').trim(),
    title: String(asset.title ?? '').trim(),
    width: asset.width ?? null,
    height: asset.height ?? null,
  }
}

function normalizeExternalLinks(links) {
  return Array.isArray(links)
    ? links
        .map((link) => ({
          href: String(link?.href ?? '').trim(),
          label: String(link?.label ?? '').trim(),
          isMailto: Boolean(link?.isMailto),
          isPhone: Boolean(link?.isPhone),
          isInternal: Boolean(link?.isInternal),
        }))
        .filter((link) => link.href && link.label)
    : []
}

function normalizeAmenityGroups(groups) {
  return Array.isArray(groups)
    ? groups
        .map((group) => ({
          title: String(group?.title ?? '').trim(),
          items: Array.isArray(group?.items) ? group.items.map((item) => String(item).trim()).filter(Boolean) : [],
        }))
        .filter((group) => group.title || group.items.length)
    : []
}

function normalizeLegacyPropertyLines(values) {
  return Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : []
}

function getLegacyPropertyLines(record) {
  const factLines = normalizeLegacyPropertyLines(record?.facts)

  if (factLines.length > 0) {
    return factLines
  }

  return normalizeLegacyPropertyLines(record?.highlights)
}

function normalizePropertyShortDescription(shortDescription, fallbackLines = []) {
  const normalizedShortDescription = String(shortDescription ?? '').trim()

  if (normalizedShortDescription) {
    return normalizedShortDescription
  }

  return fallbackLines.join('\n')
}

function stripFirestoreMetadata(record) {
  const content = { ...(record ?? {}) }
  delete content.updatedAt
  delete content.updatedBy
  return content
}

function normalizePropertyRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  const recordWithoutLegacyLines = { ...(record ?? {}) }
  delete recordWithoutLegacyLines.facts
  delete recordWithoutLegacyLines.highlights
  const gallery = Array.isArray(record.gallery)
    ? record.gallery.map((asset) => normalizeImageAsset(asset)).filter(Boolean)
    : []
  const heroImage = normalizeImageAsset(record.heroImage) ?? gallery[0] ?? null
  const legacyLines = getLegacyPropertyLines(record)

  return {
    ...recordWithoutLegacyLines,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    adminOriginalSlug: String(record.adminOriginalSlug ?? record.slug).trim(),
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    price: String(record.price ?? '').trim(),
    bedrooms: Number(record.bedrooms) || 0,
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    shortDescription: normalizePropertyShortDescription(record.shortDescription, legacyLines),
    templateVariant: normalizePropertyTemplateVariant(record.templateVariant),
    bedroomLabel: formatBedroomLabel(Number(record.bedrooms) || 0),
    location: String(record.location ?? '').trim(),
    descriptionHtml: String(record.descriptionHtml ?? '').trim(),
    amenitiesHtml: String(record.amenitiesHtml ?? '').trim(),
    amenityGroups: normalizeAmenityGroups(record.amenityGroups),
    reviewsHtml: String(record.reviewsHtml ?? '').trim(),
    reviewEntries: Array.isArray(record.reviewEntries) ? record.reviewEntries : [],
    booking:
      record.booking && typeof record.booking === 'object'
        ? {
            contactName: String(record.booking.contactName ?? '').trim(),
            email: String(record.booking.email ?? '').trim(),
            note: String(record.booking.note ?? '').trim(),
          }
        : null,
    heroImage,
    gallery,
    externalLinks: normalizeExternalLinks(record.externalLinks),
    pageTitle: String(record.pageTitle ?? '').trim(),
  }
}

function normalizePropertySummaryRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  const heroImage = normalizeImageAsset(record.heroImage)
  const legacyLines = getLegacyPropertyLines(record)

  return {
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    adminOriginalSlug: String(record.adminOriginalSlug ?? record.slug).trim(),
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    price: String(record.price ?? '').trim(),
    shortDescription: normalizePropertyShortDescription(record.shortDescription, legacyLines),
    bedrooms: Number(record.bedrooms) || 0,
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    templateVariant: normalizePropertyTemplateVariant(record.templateVariant),
    bedroomLabel: formatBedroomLabel(Number(record.bedrooms) || 0),
    heroImage,
  }
}

function groupProperties(properties) {
  const groups = new Map()

  properties.forEach((property) => {
    if (!groups.has(property.bedrooms)) {
      groups.set(property.bedrooms, {
        bedrooms: property.bedrooms,
        label: formatBedroomLabel(property.bedrooms),
        properties: [],
      })
    }

    groups.get(property.bedrooms).properties.push(property)
  })

  return Array.from(groups.values())
}

function isPublishedProperty(property) {
  return property?.active !== false
}

function getPublishedProperties(properties) {
  return Array.isArray(properties) ? properties.filter((property) => isPublishedProperty(property)) : []
}

function attachAdjacentProperties(property, properties) {
  const index = properties.findIndex((candidate) => candidate.slug === property.slug)

  if (index === -1) {
    return property
  }

  const previousProperty = properties[index - 1]
  const nextProperty = properties[index + 1]

  return {
    ...property,
    previousProperty: previousProperty
      ? { slug: previousProperty.slug, name: previousProperty.name, path: previousProperty.path }
      : null,
    nextProperty: nextProperty
      ? { slug: nextProperty.slug, name: nextProperty.name, path: nextProperty.path }
      : null,
  }
}

function buildCatalogFromPayload(payload) {
  const properties = Array.isArray(payload?.properties)
    ? payload.properties.map((property) => normalizePropertyRecord(property)).filter(Boolean)
    : []
  const index = new Map()

  properties.forEach((property) => {
    getRouteSlugVariants(property.slug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, property)
      }
    })

    getRouteSlugVariants(property.adminOriginalSlug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, property)
      }
    })
  })

  return {
    properties,
    groups: groupProperties(properties),
    index,
  }
}

function buildSummaryCatalogFromPayload(payload) {
  const properties = Array.isArray(payload?.properties)
    ? payload.properties.map((property) => normalizePropertySummaryRecord(property)).filter(Boolean)
    : []

  return {
    properties,
    groups: groupProperties(properties),
  }
}

function fetchCatalog(url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Property catalog request failed with status ${response.status}`)
      }

      return response.json()
    })
    .then((payload) => buildCatalogFromPayload(payload))
}

function fetchSummaryCatalog(url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Property summary catalog request failed with status ${response.status}`)
      }

      return response.json()
    })
    .then((payload) => buildSummaryCatalogFromPayload(payload))
}

function invalidatePropertyCaches() {
  firebasePropertyCatalogPromise = null
  remotePropertyCatalogPromise = null
  remotePropertySummaryCatalogPromise = null
}

function paragraphListToHtml(values) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join('\n')
}

function amenityGroupsToHtml(groups) {
  return groups
    .flatMap((group) => {
      const title = String(group?.title ?? '').trim()
      const items = Array.isArray(group?.items) ? group.items.map((item) => String(item).trim()).filter(Boolean) : []
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

function reviewEntriesToHtml(entries) {
  return entries
    .flatMap((entry) => {
      const author = String(entry?.author ?? '').trim()
      const quote = String(entry?.quote ?? '').trim()
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

async function fetchFirebaseCatalog() {
  const db = getFirestoreDb()

  if (!db) {
    throw new Error('Firebase client configuration is missing. Fill in the VITE_FIREBASE_* values first.')
  }

  const snapshot = await getDocs(query(collection(db, FIRESTORE_PROPERTY_COLLECTION), orderBy('name')))
  const properties = snapshot.docs
    .map((documentSnapshot) =>
      normalizePropertyRecord({
        id: documentSnapshot.id,
        ...stripFirestoreMetadata(documentSnapshot.data()),
      }),
    )
    .filter(Boolean)

  if (properties.length === 0) {
    throw new Error('The Firestore property catalog is empty.')
  }

  return buildCatalogFromPayload({ properties })
}

function buildPropertyRecordFromAdminDraft(draft, originalSlug = '') {
  const slug = String(draft?.slug ?? '').trim()
  const name = String(draft?.name ?? '').trim()

  if (!slug || !name) {
    throw new Error('Invalid property data: name and slug are required.')
  }

  const shortDescription = normalizePropertyShortDescription(draft?.shortDescription, getLegacyPropertyLines(draft))
  const descriptionHtml = String(draft?.descriptionHtml ?? '').trim()
  const description = Array.isArray(draft?.description)
    ? draft.description.map((paragraph) => String(paragraph).trim()).filter(Boolean)
    : []
  const amenityGroups = Array.isArray(draft?.amenityGroups)
    ? draft.amenityGroups.map((group) => ({
        title: String(group?.title ?? '').trim(),
        items: Array.isArray(group?.items) ? group.items.map((item) => String(item).trim()).filter(Boolean) : [],
      }))
    : []
  const reviewEntries = Array.isArray(draft?.reviewEntries)
    ? draft.reviewEntries
        .map((entry) => ({
          quote: String(entry?.quote ?? '').trim(),
          author: String(entry?.author ?? '').trim(),
        }))
        .filter((entry) => entry.quote || entry.author)
    : []
  const booking = {
    contactName: String(draft?.booking?.contactName ?? '').trim(),
    email: String(draft?.booking?.email ?? '').trim(),
    note: String(draft?.booking?.note ?? '').trim(),
  }
  const heroImage = normalizeImageAsset(draft?.heroImage)
  const gallery = Array.isArray(draft?.gallery)
    ? draft.gallery.map((asset) => normalizeImageAsset(asset)).filter(Boolean)
    : heroImage
      ? [heroImage]
      : []
  const externalLinks = []

  if (booking.email) {
    externalLinks.push({
      href: `mailto:${booking.email}`,
      label: booking.contactName ? `Email ${booking.contactName}` : 'Email inquiry',
      isMailto: true,
      isPhone: false,
      isInternal: false,
    })
  }

  return normalizePropertyRecord({
    id: slug,
    slug,
    adminOriginalSlug: originalSlug || slug,
    path: `/rental-properties/${slug}`,
    name,
    active: draft?.active !== false,
    templateVariant: normalizePropertyTemplateVariant(draft?.templateVariant ?? DEFAULT_PROPERTY_TEMPLATE_VARIANT),
    price: String(draft?.price ?? '').trim(),
    bedrooms: Number(draft?.bedrooms) || 0,
    bathrooms: Number(draft?.bathrooms) || 0,
    maxGuests: Number(draft?.maxGuests) || 0,
    shortDescription,
    location: String(draft?.location ?? '').trim(),
    description: description,
    descriptionHtml:
      descriptionHtml || (description.length > 0 ? paragraphListToHtml(description) : String(draft?.existingDescriptionHtml ?? '').trim()),
    amenityGroups,
    amenitiesHtml:
      amenityGroups.some((group) => group.title || group.items.length)
        ? amenityGroupsToHtml(amenityGroups)
        : String(draft?.existingAmenitiesHtml ?? '').trim(),
    reviewsHtml:
      reviewEntries.length > 0 ? reviewEntriesToHtml(reviewEntries) : String(draft?.existingReviewsHtml ?? '').trim(),
    reviewEntries,
    booking,
    heroImage,
    gallery: gallery.length > 0 ? gallery : heroImage ? [heroImage] : [],
    externalLinks,
    pageTitle: name,
  })
}

async function loadLocalCatalog() {
  if (!localPropertyCatalogPromise) {
    localPropertyCatalogPromise = fetchCatalog(liveCatalogUrl)
  }

  return localPropertyCatalogPromise
}

async function loadFirebaseCatalog() {
  if (!firebasePropertyCatalogPromise) {
    firebasePropertyCatalogPromise = fetchFirebaseCatalog().catch((error) => {
      firebasePropertyCatalogPromise = null
      throw error
    })
  }

  return firebasePropertyCatalogPromise
}

async function loadRemoteCatalog() {
  if (!remotePropertyCatalogPromise) {
    remotePropertyCatalogPromise = getJson('/properties/catalog')
      .then((payload) => buildCatalogFromPayload(payload))
      .catch((error) => {
        remotePropertyCatalogPromise = null

        if (isFirebasePropertyData()) {
          throw error
        }

        return loadLocalCatalog()
      })
  }

  return remotePropertyCatalogPromise
}

async function loadLocalSummaryCatalog() {
  if (!localPropertySummaryCatalogPromise) {
    localPropertySummaryCatalogPromise = fetchSummaryCatalog(liveSummaryCatalogUrl)
  }

  return localPropertySummaryCatalogPromise
}

async function loadRemoteSummaryCatalog() {
  if (!remotePropertySummaryCatalogPromise) {
    remotePropertySummaryCatalogPromise = getJson('/properties/summaries')
      .then((payload) => buildSummaryCatalogFromPayload(payload))
      .catch((error) => {
        remotePropertySummaryCatalogPromise = null

        if (isFirebasePropertyData()) {
          throw error
        }

        return loadLocalSummaryCatalog()
      })
  }

  return remotePropertySummaryCatalogPromise
}

async function loadFirebaseSummaryCatalog() {
  const catalog = await loadFirebaseCatalog()
  const properties = catalog.properties.map((property) => summarizeProperty(property))

  return {
    properties,
    groups: groupProperties(properties),
  }
}

async function loadMockCatalog() {
  if (!mockCatalog) {
    const stored = localStorage.getItem(MOCK_STORAGE_KEY)

    if (stored) {
      try {
        mockCatalog = buildCatalogFromPayload(JSON.parse(stored))
      } catch {
        mockCatalog = null
      }
    }

    if (!mockCatalog) {
      mockCatalog = await loadLocalCatalog()
    }
  }

  return mockCatalog
}

async function loadCatalog() {
  if (isMockPropertyData()) {
    return loadMockCatalog()
  }

  if (usesDirectFirestorePropertyReads()) {
    return loadFirebaseCatalog()
  }

  if (isFirebasePropertyData() || isApiPropertyData()) {
    return loadRemoteCatalog()
  }

  return isApiBackedSiteContentSource() ? loadRemoteCatalog() : loadLocalCatalog()
}

async function loadSummaryCatalog() {
  if (isMockPropertyData()) {
    const catalog = await loadMockCatalog()

    return {
      properties: catalog.properties.map((property) => summarizeProperty(property)),
      groups: groupProperties(catalog.properties.map((property) => summarizeProperty(property))),
    }
  }

  if (usesDirectFirestorePropertyReads()) {
    return loadFirebaseSummaryCatalog()
  }

  if (isFirebasePropertyData() || isApiPropertyData()) {
    return loadRemoteSummaryCatalog()
  }

  return isApiBackedSiteContentSource() ? loadRemoteSummaryCatalog() : loadLocalSummaryCatalog()
}

async function loadAdminRemoteCatalog(options = {}) {
  return getJson('/admin/properties/catalog', options).then((payload) => buildCatalogFromPayload(payload))
}

function summarizeProperty(property) {
  return {
    id: property.id,
    slug: property.slug,
    adminOriginalSlug: property.adminOriginalSlug ?? property.slug,
    path: property.path,
    name: property.name,
    active: property.active !== false,
    price: property.price,
    shortDescription: property.shortDescription,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    maxGuests: property.maxGuests,
    templateVariant: property.templateVariant,
    heroImage: property.heroImage,
  }
}

export function getPropertyDataSourceMode() {
  return propertyDataSource
}

export function isMockPropertyData() {
  return propertyDataSource === 'mock'
}

export function isFirebasePropertyData() {
  return propertyDataSource === 'firebase'
}

export function isApiPropertyData() {
  return propertyDataSource === 'api'
}

function usesDirectFirestorePropertyReads() {
  return isFirebasePropertyData() && getApiBaseUrl() !== '/api'
}

export function isPropertyEditingEnabled() {
  return isMockPropertyData() || isFirebasePropertyData()
}

export async function listBedroomGroups() {
  const catalog = await loadSummaryCatalog()
  return cloneData(groupProperties(getPublishedProperties(catalog.properties)))
}

export async function listProperties() {
  const catalog = await loadCatalog()
  return cloneData(getPublishedProperties(catalog.properties))
}

export async function listAllProperties(options = {}) {
  if (isMockPropertyData() || usesDirectFirestorePropertyReads()) {
    const catalog = await loadCatalog()
    return cloneData(catalog.properties)
  }

  if ((isFirebasePropertyData() || isApiPropertyData()) && options.authToken) {
    const adminCatalog = await loadAdminRemoteCatalog(options)
    return cloneData(adminCatalog.properties)
  }

  const catalog = await loadCatalog()
  return cloneData(catalog.properties)
}

export async function listPropertySummaries() {
  const catalog = await loadSummaryCatalog()
  return cloneData(getPublishedProperties(catalog.properties).map((property) => summarizeProperty(property)))
}

export async function getPropertyBySlug(slug) {
  const catalog = await loadCatalog()
  const property = getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)

  if (!property || !isPublishedProperty(property)) {
    return null
  }

  return cloneData(attachAdjacentProperties(property, getPublishedProperties(catalog.properties)))
}

export async function saveAdminProperty(draft, originalSlug, options = {}) {
  if (isMockPropertyData()) {
    const catalog = await loadMockCatalog()
    const normalized = buildPropertyRecordFromAdminDraft(draft, originalSlug)
    const properties = [...catalog.properties]
    const existingIndex = originalSlug ? properties.findIndex((property) => property.slug === originalSlug) : -1
    const conflictingProperty = properties.find(
      (property) => property.slug === normalized.slug && property.slug !== originalSlug,
    )

    if (conflictingProperty) {
      throw new Error(`A property with slug "${normalized.slug}" already exists.`)
    }

    if (existingIndex >= 0) {
      properties[existingIndex] = normalized
    } else {
      properties.push(normalized)
    }

    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify({ properties }))
    mockCatalog = buildCatalogFromPayload({ properties })
    localPropertySummaryCatalogPromise = null

    return cloneData(normalized)
  }

  if (!isFirebasePropertyData()) {
    throw new Error('Property editing is only available when VITE_PROPERTY_DATA_SOURCE=mock or firebase.')
  }

  const payload = await postJson('/admin/properties', { draft, originalSlug }, options)
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function resetAdminProperties(options = {}) {
  if (isMockPropertyData()) {
    localStorage.removeItem(MOCK_STORAGE_KEY)
    mockCatalog = null
    localPropertyCatalogPromise = null
    localPropertySummaryCatalogPromise = null
    return
  }

  if (!isFirebasePropertyData()) {
    return
  }

  await deleteJson('/admin/properties/overrides', options)
  invalidatePropertyCaches()
}

export async function getMockPropertyCount() {
  const catalog = await loadCatalog()
  return catalog.properties.length
}
