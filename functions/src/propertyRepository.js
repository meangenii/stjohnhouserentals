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

const seedProperties = Array.isArray(propertyCatalog.properties)
  ? propertyCatalog.properties.map((property) => normalizePropertyRecord(property)).filter(Boolean)
  : []

function createFirestoreCatalogSetupError() {
  return new HttpError(
    503,
    'Cloud Firestore is not set up for this Firebase project yet. Create the default Firestore database before saving or seeding live property content.',
  )
}

async function readPropertyCollection() {
  let snapshot

  try {
    snapshot = await getDb().collection(PROPERTY_COLLECTION).get()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return []
    }

    throw error
  }

  return snapshot.docs
    .map((document) => normalizePropertyRecord({ ...document.data(), id: document.id }))
    .filter(Boolean)
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
        ...property,
        adminOriginalSlug: property.slug,
        updatedBy: actor,
        updatedAt: getServerTimestamp(),
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
  const propertiesFromFirestore = await readPropertyCollection()
  if (propertiesFromFirestore.length === 0) {
    throw new HttpError(
      503,
      'The Firestore property catalog is empty. Seed the Firestore property collection before serving live property content.',
    )
  }

  const propertySummaries = propertiesFromFirestore.map((property) => summarizeProperty(property))
  const propertyGroups = groupProperties(propertySummaries)
  const propertyIndex = new Map()

  propertiesFromFirestore.forEach((property) => {
    getRouteSlugVariants(property.slug).forEach((variant) => {
      if (!propertyIndex.has(variant)) {
        propertyIndex.set(variant, property)
      }
    })

    getRouteSlugVariants(property.adminOriginalSlug).forEach((variant) => {
      if (!propertyIndex.has(variant)) {
        propertyIndex.set(variant, property)
      }
    })
  })

  return {
    properties: propertiesFromFirestore,
    propertySummaries,
    propertyGroups,
    propertyIndex,
    source: 'firestore',
  }
}

function assertUniquePropertySlug(properties, nextSlug, originalSlug) {
  if (!nextSlug) {
    return
  }

  const hasConflict = properties.some(
    (property) => property.slug === nextSlug && property.adminOriginalSlug !== originalSlug && property.slug !== originalSlug,
  )

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
  const catalog = await getCanonicalPropertyCatalog()
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

  const catalog = await getCanonicalPropertyCatalog()
  const normalizedOriginalSlug = String(originalSlug ?? '').trim()
  const property = buildPropertyRecordFromAdminDraft(draft, normalizedOriginalSlug || draft?.slug)

  assertUniquePropertySlug(catalog.properties, property.slug, normalizedOriginalSlug)

  const collectionRef = getDb().collection(PROPERTY_COLLECTION)
  const nextDocId = property.slug
  const previousDocId = normalizedOriginalSlug || property.slug
  const batch = getDb().batch()

  if (previousDocId !== nextDocId) {
    batch.delete(collectionRef.doc(previousDocId))
  }

  batch.set(collectionRef.doc(nextDocId), {
    ...property,
    adminOriginalSlug: property.slug,
    updatedBy: adminUser.email || adminUser.uid,
    updatedAt: getServerTimestamp(),
  })

  await batch.commit()

  const savedSnapshot = await collectionRef.doc(nextDocId).get()
  return cloneData(normalizePropertyRecord({ ...savedSnapshot.data(), id: nextDocId }))
}

exports.resetPropertyRecordsToSeed = async function resetPropertyRecordsToSeed() {
  return syncSeedPropertiesToFirestore({ replace: true, actor: 'admin-reset' })
}

exports.seedPropertyRecords = async function seedPropertyRecords(options = {}) {
  return syncSeedPropertiesToFirestore(options)
}
