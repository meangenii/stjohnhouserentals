const siteContent = require('./generated/siteContent.json')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { assertStorageImagesInValue } = require('./imagePolicy')

const SITE_CONTENT_COLLECTION = 'cmsSiteContent'
const STRUCTURED_PAGE_COLLECTION = 'cmsStructuredPages'
const SITE_SHELL_DOCUMENT = 'site-shell'
const PAGE_INDEX_DOCUMENT = 'page-index'

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function createSiteContentSetupError() {
  return new HttpError(
    503,
    'Cloud Firestore site content is not loaded yet. Seed the Firestore content documents before serving the live site.',
  )
}

function createMissingSiteContentError(documentName) {
  return new HttpError(
    503,
    `The Firestore site content document "${documentName}" is missing. Seed the Firestore content documents before serving the live site.`,
  )
}

function getSiteShellSeed() {
  return cloneData(siteContent.siteShell || {})
}

function getStructuredPageSeedMap() {
  return cloneData(siteContent.pages || {})
}

function getStructuredPageSeed(key) {
  return cloneData(siteContent.pages?.[key] ?? null)
}

function getPageIndexSeed() {
  return {
    structuredPageSummaries: cloneData(siteContent.structuredPageSummaries || []),
    pageInventory: cloneData(siteContent.pageInventory || []),
  }
}

function getStaticPageInventoryEntries() {
  return getPageIndexSeed().pageInventory.filter((page) => page.source !== 'structured')
}

function stripAdminMetadata(record = {}) {
  const content = { ...record }
  delete content.updatedBy
  delete content.updatedAt
  return content
}

function formatActor(actor) {
  if (typeof actor === 'string' && actor.trim()) {
    return actor.trim()
  }

  return actor?.email || actor?.uid || 'admin'
}

function createInvalidSiteShellError() {
  return new HttpError(400, 'Site shell content must be a JSON object.')
}

function createInvalidStructuredPageError(message) {
  return new HttpError(400, message)
}

function normalizeSiteShellDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw createInvalidSiteShellError()
  }

  assertStorageImagesInValue(draft, 'Site shell image')
  return cloneData(draft)
}

function resolveStructuredPageTitle(page = {}) {
  return (
    page.title ||
    page.hero?.title ||
    page.redHook?.titleLines?.[0] ||
    page.story?.title ||
    page.directory?.title ||
    page.intro?.title ||
    page.contact?.title ||
    ''
  )
}

function buildStructuredPageSummary(page = {}) {
  return {
    key: String(page.key ?? '').trim(),
    label: String(page.navLabel ?? '').trim(),
    path: String(page.path ?? '').trim(),
    title: String(resolveStructuredPageTitle(page)).trim(),
    group: String(page.group ?? '').trim(),
    source: 'structured',
    contentModel: String(page.contentModel ?? '').trim(),
    routeAliases: Array.isArray(page.routeAliases)
      ? page.routeAliases.map((value) => String(value).trim()).filter(Boolean)
      : [],
  }
}

function sortStructuredPages(pages) {
  const seedOrder = new Map(
    getPageIndexSeed().structuredPageSummaries.map((page, index) => [String(page.key ?? '').trim(), index]),
  )

  return [...pages].sort((left, right) => {
    const leftKey = String(left.key ?? '').trim()
    const rightKey = String(right.key ?? '').trim()
    const leftOrder = seedOrder.has(leftKey) ? seedOrder.get(leftKey) : Number.MAX_SAFE_INTEGER
    const rightOrder = seedOrder.has(rightKey) ? seedOrder.get(rightKey) : Number.MAX_SAFE_INTEGER

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    const leftPath = String(left.path ?? '').trim()
    const rightPath = String(right.path ?? '').trim()

    if (leftPath !== rightPath) {
      return leftPath.localeCompare(rightPath)
    }

    return leftKey.localeCompare(rightKey)
  })
}

function buildPageIndexDocument(structuredPages = []) {
  const structuredPageSummaries = sortStructuredPages(structuredPages.map((page) => buildStructuredPageSummary(page)))

  return {
    structuredPageSummaries,
    pageInventory: [...structuredPageSummaries, ...getStaticPageInventoryEntries()],
  }
}

function normalizeStructuredPageDraft(key, draft) {
  if (!key) {
    throw createInvalidStructuredPageError('Structured page key is required.')
  }

  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw createInvalidStructuredPageError('Structured page content must be a JSON object.')
  }

  const normalized = cloneData(draft)

  normalized.key = key
  normalized.source = 'structured'
  normalized.path = String(normalized.path ?? '').trim()
  normalized.navLabel = String(normalized.navLabel ?? '').trim()
  normalized.group = String(normalized.group ?? '').trim()
  normalized.contentModel = String(normalized.contentModel ?? '').trim()
  normalized.routeAliases = Array.isArray(normalized.routeAliases)
    ? normalized.routeAliases.map((value) => String(value).trim()).filter(Boolean)
    : []

  if (!normalized.path) {
    throw createInvalidStructuredPageError('Structured pages require a path.')
  }

  if (!normalized.navLabel) {
    throw createInvalidStructuredPageError('Structured pages require a navLabel.')
  }

  if (!normalized.group) {
    throw createInvalidStructuredPageError('Structured pages require a group.')
  }

  if (!normalized.contentModel) {
    throw createInvalidStructuredPageError('Structured pages require a contentModel.')
  }

  assertStorageImagesInValue(normalized, `Structured page ${key} image`)
  return normalized
}

async function getSiteContentDocument(documentId) {
  try {
    return await getDb().collection(SITE_CONTENT_COLLECTION).doc(documentId).get()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }
}

async function getStructuredPageDocument(key) {
  try {
    return await getDb().collection(STRUCTURED_PAGE_COLLECTION).doc(key).get()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }
}

async function listStructuredPageRecordsFromFirestore() {
  try {
    const snapshot = await getDb().collection(STRUCTURED_PAGE_COLLECTION).get()

    return snapshot.docs.map((document) => ({
      key: document.id,
      ...stripAdminMetadata(document.data()),
    }))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }
}

async function commitStructuredPageIndex(records, actor) {
  const db = getDb()
  const pageCollection = db.collection(STRUCTURED_PAGE_COLLECTION)
  const contentCollection = db.collection(SITE_CONTENT_COLLECTION)
  const pageIndex = buildPageIndexDocument(records)
  const batch = db.batch()

  batch.set(contentCollection.doc(PAGE_INDEX_DOCUMENT), {
    ...pageIndex,
    updatedBy: actor,
    updatedAt: getServerTimestamp(),
  })

  records.forEach((page) => {
    batch.set(pageCollection.doc(page.key), {
      ...page,
      updatedBy: actor,
      updatedAt: getServerTimestamp(),
    })
  })

  return { batch, pageCollection, pageIndex }
}

async function writeStructuredPageSet(nextRecords, actor, { removedKey = '' } = {}) {
  try {
    const { batch, pageCollection } = await commitStructuredPageIndex(nextRecords, actor)

    if (removedKey) {
      batch.delete(pageCollection.doc(removedKey))
    }

    await batch.commit()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }
}

exports.seedSiteContentRecords = async function seedSiteContentRecords({ replace = false, actor = 'seed-sync' } = {}) {
  const db = getDb()
  const contentCollection = db.collection(SITE_CONTENT_COLLECTION)
  const pageCollection = db.collection(STRUCTURED_PAGE_COLLECTION)

  let contentSnapshots
  let pageSnapshots

  try {
    ;[contentSnapshots, pageSnapshots] = await Promise.all([contentCollection.get(), pageCollection.get()])
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  const existingContentIds = new Set(contentSnapshots.docs.map((document) => document.id))
  const existingPageIds = new Set(pageSnapshots.docs.map((document) => document.id))
  const seedPages = getStructuredPageSeedMap()
  const seedPageIds = new Set(Object.keys(seedPages))
  const pageIndexSeed = getPageIndexSeed()
  const seedDocuments = [
    { id: SITE_SHELL_DOCUMENT, payload: getSiteShellSeed() },
    { id: PAGE_INDEX_DOCUMENT, payload: pageIndexSeed },
  ]
  const batch = db.batch()

  let created = 0
  let updated = 0
  let deleted = 0

  seedDocuments.forEach((document) => {
    if (!replace && existingContentIds.has(document.id)) {
      return
    }

    batch.set(contentCollection.doc(document.id), {
      ...document.payload,
      updatedBy: actor,
      updatedAt: getServerTimestamp(),
    })

    if (existingContentIds.has(document.id)) {
      updated += 1
    } else {
      created += 1
    }
  })

  Object.entries(seedPages).forEach(([key, page]) => {
    if (!replace && existingPageIds.has(key)) {
      return
    }

    batch.set(pageCollection.doc(key), {
      ...page,
      key,
      updatedBy: actor,
      updatedAt: getServerTimestamp(),
    })

    if (existingPageIds.has(key)) {
      updated += 1
    } else {
      created += 1
    }
  })

  if (replace) {
    pageSnapshots.docs.forEach((document) => {
      if (!seedPageIds.has(document.id)) {
        batch.delete(document.ref)
        deleted += 1
      }
    })
  }

  if (created || updated || deleted) {
    await batch.commit()
  }

  return {
    collection: STRUCTURED_PAGE_COLLECTION,
    siteContentCollection: SITE_CONTENT_COLLECTION,
    totalSeedPages: seedPageIds.size,
    created,
    updated,
    deleted,
    replace,
  }
}

exports.getSiteShellContent = async function getSiteShellContent() {
  const snapshot = await getSiteContentDocument(SITE_SHELL_DOCUMENT)

  if (!snapshot.exists) {
    throw createMissingSiteContentError(SITE_SHELL_DOCUMENT)
  }

  return cloneData(stripAdminMetadata(snapshot.data()))
}

exports.saveSiteShellContent = async function saveSiteShellContent(draft, actor) {
  const normalized = normalizeSiteShellDraft(draft)

  try {
    await getDb()
      .collection(SITE_CONTENT_COLLECTION)
      .doc(SITE_SHELL_DOCUMENT)
      .set({
        ...normalized,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
      })
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  return normalized
}

exports.resetSiteShellContentToSeed = async function resetSiteShellContentToSeed(actor) {
  return exports.saveSiteShellContent(getSiteShellSeed(), actor)
}

exports.getStructuredPageContent = async function getStructuredPageContent(key) {
  const snapshot = await getStructuredPageDocument(key)

  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data()
  return cloneData(stripAdminMetadata(data))
}

exports.saveStructuredPageContent = async function saveStructuredPageContent(key, draft, actor) {
  const normalized = normalizeStructuredPageDraft(String(key ?? '').trim(), draft)
  const currentRecords = await listStructuredPageRecordsFromFirestore()
  const nextByKey = new Map(currentRecords.map((page) => [page.key, page]))

  nextByKey.set(normalized.key, normalized)

  await writeStructuredPageSet(Array.from(nextByKey.values()), formatActor(actor))

  return normalized
}

exports.resetStructuredPageContentToSeed = async function resetStructuredPageContentToSeed(key, actor) {
  const normalizedKey = String(key ?? '').trim()

  if (!normalizedKey) {
    throw createInvalidStructuredPageError('Structured page key is required.')
  }

  const currentRecords = await listStructuredPageRecordsFromFirestore()
  const nextByKey = new Map(currentRecords.map((page) => [page.key, page]))
  const seedPage = getStructuredPageSeed(normalizedKey)

  if (seedPage) {
    const normalized = normalizeStructuredPageDraft(normalizedKey, seedPage)
    nextByKey.set(normalizedKey, normalized)
    await writeStructuredPageSet(Array.from(nextByKey.values()), formatActor(actor))
    return normalized
  }

  nextByKey.delete(normalizedKey)
  await writeStructuredPageSet(Array.from(nextByKey.values()), formatActor(actor), { removedKey: normalizedKey })
  return null
}

exports.listStructuredPages = async function listStructuredPages() {
  const snapshot = await getSiteContentDocument(PAGE_INDEX_DOCUMENT)

  if (!snapshot.exists) {
    throw createMissingSiteContentError(PAGE_INDEX_DOCUMENT)
  }

  return cloneData(snapshot.data()?.structuredPageSummaries || [])
}

exports.listPageInventory = async function listPageInventory() {
  const snapshot = await getSiteContentDocument(PAGE_INDEX_DOCUMENT)

  if (!snapshot.exists) {
    throw createMissingSiteContentError(PAGE_INDEX_DOCUMENT)
  }

  return cloneData(snapshot.data()?.pageInventory || [])
}
