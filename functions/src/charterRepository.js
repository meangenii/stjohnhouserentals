const charterCatalog = require('./generated/liveCharterCatalog.json')
const {
  HttpError,
  assertExpectedUpdatedAtMatches,
  getDb,
  getServerTimestamp,
  hasExpectedUpdatedAt,
  isFirestoreUnavailableError,
  toEpochMillis,
} = require('./firebaseAdmin')
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
    originalWidth: asset.originalWidth ?? null,
    originalHeight: asset.originalHeight ?? null,
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

function normalizeStoredCharterEnvelope(record, documentId = '') {
  const hasEnvelope =
    Boolean(record) &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    (Object.prototype.hasOwnProperty.call(record, 'draft') || Object.prototype.hasOwnProperty.call(record, 'published'))

  const draftSource = hasEnvelope ? record.draft ?? null : record
  const publishedSource = hasEnvelope ? record.published ?? draftSource ?? null : record

  return {
    draft: draftSource ? normalizeCharterRecord({ ...draftSource, id: draftSource.id ?? documentId }) : null,
    published: publishedSource ? normalizeCharterRecord({ ...publishedSource, id: publishedSource.id ?? documentId }) : null,
    updatedAt: toEpochMillis(record?.updatedAt),
    updatedBy: String(record?.updatedBy ?? '').trim(),
    publishedAt: toEpochMillis(record?.publishedAt) ?? toEpochMillis(record?.updatedAt),
    publishedBy: String(record?.publishedBy ?? record?.updatedBy ?? '').trim(),
  }
}

function buildCharterPublicationState(envelope) {
  return {
    hasUnpublishedChanges: JSON.stringify(envelope?.draft ?? null) !== JSON.stringify(envelope?.published ?? null),
    savedAt: envelope?.updatedAt ?? null,
    savedBy: envelope?.updatedBy ?? '',
    publishedAt: envelope?.published ? envelope?.publishedAt ?? envelope?.updatedAt ?? null : null,
    publishedBy: envelope?.published ? envelope?.publishedBy || envelope?.updatedBy || '' : '',
  }
}

function buildCharterViewFromStoredRecord(record, documentId = '', { mode = 'public' } = {}) {
  const envelope = normalizeStoredCharterEnvelope(record, documentId)
  const selectedRecord = mode === 'admin' ? envelope.draft : envelope.published

  if (!selectedRecord) {
    return null
  }

  const charter = {
    ...selectedRecord,
  }

  if (mode === 'admin') {
    charter.adminOriginalSlug = documentId || selectedRecord.adminOriginalSlug || selectedRecord.slug
    charter.publication = buildCharterPublicationState(envelope)
  } else {
    charter.active = selectedRecord.active !== false && envelope.draft?.active !== false
    delete charter.adminOriginalSlug
    delete charter.publication
    delete charter.updatedAt
    delete charter.updatedBy
    delete charter.publishedAt
    delete charter.publishedBy
  }

  return charter
}

function buildCharterCatalogFromStoredDocuments(documents, { mode = 'public' } = {}) {
  const charters = documents
    .map((document) => buildCharterViewFromStoredRecord(document.data, document.id, { mode }))
    .filter(Boolean)
  const index = new Map()

  charters.forEach((charter) => {
    const slugCandidates = mode === 'admin' ? [charter.slug, charter.adminOriginalSlug] : [charter.slug]

    slugCandidates.forEach((candidate) => {
      getRouteSlugVariants(candidate).forEach((variant) => {
        if (!index.has(variant)) {
          index.set(variant, charter)
        }
      })
    })
  })

  return { charters, index, source: 'firestore' }
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

  const contentHtml = String(draft?.contentHtml ?? '').trim()
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
    contentHtml: contentHtml || paragraphListToHtml(contentParagraphs),
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

async function readCharterCollectionRaw() {
  let snapshot

  try {
    snapshot = await getDb().collection(CHARTER_COLLECTION).get()
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
        draft: {
          ...charter,
          adminOriginalSlug: charter.slug,
        },
        published: {
          ...charter,
          adminOriginalSlug: charter.slug,
        },
        updatedBy: actor,
        updatedAt: getServerTimestamp(),
        publishedBy: actor,
        publishedAt: getServerTimestamp(),
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
  return getCanonicalCharterCatalogForMode('public')
}

async function getCanonicalCharterCatalogForMode(mode = 'public') {
  const charterDocuments = await readCharterCollectionRaw()
  const catalog = buildCharterCatalogFromStoredDocuments(charterDocuments, { mode })

  if (catalog.charters.length === 0 && charterDocuments.length === 0 && mode !== 'admin') {
    throw new HttpError(
      503,
      'The Firestore charter catalog is empty. Seed the Firestore charter collection before serving live charter content.',
    )
  }

  return catalog
}

function assertUniqueCharterSlug(charterDocuments, nextSlug, previousDocumentId = '') {
  if (!nextSlug) {
    return
  }

  const hasConflict = charterDocuments.some((document) => {
    if (document.id === previousDocumentId) {
      return false
    }

    const envelope = normalizeStoredCharterEnvelope(document.data, document.id)
    return envelope.draft?.slug === nextSlug || envelope.published?.slug === nextSlug
  })

  if (hasConflict) {
    throw new Error(`A charter with slug "${nextSlug}" already exists.`)
  }
}

function createCharterConflictError(documentData, documentId) {
  return new HttpError(409, 'This charter was changed by someone else since you loaded it. Reload to see the latest version.', {
    latest: buildCharterViewFromStoredRecord(documentData, documentId, { mode: 'admin' }),
  })
}

exports.listCharters = async function listCharters() {
  const catalog = await getCanonicalCharterCatalog()
  return cloneData(catalog.charters.filter((charter) => charter.active !== false))
}

exports.listAllCharters = async function listAllCharters() {
  const catalog = await getCanonicalCharterCatalogForMode('admin')
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

exports.saveCharterRecord = async function saveCharterRecord(draft, originalSlug, adminUser, expectedUpdatedAt = null) {
  await syncSeedChartersToFirestore({ replace: false, actor: 'auto-seed' })

  const normalizedOriginalSlug = String(originalSlug ?? '').trim()
  const charter = buildCharterRecordFromAdminDraft(draft, normalizedOriginalSlug || draft?.slug)
  const db = getDb()
  const collectionRef = db.collection(CHARTER_COLLECTION)
  const nextDocId = await db.runTransaction(async (transaction) => {
    const collectionSnapshot = await transaction.get(collectionRef)
    const charterDocuments = collectionSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }))
    const currentDocument = charterDocuments.find((document) => document.id === normalizedOriginalSlug)
    const currentEnvelope = currentDocument ? normalizeStoredCharterEnvelope(currentDocument.data, currentDocument.id) : null

    if (currentDocument) {
      assertExpectedUpdatedAtMatches(currentDocument.data.updatedAt, expectedUpdatedAt, () =>
        createCharterConflictError(currentDocument.data, currentDocument.id),
      )
    } else if (normalizedOriginalSlug && hasExpectedUpdatedAt(expectedUpdatedAt)) {
      throw new HttpError(409, 'This charter was deleted by someone else since you loaded it. Reload to see the latest changes.')
    }

    assertUniqueCharterSlug(charterDocuments, charter.slug, normalizedOriginalSlug)

    const documentId = charter.slug
    const previousDocId = normalizedOriginalSlug || charter.slug

    if (previousDocId !== documentId) {
      transaction.delete(collectionRef.doc(previousDocId))
    }

    const preservedPublishedAt = currentEnvelope?.published
      ? currentDocument?.data?.publishedAt ?? currentDocument?.data?.updatedAt ?? null
      : null

    transaction.set(collectionRef.doc(documentId), {
      draft: {
        ...charter,
        adminOriginalSlug: charter.slug,
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
      publishedAt: preservedPublishedAt,
    })

    return documentId
  })

  const savedSnapshot = await collectionRef.doc(nextDocId).get()
  return cloneData(buildCharterViewFromStoredRecord(savedSnapshot.data(), nextDocId, { mode: 'admin' }))
}

exports.publishCharterRecord = async function publishCharterRecord(originalSlug, adminUser, expectedUpdatedAt = null) {
  await syncSeedChartersToFirestore({ replace: false, actor: 'auto-seed' })

  const documentId = String(originalSlug ?? '').trim()

  if (!documentId) {
    throw new HttpError(400, 'Charter identifier is required to publish.')
  }

  const db = getDb()
  const collectionRef = db.collection(CHARTER_COLLECTION)
  const docRef = collectionRef.doc(documentId)

  await db.runTransaction(async (transaction) => {
    const [currentSnapshot, collectionSnapshot] = await Promise.all([transaction.get(docRef), transaction.get(collectionRef)])
    const charterDocuments = collectionSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }))

    if (!currentSnapshot.exists) {
      throw new HttpError(404, 'Charter draft not found.')
    }

    const currentData = currentSnapshot.data()
    const currentEnvelope = normalizeStoredCharterEnvelope(currentData, currentSnapshot.id)

    assertExpectedUpdatedAtMatches(currentData.updatedAt, expectedUpdatedAt, () =>
      createCharterConflictError(currentData, currentSnapshot.id),
    )

    if (!currentEnvelope.draft) {
      throw new HttpError(400, 'Charter draft is missing and cannot be published.')
    }

    assertUniqueCharterSlug(charterDocuments, currentEnvelope.draft.slug, documentId)

    transaction.set(docRef, {
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
  })

  const savedSnapshot = await collectionRef.doc(documentId).get()
  return cloneData(buildCharterViewFromStoredRecord(savedSnapshot.data(), documentId, { mode: 'admin' }))
}

exports.resetCharterRecordsToSeed = async function resetCharterRecordsToSeed() {
  return syncSeedChartersToFirestore({ replace: true, actor: 'admin-reset' })
}

exports.seedCharterRecords = async function seedCharterRecords(options = {}) {
  return syncSeedChartersToFirestore(options)
}
