import { deleteJson, getJson, postJson } from './api'
import { buildPhoneHref } from './contactLinks'
import { DEFAULT_PROPERTY_TEMPLATE_VARIANT, normalizePropertyTemplateVariant } from './propertyTemplateVariants'
import { richTextValueToHtml, richTextValueToInlineHtml } from './richTextValue'
import { getRouteSlugVariants } from './routeSlug'
import { isApiBackedSiteContentSource } from './siteContentRepository'
import { normalizePropertyShortDescriptionDescriptorText } from './propertyShortDescription'

const liveCatalogUrl = '/livePropertyCatalog.json'
const MOCK_STORAGE_KEY = 'propertyCatalog'
const propertyDataSource = import.meta.env.VITE_PROPERTY_DATA_SOURCE ?? 'firebase'
const BLOCK_RICH_TEXT_PATTERN = /<\/?(?:blockquote|div|h[1-6]|li|ol|p|ul)\b/i
const PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES = ['ratesHtml', 'ratesTableHtml']
const PROPERTY_DESCRIPTION_SECTION_FIELD_NAMES = [...PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES, 'bookingHtml', 'policyHtml']
const LISTING_FEE_INTERVALS = new Set(['monthly', 'annual', 'one-time'])
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

function normalizeListingFeeInterval(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return LISTING_FEE_INTERVALS.has(normalized) ? normalized : ''
}

function normalizeDateOnlyValue(value) {
  const normalized = String(value ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function normalizeEnabledDescriptionSections(value, record = {}) {
  const contentSectionKeys = PROPERTY_DESCRIPTION_SECTION_FIELD_NAMES.filter((sectionKey) => String(record?.[sectionKey] ?? '').trim())
  const sourceKeys = Array.isArray(value) ? [...value, ...contentSectionKeys] : contentSectionKeys
  const activeRateSectionKey = sourceKeys.some((sectionKey) => PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey))
    ? getActiveRateDescriptionSectionKey(value, record)
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

function getActiveRateDescriptionSectionKey(value, record = {}) {
  const explicitRateSectionKeys = Array.isArray(value)
    ? value.filter((sectionKey) => PROPERTY_RATE_DESCRIPTION_SECTION_FIELD_NAMES.includes(sectionKey))
    : []
  const explicitRateSectionKey = explicitRateSectionKeys[explicitRateSectionKeys.length - 1] ?? ''
  const hasTextRates = Boolean(String(record?.ratesHtml ?? '').trim())
  const hasTableRates = Boolean(String(record?.ratesTableHtml ?? '').trim())

  if (explicitRateSectionKey && String(record?.[explicitRateSectionKey] ?? '').trim()) {
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

function normalizeRateDescriptionSections(record = {}, enabledDescriptionSections = []) {
  const activeRateSectionKey = getActiveRateDescriptionSectionKey(enabledDescriptionSections, record)

  return {
    ratesHtml: activeRateSectionKey === 'ratesHtml' ? String(record?.ratesHtml ?? '').trim() : '',
    ratesTableHtml: activeRateSectionKey === 'ratesTableHtml' ? String(record?.ratesTableHtml ?? '').trim() : '',
  }
}

function formatBedroomLabel(bedrooms) {
  return `${bedrooms} Bedroom${bedrooms === 1 ? '' : 's'}`
}

function normalizeAlternateBedroomCounts(values, primaryBedrooms = 0) {
  const normalizedPrimaryBedrooms = Number(primaryBedrooms) || 0

  if (!Array.isArray(values) || normalizedPrimaryBedrooms <= 1) {
    return []
  }

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0 && value < normalizedPrimaryBedrooms),
    ),
  ).sort((left, right) => left - right)
}

function buildAvailableBedroomCounts(primaryBedrooms, alternateBedroomCounts = [], rentFewerRooms = false) {
  const counts = new Set()
  const normalizedPrimaryBedrooms = Number(primaryBedrooms) || 0

  if (Number.isInteger(normalizedPrimaryBedrooms) && normalizedPrimaryBedrooms > 0) {
    counts.add(normalizedPrimaryBedrooms)
  }

  if (rentFewerRooms) {
    normalizeAlternateBedroomCounts(alternateBedroomCounts, normalizedPrimaryBedrooms).forEach((count) => {
      counts.add(count)
    })
  }

  return Array.from(counts).sort((left, right) => left - right)
}

function normalizeImageAsset(asset) {
  if (!asset?.url) {
    return null
  }

  return {
    url: String(asset.url).trim(),
    alt: String(asset.alt ?? '').trim(),
    title: String(asset.title ?? '').trim(),
    fileName: String(asset.fileName ?? '').trim(),
    width: asset.width ?? null,
    height: asset.height ?? null,
    originalFileName: String(asset.originalFileName ?? '').trim(),
    originalWidth: asset.originalWidth ?? null,
    originalHeight: asset.originalHeight ?? null,
    storagePath: String(asset.storagePath ?? '').trim(),
  }
}

function normalizeExternalLinks(links) {
  return Array.isArray(links)
    ? links
        .map((link) => {
          const href = String(link?.href ?? '').trim()
          const normalizedHref = href.toLowerCase()

          return {
            href,
            label: String(link?.label ?? '').trim(),
            isMailto: Boolean(link?.isMailto) || normalizedHref.startsWith('mailto:'),
            isPhone: Boolean(link?.isPhone) || normalizedHref.startsWith('tel:'),
            isInternal: Boolean(link?.isInternal),
          }
        })
        .filter((link) => link.href && link.label)
    : []
}

function decodeHtmlAttribute(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function normalizeAmenityRichValue(value = '') {
  return richTextValueToInlineHtml(String(value ?? '').trim())
}

function extractFirstHrefFromHtml(html = '', prefix = '') {
  const markup = String(html ?? '')
  const normalizedPrefix = String(prefix ?? '').trim().toLowerCase()

  if (!markup) {
    return ''
  }

  const hrefMatches = markup.matchAll(/href=(['"])(.*?)\1/gi)

  for (const match of hrefMatches) {
    const href = decodeHtmlAttribute(match[2]).trim()

    if (!href) {
      continue
    }

    if (!normalizedPrefix || href.toLowerCase().startsWith(normalizedPrefix)) {
      return href
    }
  }

  return ''
}

function extractContactValueFromHref(href = '', prefix = '') {
  const normalizedHref = String(href ?? '').trim()
  const normalizedPrefix = String(prefix ?? '').trim().toLowerCase()

  if (!normalizedHref || !normalizedPrefix || !normalizedHref.toLowerCase().startsWith(normalizedPrefix)) {
    return ''
  }

  const rawValue = normalizedHref.slice(normalizedPrefix.length).split('?')[0].trim()

  if (!rawValue) {
    return ''
  }

  try {
    return decodeURIComponent(rawValue)
  } catch {
    return rawValue
  }
}

function normalizePublicationState(publication) {
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    return null
  }

  return {
    hasUnpublishedChanges: publication.hasUnpublishedChanges === true,
    savedAt: publication.savedAt ?? null,
    savedBy: String(publication.savedBy ?? '').trim(),
    publishedAt: publication.publishedAt ?? null,
    publishedBy: String(publication.publishedBy ?? '').trim(),
  }
}

function normalizeAmenityGroups(groups) {
  return Array.isArray(groups)
    ? groups
        .map((group) => ({
          title: normalizeAmenityRichValue(group?.title ?? ''),
          items: Array.isArray(group?.items) ? group.items.map((item) => normalizeAmenityRichValue(item)).filter(Boolean) : [],
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
  const normalizedShortDescription = normalizePropertyShortDescriptionDescriptorText(shortDescription)

  if (normalizedShortDescription) {
    return normalizedShortDescription
  }

  return normalizePropertyShortDescriptionDescriptorText(fallbackLines.join('\n'))
}

function normalizePropertyBooking(record, externalLinks, descriptionHtml = '') {
  const bookingSource =
    record?.booking && typeof record.booking === 'object' && !Array.isArray(record.booking) ? record.booking : null
  const rawEmail = String(bookingSource?.email ?? '').trim()
  const rawPhone = String(bookingSource?.phone ?? '').trim()
  const emailLink =
    externalLinks.find((link) => link.isMailto)?.href || extractFirstHrefFromHtml(descriptionHtml, 'mailto:')
  const phoneLink =
    externalLinks.find((link) => link.isPhone)?.href || extractFirstHrefFromHtml(descriptionHtml, 'tel:')
  const booking = {
    contactName: String(bookingSource?.contactName ?? '').trim(),
    email: extractContactValueFromHref(rawEmail, 'mailto:') || rawEmail || extractContactValueFromHref(emailLink, 'mailto:'),
    phone: extractContactValueFromHref(rawPhone, 'tel:') || rawPhone || extractContactValueFromHref(phoneLink, 'tel:'),
    note: String(bookingSource?.note ?? '').trim(),
  }

  return booking.contactName || booking.email || booking.phone || booking.note ? booking : null
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
  const descriptionHtml = String(record.descriptionHtml ?? '').trim()
  const rateSections = normalizeRateDescriptionSections(
    {
      ratesHtml: String(record.ratesHtml ?? '').trim(),
      ratesTableHtml: String(record.ratesTableHtml ?? '').trim(),
    },
    record.enabledDescriptionSections,
  )
  const { ratesHtml, ratesTableHtml } = rateSections
  const bookingHtml = String(record.bookingHtml ?? '').trim()
  const policyHtml = String(record.policyHtml ?? '').trim()
  const enabledDescriptionSections = normalizeEnabledDescriptionSections(record.enabledDescriptionSections, {
    ratesHtml,
    ratesTableHtml,
    bookingHtml,
    policyHtml,
  })
  const hasStructuredDescriptionSections =
    record.hasStructuredDescriptionSections === true ||
    Array.isArray(record.enabledDescriptionSections) ||
    ['ratesHtml', 'ratesTableHtml', 'bookingHtml', 'policyHtml'].some((fieldName) =>
      Object.prototype.hasOwnProperty.call(record, fieldName),
    )
  const externalLinks = normalizeExternalLinks(record.externalLinks)
  const amenityGroups = normalizeAmenityGroups(record.amenityGroups)
  const bedrooms = Number(record.bedrooms) || 0
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(record.alternateBedroomCounts, bedrooms)
  const rentFewerRooms = (record.rentFewerRooms === true || alternateBedroomCounts.length > 0) && bedrooms > 1
  const availableBedroomCounts = buildAvailableBedroomCounts(bedrooms, alternateBedroomCounts, rentFewerRooms)

  const property = {
    ...recordWithoutLegacyLines,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    price: String(record.price ?? '').trim(),
    bedrooms,
    rentFewerRooms,
    alternateBedroomCounts,
    availableBedroomCounts,
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    shortDescription: normalizePropertyShortDescription(record.shortDescription, legacyLines),
    templateVariant: normalizePropertyTemplateVariant(record.templateVariant),
    bedroomLabel: formatBedroomLabel(bedrooms),
    location: String(record.location ?? '').trim(),
    calendarUrl: String(record.calendarUrl ?? '').trim(),
    clientId: String(record.clientId ?? '').trim(),
    listingFeeAmount: String(record.listingFeeAmount ?? '').trim(),
    listingFeeInterval: normalizeListingFeeInterval(record.listingFeeInterval),
    lastPaidAt: normalizeDateOnlyValue(record.lastPaidAt),
    renewalDueAt: normalizeDateOnlyValue(record.renewalDueAt),
    descriptionHtml,
    hasStructuredDescriptionSections,
    enabledDescriptionSections,
    ratesHtml,
    ratesTableHtml,
    bookingHtml,
    policyHtml,
    amenitiesHtml: amenityGroups.length > 0 ? amenityGroupsToHtml(amenityGroups) : String(record.amenitiesHtml ?? '').trim(),
    amenityGroups,
    reviewsHtml: String(record.reviewsHtml ?? '').trim(),
    reviewEntries: Array.isArray(record.reviewEntries) ? record.reviewEntries : [],
    booking: normalizePropertyBooking(record, externalLinks, [descriptionHtml, bookingHtml].filter(Boolean).join('\n')),
    heroImage,
    gallery,
    externalLinks,
    pageTitle: String(record.pageTitle ?? '').trim(),
    publication: normalizePublicationState(record.publication),
  }

  if (Object.prototype.hasOwnProperty.call(record, 'adminOriginalSlug')) {
    property.adminOriginalSlug = String(record.adminOriginalSlug ?? record.slug).trim()
  }

  return property
}

function normalizePropertySummaryRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  const heroImage = normalizeImageAsset(record.heroImage)
  const legacyLines = getLegacyPropertyLines(record)
  const bedrooms = Number(record.bedrooms) || 0
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(record.alternateBedroomCounts, bedrooms)
  const rentFewerRooms = (record.rentFewerRooms === true || alternateBedroomCounts.length > 0) && bedrooms > 1

  const property = {
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    price: String(record.price ?? '').trim(),
    shortDescription: normalizePropertyShortDescription(record.shortDescription, legacyLines),
    bedrooms,
    rentFewerRooms,
    alternateBedroomCounts,
    availableBedroomCounts: buildAvailableBedroomCounts(bedrooms, alternateBedroomCounts, rentFewerRooms),
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    location: String(record.location ?? '').trim(),
    templateVariant: normalizePropertyTemplateVariant(record.templateVariant),
    bedroomLabel: formatBedroomLabel(bedrooms),
    heroImage,
    amenitiesHtml: String(record.amenitiesHtml ?? '').trim(),
    clientId: String(record.clientId ?? '').trim(),
    listingFeeAmount: String(record.listingFeeAmount ?? '').trim(),
    listingFeeInterval: normalizeListingFeeInterval(record.listingFeeInterval),
    lastPaidAt: normalizeDateOnlyValue(record.lastPaidAt),
    renewalDueAt: normalizeDateOnlyValue(record.renewalDueAt),
  }

  if (Object.prototype.hasOwnProperty.call(record, 'adminOriginalSlug')) {
    property.adminOriginalSlug = String(record.adminOriginalSlug ?? record.slug).trim()
  }

  return property
}

function groupProperties(properties) {
  const groups = new Map()

  properties.forEach((property) => {
    const bedroomCounts =
      Array.isArray(property.availableBedroomCounts) && property.availableBedroomCounts.length > 0
        ? property.availableBedroomCounts
        : buildAvailableBedroomCounts(property.bedrooms, property.alternateBedroomCounts, property.rentFewerRooms)

    bedroomCounts.forEach((bedroomCount) => {
      if (!groups.has(bedroomCount)) {
        groups.set(bedroomCount, {
          bedrooms: bedroomCount,
          label: formatBedroomLabel(bedroomCount),
          properties: [],
        })
      }

      groups.get(bedroomCount).properties.push(property)
    })
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
    ;[property.slug, property.adminOriginalSlug].filter(Boolean).forEach((candidate) => {
      getRouteSlugVariants(candidate).forEach((variant) => {
        if (!index.has(variant)) {
          index.set(variant, property)
        }
      })
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

function findPropertyInCatalog(catalog, slug) {
  return getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)
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

function invalidatePropertyCaches() {
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
      const title = normalizeAmenityRichValue(group?.title ?? '')
      const items = Array.isArray(group?.items) ? group.items.map((item) => normalizeAmenityRichValue(item)).filter(Boolean) : []
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
        const quoteHtml = richTextValueToHtml(quote)
        lines.push(BLOCK_RICH_TEXT_PATTERN.test(quoteHtml) ? quoteHtml : `<p>${quoteHtml}</p>`)
      }

      return lines
    })
    .join('\n')
}

function buildPropertyRecordFromAdminDraft(draft, originalSlug = '') {
  const slug = String(draft?.slug ?? '').trim()
  const name = String(draft?.name ?? '').trim()

  if (!slug || !name) {
    throw new Error('Invalid property data: name and slug are required.')
  }

  const shortDescription = normalizePropertyShortDescription(draft?.shortDescription, getLegacyPropertyLines(draft))
  const descriptionHtml = String(draft?.descriptionHtml ?? '').trim()
  const rateSections = normalizeRateDescriptionSections(
    {
      ratesHtml: String(draft?.ratesHtml ?? '').trim(),
      ratesTableHtml: String(draft?.ratesTableHtml ?? '').trim(),
    },
    draft?.enabledDescriptionSections,
  )
  const { ratesHtml, ratesTableHtml } = rateSections
  const bookingHtml = String(draft?.bookingHtml ?? '').trim()
  const policyHtml = String(draft?.policyHtml ?? '').trim()
  const enabledDescriptionSections = normalizeEnabledDescriptionSections(draft?.enabledDescriptionSections, {
    ratesHtml,
    ratesTableHtml,
    bookingHtml,
    policyHtml,
  })
  const description = Array.isArray(draft?.description)
    ? draft.description.map((paragraph) => String(paragraph).trim()).filter(Boolean)
    : []
  const amenityGroups = Array.isArray(draft?.amenityGroups)
    ? draft.amenityGroups.map((group) => ({
        title: normalizeAmenityRichValue(group?.title ?? ''),
        items: Array.isArray(group?.items) ? group.items.map((item) => normalizeAmenityRichValue(item)).filter(Boolean) : [],
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
    phone: String(draft?.booking?.phone ?? '').trim(),
    note: String(draft?.booking?.note ?? '').trim(),
  }
  const bedrooms = Number(draft?.bedrooms) || 0
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(draft?.alternateBedroomCounts, bedrooms)
  const rentFewerRooms = Boolean(draft?.rentFewerRooms) && bedrooms > 1
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

  const phoneHref = buildPhoneHref(booking.phone)

  if (phoneHref) {
    externalLinks.push({
      href: phoneHref,
      label: booking.contactName ? `Call ${booking.contactName}` : 'Phone inquiry',
      isMailto: false,
      isPhone: true,
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
    bedrooms,
    rentFewerRooms,
    alternateBedroomCounts,
    bathrooms: Number(draft?.bathrooms) || 0,
    maxGuests: Number(draft?.maxGuests) || 0,
    shortDescription,
    location: String(draft?.location ?? '').trim(),
    calendarUrl: String(draft?.calendarUrl ?? '').trim(),
    clientId: String(draft?.clientId ?? '').trim(),
    listingFeeAmount: String(draft?.listingFeeAmount ?? '').trim(),
    listingFeeInterval: normalizeListingFeeInterval(draft?.listingFeeInterval),
    lastPaidAt: normalizeDateOnlyValue(draft?.lastPaidAt),
    renewalDueAt: normalizeDateOnlyValue(draft?.renewalDueAt),
    hasStructuredDescriptionSections: true,
    enabledDescriptionSections,
    description: description,
    descriptionHtml:
      descriptionHtml || (description.length > 0 ? paragraphListToHtml(description) : String(draft?.existingDescriptionHtml ?? '').trim()),
    ratesHtml,
    ratesTableHtml,
    bookingHtml,
    policyHtml,
    amenityGroups,
    amenitiesHtml:
      String(draft?.amenitiesHtml ?? '').trim() ||
      (amenityGroups.some((group) => group.title || group.items.length)
        ? amenityGroupsToHtml(amenityGroups)
        : String(draft?.existingAmenitiesHtml ?? '').trim()),
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

async function loadRemoteCatalog() {
  if (!remotePropertyCatalogPromise) {
    remotePropertyCatalogPromise = getJson('/properties/catalog')
      .then((payload) => buildCatalogFromPayload(payload))
      .catch((error) => {
        remotePropertyCatalogPromise = null
        throw error
      })
  }

  return remotePropertyCatalogPromise
}

async function loadLocalSummaryCatalog() {
  if (!localPropertySummaryCatalogPromise) {
    localPropertySummaryCatalogPromise = loadLocalCatalog().then((catalog) => {
      const properties = catalog.properties.map((property) => summarizeProperty(property))

      return {
        properties,
        groups: groupProperties(properties),
      }
    })
  }

  return localPropertySummaryCatalogPromise
}

async function loadRemoteSummaryCatalog() {
  if (!remotePropertySummaryCatalogPromise) {
    remotePropertySummaryCatalogPromise = getJson('/properties/summaries')
      .then((payload) => buildSummaryCatalogFromPayload(payload))
      .catch((error) => {
        remotePropertySummaryCatalogPromise = null
        throw error
      })
  }

  return remotePropertySummaryCatalogPromise
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

  if (isFirebasePropertyData() || isApiPropertyData()) {
    return loadRemoteSummaryCatalog()
  }

  return isApiBackedSiteContentSource() ? loadRemoteSummaryCatalog() : loadLocalSummaryCatalog()
}

async function loadAdminRemoteCatalog(options = {}) {
  return getJson('/admin/properties/catalog', options).then((payload) => buildCatalogFromPayload(payload))
}

async function loadAdminRemoteProperty(slug, options = {}) {
  const normalizedSlug = String(slug ?? '').trim()

  if (!normalizedSlug) {
    return null
  }

  return getJson(`/admin/properties/${encodeURIComponent(normalizedSlug)}`, options)
    .then((payload) => normalizePropertyRecord(payload?.property ?? payload))
    .catch((error) => {
      if (error?.status === 404) {
        return loadAdminRemoteCatalog(options).then((catalog) => findPropertyInCatalog(catalog, normalizedSlug) ?? null)
      }

      throw error
    })
}

function summarizeProperty(property) {
  const summary = {
    id: property.id,
    slug: property.slug,
    path: property.path,
    name: property.name,
    active: property.active !== false,
    price: property.price,
    shortDescription: property.shortDescription,
    bedrooms: property.bedrooms,
    rentFewerRooms: Boolean(property.rentFewerRooms),
    alternateBedroomCounts: normalizeAlternateBedroomCounts(property.alternateBedroomCounts, property.bedrooms),
    availableBedroomCounts: buildAvailableBedroomCounts(property.bedrooms, property.alternateBedroomCounts, property.rentFewerRooms),
    bathrooms: property.bathrooms,
    maxGuests: property.maxGuests,
    location: property.location,
    templateVariant: property.templateVariant,
    heroImage: property.heroImage,
    amenitiesHtml: property.amenitiesHtml,
    booking: property.booking,
    externalLinks: property.externalLinks,
    clientId: property.clientId,
    listingFeeAmount: property.listingFeeAmount,
    listingFeeInterval: property.listingFeeInterval,
    lastPaidAt: property.lastPaidAt,
    renewalDueAt: property.renewalDueAt,
  }

  if (property.adminOriginalSlug) {
    summary.adminOriginalSlug = property.adminOriginalSlug
  }

  return summary
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
  if (isMockPropertyData()) {
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

export async function listPropertySummaries(options = {}) {
  if ((isFirebasePropertyData() || isApiPropertyData()) && options.authToken) {
    const adminCatalog = await loadAdminRemoteCatalog(options)
    return cloneData(adminCatalog.properties.map((property) => summarizeProperty(property)))
  }

  const catalog = await loadSummaryCatalog()
  return cloneData(getPublishedProperties(catalog.properties).map((property) => summarizeProperty(property)))
}

export async function getPropertyBySlug(slug, options = {}) {
  if ((isFirebasePropertyData() || isApiPropertyData()) && options.authToken) {
    const property = await loadAdminRemoteProperty(slug, options)
    return property ? cloneData(property) : null
  }

  const catalog = await loadCatalog()
  const property = findPropertyInCatalog(catalog, slug)

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

  const payload = await postJson(
    '/admin/properties',
    { draft, originalSlug, expectedUpdatedAt: options.expectedUpdatedAt ?? null },
    options,
  )
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function publishAdminProperty(originalSlug, options = {}) {
  if (!isFirebasePropertyData()) {
    throw new Error('Property publishing is only available when VITE_PROPERTY_DATA_SOURCE=firebase.')
  }

  const payload = await postJson(
    '/admin/properties/publish',
    { originalSlug, expectedUpdatedAt: options.expectedUpdatedAt ?? null },
    options,
  )
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function setAdminPropertyActiveState(originalSlug, active, options = {}) {
  if (!isFirebasePropertyData()) {
    throw new Error('Property visibility updates are only available when VITE_PROPERTY_DATA_SOURCE=firebase.')
  }

  const payload = await postJson(
    '/admin/properties/active',
    { originalSlug, active: active !== false, expectedUpdatedAt: options.expectedUpdatedAt ?? null },
    options,
  )
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function setAdminPropertyBillingInfo(originalSlug, billing, options = {}) {
  if (!isFirebasePropertyData()) {
    throw new Error('Property billing updates are only available when VITE_PROPERTY_DATA_SOURCE=firebase.')
  }

  const payload = await postJson('/admin/properties/billing', { originalSlug, billing }, options)
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function setAdminPropertyClientId(originalSlug, clientId, options = {}) {
  if (!isFirebasePropertyData()) {
    throw new Error('Property client assignment is only available when VITE_PROPERTY_DATA_SOURCE=firebase.')
  }

  const payload = await postJson('/admin/properties/client', { originalSlug, clientId }, options)
  invalidatePropertyCaches()

  return cloneData(normalizePropertyRecord(payload?.property))
}

export async function deleteAdminProperty(originalSlug, options = {}) {
  const normalizedOriginalSlug = String(originalSlug ?? '').trim()

  if (!normalizedOriginalSlug) {
    throw new Error('Property identifier is required to delete.')
  }

  if (isMockPropertyData()) {
    const catalog = await loadMockCatalog()
    const properties = catalog.properties.filter((property) => property.slug !== normalizedOriginalSlug)

    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify({ properties }))
    mockCatalog = buildCatalogFromPayload({ properties })
    localPropertySummaryCatalogPromise = null

    return {
      name: catalog.properties.find((property) => property.slug === normalizedOriginalSlug)?.name || normalizedOriginalSlug,
      slug: normalizedOriginalSlug,
      tombstoned: false,
    }
  }

  if (!isFirebasePropertyData()) {
    throw new Error('Property deletion is only available when VITE_PROPERTY_DATA_SOURCE=mock or firebase.')
  }

  const payload = await deleteJson('/admin/properties', { ...options, body: { originalSlug: normalizedOriginalSlug } })
  invalidatePropertyCaches()

  return cloneData(payload?.property ?? null)
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
