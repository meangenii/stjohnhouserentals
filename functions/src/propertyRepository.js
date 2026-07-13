const propertyCatalog = require('./generated/livePropertyCatalog.json')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { assertStorageImagesInValue } = require('./imagePolicy')

const PROPERTY_COLLECTION = 'cmsProperties'
const DEFAULT_PROPERTY_TEMPLATE_VARIANT = 'fully-sectioned'
const PROPERTY_TEMPLATE_VARIANTS = new Set(['source-stack', 'supplemental-sections', 'fully-sectioned'])

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

function safeDecodeRouteSegment(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function safeEncodeRouteSegment(value) {
  try {
    return encodeURIComponent(value)
  } catch {
    return value
  }
}

function collectSlugCandidates(slug) {
  const base = String(slug ?? '').trim()

  if (!base) {
    return []
  }

  const decodedBase = safeDecodeRouteSegment(base)
  const directCandidates = [base, decodedBase]
  const apostropheCandidates = directCandidates.flatMap((value) => [
    value,
    value.replaceAll("'", '\u2019'),
    value.replaceAll('\u2019', "'"),
  ])

  return [...new Set([...apostropheCandidates, ...apostropheCandidates.map((value) => safeEncodeRouteSegment(value))])]
}

function addNormalizedSlugVariants(bucket, value) {
  const normalizedSlug = String(value ?? '').trim().toLowerCase()

  if (!normalizedSlug) {
    return
  }

  const collapsedSlug = normalizedSlug.replace(/-+/g, '-')
  const compactSlug = collapsedSlug.replace(/-/g, '')

  bucket.add(normalizedSlug)
  bucket.add(collapsedSlug)
  bucket.add(compactSlug)
}

function getRouteSlugVariants(slug) {
  const variants = new Set()

  collectSlugCandidates(slug).forEach((candidate) => {
    const trimmedCandidate = String(candidate ?? '').trim()

    if (!trimmedCandidate) {
      return
    }

    variants.add(trimmedCandidate)
    addNormalizedSlugVariants(variants, trimmedCandidate)
  })

  return Array.from(variants).filter(Boolean)
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
    originalWidth: asset.originalWidth ?? null,
    originalHeight: asset.originalHeight ?? null,
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

function buildPhoneHref(phone) {
  const normalizedPhone = String(phone ?? '').trim()

  if (!normalizedPhone) {
    return ''
  }

  if (normalizedPhone.toLowerCase().startsWith('tel:')) {
    return normalizedPhone
  }

  const hasLeadingPlus = normalizedPhone.startsWith('+')
  const digitsOnly = normalizedPhone.replace(/\D+/g, '')

  if (!digitsOnly) {
    return ''
  }

  return `tel:${hasLeadingPlus ? `+${digitsOnly}` : digitsOnly}`
}

function normalizePropertyTemplateVariant(value) {
  const normalizedValue = String(value ?? '').trim()
  return PROPERTY_TEMPLATE_VARIANTS.has(normalizedValue) ? normalizedValue : DEFAULT_PROPERTY_TEMPLATE_VARIANT
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
  const externalLinks = normalizeExternalLinks(record.externalLinks)
  const amenityGroups = normalizeAmenityGroups(record.amenityGroups)
  const bedrooms = Number(record.bedrooms) || 0
  const alternateBedroomCounts = normalizeAlternateBedroomCounts(record.alternateBedroomCounts, bedrooms)
  const rentFewerRooms = (record.rentFewerRooms === true || alternateBedroomCounts.length > 0) && bedrooms > 1
  const reviewEntries = Array.isArray(record.reviewEntries)
    ? record.reviewEntries
        .map((entry) => ({
          quote: String(entry?.quote ?? '').trim(),
          author: String(entry?.author ?? '').trim(),
        }))
        .filter((entry) => entry.quote || entry.author)
    : []

  return {
    ...recordWithoutLegacyLines,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    adminOriginalSlug: String(record.adminOriginalSlug ?? record.slug).trim(),
    path: String(record.path ?? `/rental-properties/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    price: String(record.price ?? '').trim(),
    bedrooms,
    rentFewerRooms,
    alternateBedroomCounts,
    availableBedroomCounts: buildAvailableBedroomCounts(bedrooms, alternateBedroomCounts, rentFewerRooms),
    bathrooms: Number(record.bathrooms) || 0,
    maxGuests: Number(record.maxGuests) || 0,
    shortDescription: normalizePropertyShortDescription(record.shortDescription, legacyLines),
    templateVariant: normalizePropertyTemplateVariant(record.templateVariant),
    bedroomLabel: formatBedroomLabel(bedrooms),
    location: String(record.location ?? '').trim(),
    calendarUrl: String(record.calendarUrl ?? '').trim(),
    descriptionHtml,
    amenitiesHtml: amenityGroups.length > 0 ? amenityGroupsToHtml(amenityGroups) : String(record.amenitiesHtml ?? '').trim(),
    amenityGroups,
    reviewsHtml: reviewEntries.length > 0 ? reviewEntriesToHtml(reviewEntries) : String(record.reviewsHtml ?? '').trim(),
    reviewEntries,
    booking: normalizePropertyBooking(record, externalLinks, descriptionHtml),
    heroImage,
    gallery,
    externalLinks,
    pageTitle: String(record.pageTitle ?? '').trim(),
  }
}

function normalizeStoredPropertyEnvelope(record, documentId = '') {
  const hasEnvelope =
    Boolean(record) &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    (Object.prototype.hasOwnProperty.call(record, 'draft') || Object.prototype.hasOwnProperty.call(record, 'published'))

  const draftSource = hasEnvelope ? record.draft ?? null : record
  const publishedSource = hasEnvelope ? record.published ?? null : record

  return {
    draft: draftSource ? normalizePropertyRecord({ ...draftSource, id: draftSource.id ?? documentId }) : null,
    published: publishedSource ? normalizePropertyRecord({ ...publishedSource, id: publishedSource.id ?? documentId }) : null,
    updatedAt: record?.updatedAt ?? null,
    updatedBy: String(record?.updatedBy ?? '').trim(),
    publishedAt: record?.publishedAt ?? record?.updatedAt ?? null,
    publishedBy: String(record?.publishedBy ?? record?.updatedBy ?? '').trim(),
  }
}

function buildPropertyPublicationState(envelope) {
  return {
    hasUnpublishedChanges: JSON.stringify(envelope?.draft ?? null) !== JSON.stringify(envelope?.published ?? null),
    savedAt: envelope?.updatedAt ?? null,
    savedBy: envelope?.updatedBy ?? '',
    publishedAt: envelope?.published ? envelope?.publishedAt ?? envelope?.updatedAt ?? null : null,
    publishedBy: envelope?.published ? envelope?.publishedBy || envelope?.updatedBy || '' : '',
  }
}

function buildPropertyViewFromStoredRecord(record, documentId = '', { mode = 'public' } = {}) {
  const envelope = normalizeStoredPropertyEnvelope(record, documentId)
  const selectedRecord = mode === 'admin' ? envelope.draft ?? envelope.published : envelope.published

  if (!selectedRecord) {
    return null
  }

  const property = {
    ...selectedRecord,
  }

  if (mode === 'admin') {
    property.adminOriginalSlug = documentId || selectedRecord.adminOriginalSlug || selectedRecord.slug
    property.publication = buildPropertyPublicationState(envelope)
  } else {
    property.active = selectedRecord.active !== false && envelope.draft?.active !== false
    delete property.adminOriginalSlug
    delete property.publication
  }

  return property
}

function buildPropertyCatalogFromStoredDocuments(documents, { mode = 'public' } = {}) {
  const properties = documents
    .map((document) => buildPropertyViewFromStoredRecord(document.data, document.id, { mode }))
    .filter(Boolean)
  const propertySummaries = properties.map((property) => summarizeProperty(property))
  const propertyGroups = groupProperties(propertySummaries)
  const propertyIndex = new Map()

  properties.forEach((property) => {
    const slugCandidates = mode === 'admin' ? [property.slug, property.adminOriginalSlug] : [property.slug]

    slugCandidates.forEach((candidate) => {
      getRouteSlugVariants(candidate).forEach((variant) => {
        if (!propertyIndex.has(variant)) {
          propertyIndex.set(variant, property)
        }
      })
    })
  })

  return {
    properties,
    propertySummaries,
    propertyGroups,
    propertyIndex,
    source: 'firestore',
  }
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
  }

  if (property.adminOriginalSlug) {
    summary.adminOriginalSlug = property.adminOriginalSlug
  }

  return summary
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

function buildPropertyRecordFromAdminDraft(draft, originalSlug = '') {
  const slug = String(draft?.slug ?? '').trim()
  const name = String(draft?.name ?? '').trim()

  if (!slug || !name) {
    throw new Error('Invalid property data: name and slug are required.')
  }

  assertStorageImagesInValue(draft, `Property ${name || slug} image`)

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
    descriptionHtml:
      descriptionHtml || (description.length > 0 ? paragraphListToHtml(description) : String(draft?.existingDescriptionHtml ?? '').trim()),
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

const seedProperties = Array.isArray(propertyCatalog.properties)
  ? propertyCatalog.properties.map((property) => normalizePropertyRecord(property)).filter(Boolean)
  : []
const seedPropertyIds = new Set(seedProperties.map((property) => property.slug))

function createFirestoreCatalogSetupError() {
  return new HttpError(
    503,
    'Cloud Firestore is not set up for this Firebase project yet. Create the default Firestore database before saving or seeding live property content.',
  )
}

async function readPropertyCollectionRaw() {
  let snapshot

  try {
    snapshot = await getDb().collection(PROPERTY_COLLECTION).get()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return []
    }

    throw error
  }

  return snapshot.docs.map((document) => ({
    id: document.id,
    data: document.data(),
  }))
}

async function syncSeedPropertiesToFirestore({ replace = false, actor = 'seed-sync' } = {}) {
  try {
    const collectionRef = getDb().collection(PROPERTY_COLLECTION)
    const snapshot = await collectionRef.get()
    const existingIds = new Set(snapshot.docs.map((document) => document.id))
    const seedIds = new Set(seedProperties.map((property) => property.slug))
    const batch = getDb().batch()

    let created = 0
    let updated = 0
    let deleted = 0

    seedProperties.forEach((property) => {
      if (!replace && existingIds.has(property.slug)) {
        return
      }

      batch.set(collectionRef.doc(property.slug), {
        draft: {
          ...property,
          adminOriginalSlug: property.slug,
        },
        published: {
          ...property,
          adminOriginalSlug: property.slug,
        },
        updatedBy: actor,
        updatedAt: getServerTimestamp(),
        publishedBy: actor,
        publishedAt: getServerTimestamp(),
      })

      if (existingIds.has(property.slug)) {
        updated += 1
      } else {
        created += 1
      }
    })

    if (replace) {
      snapshot.docs.forEach((document) => {
        if (!seedIds.has(document.id)) {
          batch.delete(document.ref)
          deleted += 1
        }
      })
    }

    if (created || updated || deleted) {
      await batch.commit()
    }

    return {
      collection: PROPERTY_COLLECTION,
      totalSeedRecords: seedProperties.length,
      created,
      updated,
      deleted,
      replace,
    }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createFirestoreCatalogSetupError()
    }

    throw error
  }
}

async function getCanonicalPropertyCatalog() {
  return getCanonicalPropertyCatalogForMode('public')
}

async function getCanonicalPropertyCatalogForMode(mode = 'public') {
  const propertyDocuments = await readPropertyCollectionRaw()
  const catalog = buildPropertyCatalogFromStoredDocuments(propertyDocuments, { mode })

  if (catalog.properties.length === 0 && propertyDocuments.length === 0 && mode !== 'admin') {
    throw new HttpError(
      503,
      'The Firestore property catalog is empty. Seed the Firestore property collection before serving live property content.',
    )
  }

  return catalog
}

function assertUniquePropertySlug(propertyDocuments, nextSlug, previousDocumentId = '') {
  if (!nextSlug) {
    return
  }

  const hasConflict = propertyDocuments.some((document) => {
    if (document.id === previousDocumentId) {
      return false
    }

    const envelope = normalizeStoredPropertyEnvelope(document.data, document.id)
    return envelope.draft?.slug === nextSlug || envelope.published?.slug === nextSlug
  })

  if (hasConflict) {
    throw new Error(`A property with slug "${nextSlug}" already exists.`)
  }
}

exports.listBedroomGroups = async function listBedroomGroups() {
  const catalog = await getCanonicalPropertyCatalog()
  return cloneData(groupProperties(getPublishedProperties(catalog.propertySummaries)))
}

exports.listProperties = async function listProperties() {
  const catalog = await getCanonicalPropertyCatalog()
  return cloneData(getPublishedProperties(catalog.properties))
}

exports.listAllProperties = async function listAllProperties() {
  const catalog = await getCanonicalPropertyCatalogForMode('admin')
  return cloneData(catalog.properties)
}

exports.listPropertySummaries = async function listPropertySummaries() {
  const catalog = await getCanonicalPropertyCatalog()
  return cloneData(getPublishedProperties(catalog.propertySummaries))
}

exports.getPropertyBySlug = async function getPropertyBySlug(slug) {
  const catalog = await getCanonicalPropertyCatalog()
  const property = getRouteSlugVariants(slug)
    .map((variant) => catalog.propertyIndex.get(variant))
    .find(Boolean)

  if (!property || !isPublishedProperty(property)) {
    return null
  }

  return cloneData(attachAdjacentProperties(property, getPublishedProperties(catalog.properties)))
}

exports.savePropertyRecord = async function savePropertyRecord(draft, originalSlug, adminUser) {
  await syncSeedPropertiesToFirestore({ replace: false, actor: 'auto-seed' })

  const propertyDocuments = await readPropertyCollectionRaw()
  const normalizedOriginalSlug = String(originalSlug ?? '').trim()
  const property = buildPropertyRecordFromAdminDraft(draft, normalizedOriginalSlug || draft?.slug)
  const currentDocument = propertyDocuments.find((document) => document.id === normalizedOriginalSlug)
  const currentEnvelope = currentDocument ? normalizeStoredPropertyEnvelope(currentDocument.data, currentDocument.id) : null

  assertUniquePropertySlug(propertyDocuments, property.slug, normalizedOriginalSlug)

  const collectionRef = getDb().collection(PROPERTY_COLLECTION)
  const nextDocId = property.slug
  const previousDocId = normalizedOriginalSlug || property.slug
  const batch = getDb().batch()

  if (previousDocId !== nextDocId) {
    batch.delete(collectionRef.doc(previousDocId))
  }

  batch.set(collectionRef.doc(nextDocId), {
    draft: {
      ...property,
      adminOriginalSlug: property.slug,
    },
    published: currentEnvelope?.published
      ? {
          ...currentEnvelope.published,
          adminOriginalSlug: currentEnvelope.published.adminOriginalSlug || currentEnvelope.published.slug,
        }
      : null,
    updatedBy: adminUser.email || adminUser.uid,
    updatedAt: getServerTimestamp(),
    publishedBy: currentEnvelope?.publishedBy || '',
    publishedAt: currentEnvelope?.publishedAt || null,
  })

  await batch.commit()

  const savedSnapshot = await collectionRef.doc(nextDocId).get()
  return cloneData(buildPropertyViewFromStoredRecord(savedSnapshot.data(), nextDocId, { mode: 'admin' }))
}

exports.publishPropertyRecord = async function publishPropertyRecord(originalSlug, adminUser) {
  await syncSeedPropertiesToFirestore({ replace: false, actor: 'auto-seed' })

  const documentId = String(originalSlug ?? '').trim()

  if (!documentId) {
    throw new HttpError(400, 'Property identifier is required to publish.')
  }

  const propertyDocuments = await readPropertyCollectionRaw()
  const currentDocument = propertyDocuments.find((document) => document.id === documentId)

  if (!currentDocument) {
    throw new HttpError(404, 'Property draft not found.')
  }

  const currentEnvelope = normalizeStoredPropertyEnvelope(currentDocument.data, currentDocument.id)

  if (!currentEnvelope.draft) {
    throw new HttpError(400, 'Property draft is missing and cannot be published.')
  }

  assertUniquePropertySlug(propertyDocuments, currentEnvelope.draft.slug, documentId)

  const collectionRef = getDb().collection(PROPERTY_COLLECTION)

  await collectionRef.doc(documentId).set({
    draft: {
      ...currentEnvelope.draft,
      adminOriginalSlug: currentEnvelope.draft.slug,
    },
    published: {
      ...currentEnvelope.draft,
      adminOriginalSlug: currentEnvelope.draft.slug,
    },
    updatedBy: adminUser.email || adminUser.uid,
    updatedAt: getServerTimestamp(),
    publishedBy: adminUser.email || adminUser.uid,
    publishedAt: getServerTimestamp(),
  })

  const savedSnapshot = await collectionRef.doc(documentId).get()
  return cloneData(buildPropertyViewFromStoredRecord(savedSnapshot.data(), documentId, { mode: 'admin' }))
}

exports.setPropertyActiveState = async function setPropertyActiveState(originalSlug, active, adminUser) {
  await syncSeedPropertiesToFirestore({ replace: false, actor: 'auto-seed' })

  const documentId = String(originalSlug ?? '').trim()

  if (!documentId) {
    throw new HttpError(400, 'Property identifier is required to update visibility.')
  }

  const collectionRef = getDb().collection(PROPERTY_COLLECTION)
  const snapshot = await collectionRef.doc(documentId).get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'Property record not found.')
  }

  const currentEnvelope = normalizeStoredPropertyEnvelope(snapshot.data(), documentId)
  const nextActive = active !== false
  const nextDraftSource = currentEnvelope.draft ?? currentEnvelope.published

  if (!nextDraftSource) {
    throw new HttpError(400, 'Property draft is missing and cannot be updated.')
  }

  const nextDraft = {
    ...nextDraftSource,
    active: nextActive,
    adminOriginalSlug: nextDraftSource.adminOriginalSlug || nextDraftSource.slug || documentId,
  }

  const nextPublished = currentEnvelope.published
    ? {
        ...currentEnvelope.published,
        active: nextActive,
        adminOriginalSlug: currentEnvelope.published.adminOriginalSlug || currentEnvelope.published.slug || documentId,
      }
    : null

  await collectionRef.doc(documentId).set({
    draft: nextDraft,
    published: nextPublished,
    updatedBy: adminUser.email || adminUser.uid,
    updatedAt: getServerTimestamp(),
    publishedBy: nextPublished ? adminUser.email || adminUser.uid : currentEnvelope?.publishedBy || '',
    publishedAt: nextPublished ? getServerTimestamp() : currentEnvelope?.publishedAt || null,
  })

  const savedSnapshot = await collectionRef.doc(documentId).get()
  return cloneData(buildPropertyViewFromStoredRecord(savedSnapshot.data(), documentId, { mode: 'admin' }))
}

exports.deletePropertyRecord = async function deletePropertyRecord(originalSlug, adminUser) {
  await syncSeedPropertiesToFirestore({ replace: false, actor: 'auto-seed' })

  const documentId = String(originalSlug ?? '').trim()

  if (!documentId) {
    throw new HttpError(400, 'Property identifier is required to delete.')
  }

  const collectionRef = getDb().collection(PROPERTY_COLLECTION)
  const snapshot = await collectionRef.doc(documentId).get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'Property record not found.')
  }

  const currentEnvelope = normalizeStoredPropertyEnvelope(snapshot.data(), documentId)
  const propertyName = currentEnvelope.draft?.name || currentEnvelope.published?.name || documentId
  const deletedBy = adminUser.email || adminUser.uid || 'admin'

  if (seedPropertyIds.has(documentId)) {
    await collectionRef.doc(documentId).set({
      deleted: true,
      deletedAt: getServerTimestamp(),
      deletedBy,
      draft: null,
      published: null,
      publishedAt: null,
      publishedBy: '',
      updatedAt: getServerTimestamp(),
      updatedBy: deletedBy,
    })

    return {
      name: propertyName,
      slug: documentId,
      tombstoned: true,
    }
  }

  await collectionRef.doc(documentId).delete()

  return {
    name: propertyName,
    slug: documentId,
    tombstoned: false,
  }
}

exports.resetPropertyRecordsToSeed = async function resetPropertyRecordsToSeed() {
  return syncSeedPropertiesToFirestore({ replace: true, actor: 'admin-reset' })
}

exports.seedPropertyRecords = async function seedPropertyRecords(options = {}) {
  return syncSeedPropertiesToFirestore(options)
}
