const charterCatalog = require('./generated/liveCharterCatalog.json')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { assertStorageImagesInValue } = require('./imagePolicy')

const CHARTER_COLLECTION = 'cmsCharters'

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

function getRouteSlugVariants(slug) {
  const normalizedSlug = String(slug ?? '').trim().toLowerCase()
  const collapsedSlug = normalizedSlug.replace(/-+/g, '-')
  const compactSlug = collapsedSlug.replace(/-/g, '')

  return [...new Set([normalizedSlug, collapsedSlug, compactSlug].filter(Boolean))]
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

function normalizeCharterRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  return {
    ...record,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    adminOriginalSlug: String(record.adminOriginalSlug ?? record.slug).trim(),
    path: String(record.path ?? `/charter-boat-rentals/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    shortDescription: String(record.shortDescription ?? '').trim(),
    phoneNumber: String(record.phoneNumber ?? '').trim(),
    email: String(record.email ?? '').trim(),
    website: String(record.website ?? '').trim(),
    heroImage: normalizeImageAsset(record.heroImage),
    pageTitle: String(record.pageTitle ?? '').trim(),
    contentHtml: String(record.contentHtml ?? '').trim(),
    externalLinks: normalizeExternalLinks(record.externalLinks),
  }
}

function paragraphListToHtml(values) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join('\n')
}

function buildCharterRecordFromAdminDraft(draft, originalSlug = '') {
  const slug = String(draft?.slug ?? '').trim()
  const name = String(draft?.name ?? '').trim()

  if (!slug || !name) {
    throw new Error('Invalid charter data: name and slug are required.')
  }

  assertStorageImagesInValue(draft, `Charter ${name || slug} image`)

  const contentParagraphs = Array.isArray(draft?.contentParagraphs)
    ? draft.contentParagraphs.map((paragraph) => String(paragraph).trim()).filter(Boolean)
    : []
  const email = String(draft?.email ?? '').trim()
  const website = String(draft?.website ?? '').trim()
  const phoneNumber = String(draft?.phoneNumber ?? '').trim()
  const externalLinks = []

  if (email) {
    externalLinks.push({
      href: `mailto:${email}`,
      label: 'Email charter',
      isMailto: true,
      isPhone: false,
      isInternal: false,
    })
  }

  if (phoneNumber) {
    externalLinks.push({
      href: `tel:${phoneNumber.replace(/[^\d+]/g, '')}`,
      label: 'Call charter',
      isMailto: false,
      isPhone: true,
      isInternal: false,
    })
  }

  if (website) {
    externalLinks.push({
      href: website,
      label: 'Visit website',
      isMailto: false,
      isPhone: false,
      isInternal: false,
    })
  }

  return normalizeCharterRecord({
    id: slug,
    slug,
    adminOriginalSlug: originalSlug || slug,
    path: `/charter-boat-rentals/${slug}`,
    name,
    active: draft?.active !== false,
    shortDescription: String(draft?.shortDescription ?? '').trim(),
    phoneNumber,
    email,
    website,
    heroImage: normalizeImageAsset(draft?.heroImage),
    pageTitle: name,
    contentHtml: paragraphListToHtml(contentParagraphs),
    externalLinks,
  })
}

const seedCharters = Array.isArray(charterCatalog.charters)
  ? charterCatalog.charters.map((charter) => normalizeCharterRecord(charter)).filter(Boolean)
  : []

function createFirestoreCatalogSetupError() {
  return new HttpError(
    503,
    'Cloud Firestore is not set up for this Firebase project yet. Create the default Firestore database before saving or seeding live charter content.',
  )
}

async function readCharterCollection() {
  let snapshot

  try {
    snapshot = await getDb().collection(CHARTER_COLLECTION).get()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return []
    }

    throw error
  }

  return snapshot.docs
    .map((document) => normalizeCharterRecord({ ...document.data(), id: document.id }))
    .filter(Boolean)
}

async function syncSeedChartersToFirestore({ replace = false, actor = 'seed-sync' } = {}) {
  try {
    const collectionRef = getDb().collection(CHARTER_COLLECTION)
    const snapshot = await collectionRef.get()
    const existingIds = new Set(snapshot.docs.map((document) => document.id))
    const seedIds = new Set(seedCharters.map((charter) => charter.slug))
    const batch = getDb().batch()

    let created = 0
    let updated = 0
    let deleted = 0

    seedCharters.forEach((charter) => {
      if (!replace && existingIds.has(charter.slug)) {
        return
      }

      batch.set(collectionRef.doc(charter.slug), {
        ...charter,
        adminOriginalSlug: charter.slug,
        updatedBy: actor,
        updatedAt: getServerTimestamp(),
      })

      if (existingIds.has(charter.slug)) {
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
      collection: CHARTER_COLLECTION,
      totalSeedRecords: seedCharters.length,
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

async function getCanonicalCharterCatalog() {
  const chartersFromFirestore = await readCharterCollection()
  if (chartersFromFirestore.length === 0) {
    throw new HttpError(
      503,
      'The Firestore charter catalog is empty. Seed the Firestore charter collection before serving live charter content.',
    )
  }

  const index = new Map()

  chartersFromFirestore.forEach((charter) => {
    getRouteSlugVariants(charter.slug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, charter)
      }
    })

    getRouteSlugVariants(charter.adminOriginalSlug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, charter)
      }
    })
  })

  return {
    charters: chartersFromFirestore,
    index,
    source: 'firestore',
  }
}

function assertUniqueCharterSlug(charters, nextSlug, originalSlug) {
  if (!nextSlug) {
    return
  }

  const hasConflict = charters.some(
    (charter) => charter.slug === nextSlug && charter.adminOriginalSlug !== originalSlug && charter.slug !== originalSlug,
  )

  if (hasConflict) {
    throw new Error(`A charter with slug "${nextSlug}" already exists.`)
  }
}

exports.listCharters = async function listCharters() {
  const catalog = await getCanonicalCharterCatalog()
  return cloneData(catalog.charters.filter((charter) => charter.active !== false))
}

exports.listAllCharters = async function listAllCharters() {
  const catalog = await getCanonicalCharterCatalog()
  return cloneData(catalog.charters)
}

exports.getCharterBySlug = async function getCharterBySlug(slug) {
  const catalog = await getCanonicalCharterCatalog()
  const charter = getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)

  if (!charter || charter.active === false) {
    return null
  }

  return cloneData(charter)
}

exports.saveCharterRecord = async function saveCharterRecord(draft, originalSlug, adminUser) {
  await syncSeedChartersToFirestore({ replace: false, actor: 'auto-seed' })

  const catalog = await getCanonicalCharterCatalog()
  const normalizedOriginalSlug = String(originalSlug ?? '').trim()
  const charter = buildCharterRecordFromAdminDraft(draft, normalizedOriginalSlug || draft?.slug)

  assertUniqueCharterSlug(catalog.charters, charter.slug, normalizedOriginalSlug)

  const collectionRef = getDb().collection(CHARTER_COLLECTION)
  const nextDocId = charter.slug
  const previousDocId = normalizedOriginalSlug || charter.slug
  const batch = getDb().batch()

  if (previousDocId !== nextDocId) {
    batch.delete(collectionRef.doc(previousDocId))
  }

  batch.set(collectionRef.doc(nextDocId), {
    ...charter,
    adminOriginalSlug: charter.slug,
    updatedBy: adminUser.email || adminUser.uid,
    updatedAt: getServerTimestamp(),
  })

  await batch.commit()

  const savedSnapshot = await collectionRef.doc(nextDocId).get()
  return cloneData(normalizeCharterRecord({ ...savedSnapshot.data(), id: nextDocId }))
}

exports.resetCharterRecordsToSeed = async function resetCharterRecordsToSeed() {
  return syncSeedChartersToFirestore({ replace: true, actor: 'admin-reset' })
}

exports.seedCharterRecords = async function seedCharterRecords(options = {}) {
  return syncSeedChartersToFirestore(options)
}
