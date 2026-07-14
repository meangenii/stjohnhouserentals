const siteContent = require('./generated/siteContent.json')
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

function formatActor(actor) {
  if (typeof actor === 'string' && actor.trim()) {
    return actor.trim()
  }

  return actor?.email || actor?.uid || 'admin'
}

function createInvalidSiteShellError(message = 'Site shell content must be a JSON object.') {
  return new HttpError(400, message)
}

function createInvalidStructuredPageError(message) {
  return new HttpError(400, message)
}

function normalizeSiteShellDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw createInvalidSiteShellError()
  }

  const normalized = cloneData(draft)

  if (
    !normalized.header ||
    typeof normalized.header !== 'object' ||
    Array.isArray(normalized.header) ||
    !normalized.footer ||
    typeof normalized.footer !== 'object' ||
    Array.isArray(normalized.footer) ||
    !Array.isArray(normalized.header.primaryNav) ||
    !Array.isArray(normalized.footer.primaryNav) ||
    !Array.isArray(normalized.footer.legalNav)
  ) {
    throw createInvalidSiteShellError(
      'Site shell content requires header.primaryNav, footer.primaryNav, and footer.legalNav arrays.',
    )
  }

  assertStorageImagesInValue(normalized, 'Site shell image')
  return normalized
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

function normalizeRoutePath(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return ''
  }

  const withoutOrigin = candidate.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const withoutQueryOrHash = withoutOrigin.split(/[?#]/, 1)[0] || '/'
  const withLeadingSlash = withoutQueryOrHash.startsWith('/') ? withoutQueryOrHash : `/${withoutQueryOrHash}`

  return withLeadingSlash !== '/' ? withLeadingSlash.replace(/\/+$/, '') || '/' : '/'
}

function collectStructuredPageRoutePaths(page = {}) {
  return [page.path, ...(Array.isArray(page.routeAliases) ? page.routeAliases : [])]
    .map((path) => normalizeRoutePath(path))
    .filter(Boolean)
}

function assertUniqueStructuredPageRoutes(pageDocuments, nextPage) {
  const nextKey = String(nextPage?.key ?? '').trim()
  const nextPaths = new Set(collectStructuredPageRoutePaths(nextPage))

  if (nextPaths.size === 0) {
    return
  }

  const hasConflict = pageDocuments.some((document) => {
    if (document.key === nextKey) {
      return false
    }

    const envelope = normalizeStoredContentEnvelope(document.data)
    const candidates = [envelope.draft, envelope.published].filter(Boolean)

    return candidates.some((candidate) => collectStructuredPageRoutePaths(candidate).some((path) => nextPaths.has(path)))
  })

  if (hasConflict) {
    throw createInvalidStructuredPageError('A structured page already uses that URL. Choose a different one.')
  }
}

function hasPublicationEnvelope(record) {
  return (
    Boolean(record) &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    (Object.prototype.hasOwnProperty.call(record, 'draft') || Object.prototype.hasOwnProperty.call(record, 'published'))
  )
}

function cloneStructuredContentValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return cloneData(value)
}

function normalizeStoredContentEnvelope(record) {
  const draftSource = hasPublicationEnvelope(record) ? record.draft ?? null : record
  const publishedSource = hasPublicationEnvelope(record) ? record.published ?? draftSource ?? null : record

  return {
    draft: cloneStructuredContentValue(draftSource),
    published: cloneStructuredContentValue(publishedSource),
    updatedAt: toEpochMillis(record?.updatedAt),
    updatedBy: String(record?.updatedBy ?? '').trim(),
    publishedAt: toEpochMillis(record?.publishedAt) ?? toEpochMillis(record?.updatedAt),
    publishedBy: String(record?.publishedBy ?? record?.updatedBy ?? '').trim(),
  }
}

function buildPublicationState(envelope) {
  return {
    hasUnpublishedChanges: JSON.stringify(envelope?.draft ?? null) !== JSON.stringify(envelope?.published ?? null),
    savedAt: envelope?.updatedAt ?? null,
    savedBy: envelope?.updatedBy ?? '',
    publishedAt: envelope?.published ? envelope?.publishedAt ?? envelope?.updatedAt ?? null : null,
    publishedBy: envelope?.published ? envelope?.publishedBy || envelope?.updatedBy || '' : '',
  }
}

function buildSiteShellAdminResponse(record) {
  const envelope = normalizeStoredContentEnvelope(record)
  return {
    siteShell: envelope.draft ?? {},
    publication: buildPublicationState(envelope),
  }
}

function getPublishedSiteShell(record) {
  return normalizeStoredContentEnvelope(record).published
}

function normalizeStructuredPageView(key, page) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    return null
  }

  const normalized = cloneData(page)
  normalized.key = String(normalized.key ?? key).trim() || String(key ?? '').trim()
  return normalized
}

function buildStructuredPageAdminResponse(key, record) {
  const envelope = normalizeStoredContentEnvelope(record)
  return {
    page: normalizeStructuredPageView(key, envelope.draft),
    publication: buildPublicationState(envelope),
  }
}

function createSiteShellConflictError(documentData) {
  return new HttpError(409, 'The site shell was changed by someone else since you loaded it. Reload to see the latest version.', {
    latest: buildSiteShellAdminResponse(documentData),
  })
}

function createStructuredPageConflictError(key, documentData) {
  return new HttpError(409, 'This page was changed by someone else since you loaded it. Reload to see the latest version.', {
    latest: buildStructuredPageAdminResponse(key, documentData),
  })
}

function getStructuredPageView(key, record, mode = 'public') {
  const envelope = normalizeStoredContentEnvelope(record)
  return normalizeStructuredPageView(key, mode === 'admin' ? envelope.draft : envelope.published)
}

function buildStructuredPageSummaryList(records, mode = 'public') {
  const pages = records
    .map((record) => {
      const page = getStructuredPageView(record.key, record.data, mode)

      if (!page) {
        return null
      }

      const summary = buildStructuredPageSummary(page)

      if (mode === 'admin') {
        summary.publication = buildPublicationState(normalizeStoredContentEnvelope(record.data))
      }

      return summary
    })
    .filter(Boolean)

  return sortStructuredPages(pages)
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

async function listStructuredPageDocumentsFromFirestore() {
  try {
    const snapshot = await getDb().collection(STRUCTURED_PAGE_COLLECTION).get()

    return snapshot.docs.map((document) => ({
      key: document.id,
      data: document.data(),
    }))
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
      ...(document.id === SITE_SHELL_DOCUMENT
        ? {
            draft: document.payload,
            published: document.payload,
            updatedBy: actor,
            updatedAt: getServerTimestamp(),
            publishedBy: actor,
            publishedAt: getServerTimestamp(),
          }
        : {
            ...document.payload,
            updatedBy: actor,
            updatedAt: getServerTimestamp(),
          }),
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
      draft: {
        ...page,
        key,
      },
      published: {
        ...page,
        key,
      },
      updatedBy: actor,
      updatedAt: getServerTimestamp(),
      publishedBy: actor,
      publishedAt: getServerTimestamp(),
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

  return cloneData(getPublishedSiteShell(snapshot.data()) ?? {})
}

exports.getAdminSiteShellContent = async function getAdminSiteShellContent() {
  const snapshot = await getSiteContentDocument(SITE_SHELL_DOCUMENT)

  if (!snapshot.exists) {
    throw createMissingSiteContentError(SITE_SHELL_DOCUMENT)
  }

  return cloneData(buildSiteShellAdminResponse(snapshot.data()))
}

exports.saveSiteShellContent = async function saveSiteShellContent(draft, actor, expectedUpdatedAt = null) {
  const normalized = normalizeSiteShellDraft(draft)
  const db = getDb()
  const docRef = db.collection(SITE_CONTENT_COLLECTION).doc(SITE_SHELL_DOCUMENT)

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      const currentData = snapshot.exists ? snapshot.data() : {}
      const currentEnvelope = normalizeStoredContentEnvelope(currentData)

      if (snapshot.exists) {
        assertExpectedUpdatedAtMatches(currentData.updatedAt, expectedUpdatedAt, () =>
          createSiteShellConflictError(currentData),
        )
      }

      const preservedPublishedAt = currentEnvelope.published
        ? currentData.publishedAt ?? currentData.updatedAt ?? null
        : null

      transaction.set(docRef, {
        draft: normalized,
        published: currentEnvelope.published,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
        publishedBy: currentEnvelope.publishedBy || '',
        publishedAt: preservedPublishedAt,
      })
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  const savedSnapshot = await getSiteContentDocument(SITE_SHELL_DOCUMENT)
  return cloneData(buildSiteShellAdminResponse(savedSnapshot.data()))
}

exports.publishSiteShellContent = async function publishSiteShellContent(actor, expectedUpdatedAt = null) {
  const db = getDb()
  const docRef = db.collection(SITE_CONTENT_COLLECTION).doc(SITE_SHELL_DOCUMENT)

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)

      if (!snapshot.exists) {
        throw createMissingSiteContentError(SITE_SHELL_DOCUMENT)
      }

      const currentData = snapshot.data()
      const currentEnvelope = normalizeStoredContentEnvelope(currentData)
      const normalized = normalizeSiteShellDraft(currentEnvelope.draft ?? currentEnvelope.published ?? {})

      assertExpectedUpdatedAtMatches(currentData.updatedAt, expectedUpdatedAt, () =>
        createSiteShellConflictError(currentData),
      )

      transaction.set(docRef, {
        draft: normalized,
        published: normalized,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
        publishedBy: formatActor(actor),
        publishedAt: getServerTimestamp(),
      })
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  const savedSnapshot = await getSiteContentDocument(SITE_SHELL_DOCUMENT)
  return cloneData(buildSiteShellAdminResponse(savedSnapshot.data()))
}

exports.resetSiteShellContentToSeed = async function resetSiteShellContentToSeed(actor) {
  const normalized = normalizeSiteShellDraft(getSiteShellSeed())

  try {
    await getDb()
      .collection(SITE_CONTENT_COLLECTION)
      .doc(SITE_SHELL_DOCUMENT)
      .set({
        draft: normalized,
        published: normalized,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
        publishedBy: formatActor(actor),
        publishedAt: getServerTimestamp(),
      })
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  const savedSnapshot = await getSiteContentDocument(SITE_SHELL_DOCUMENT)
  return cloneData(buildSiteShellAdminResponse(savedSnapshot.data()))
}

exports.getStructuredPageContent = async function getStructuredPageContent(key) {
  const snapshot = await getStructuredPageDocument(key)

  if (!snapshot.exists) {
    return null
  }

  return cloneData(getStructuredPageView(key, snapshot.data(), 'public'))
}

exports.getAdminStructuredPageContent = async function getAdminStructuredPageContent(key) {
  const snapshot = await getStructuredPageDocument(key)

  if (!snapshot.exists) {
    return null
  }

  return cloneData(buildStructuredPageAdminResponse(key, snapshot.data()))
}

exports.saveStructuredPageContent = async function saveStructuredPageContent(key, draft, actor, expectedUpdatedAt = null) {
  const normalized = normalizeStructuredPageDraft(String(key ?? '').trim(), draft)
  const db = getDb()
  const collectionRef = db.collection(STRUCTURED_PAGE_COLLECTION)
  const docRef = collectionRef.doc(normalized.key)

  try {
    await db.runTransaction(async (transaction) => {
      const [snapshot, collectionSnapshot] = await Promise.all([transaction.get(docRef), transaction.get(collectionRef)])
      const pageDocuments = collectionSnapshot.docs.map((document) => ({
        key: document.id,
        data: document.data(),
      }))
      const currentData = snapshot.exists ? snapshot.data() : {}
      const currentEnvelope = normalizeStoredContentEnvelope(currentData)

      if (snapshot.exists) {
        if (!hasExpectedUpdatedAt(expectedUpdatedAt)) {
          throw new HttpError(
            409,
            'A structured page already uses that key. Reload the page list and choose a different title.',
            { latest: buildStructuredPageAdminResponse(normalized.key, currentData) },
          )
        }

        assertExpectedUpdatedAtMatches(currentData.updatedAt, expectedUpdatedAt, () =>
          createStructuredPageConflictError(normalized.key, currentData),
        )
      } else if (hasExpectedUpdatedAt(expectedUpdatedAt)) {
        throw new HttpError(409, 'This page was deleted by someone else since you loaded it. Reload to see the latest changes.')
      }

      assertUniqueStructuredPageRoutes(pageDocuments, normalized)

      const preservedPublishedAt = currentEnvelope.published
        ? currentData.publishedAt ?? currentData.updatedAt ?? null
        : null

      transaction.set(docRef, {
        draft: normalized,
        published: currentEnvelope.published,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
        publishedBy: currentEnvelope.publishedBy || '',
        publishedAt: preservedPublishedAt,
      })
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  const savedSnapshot = await getStructuredPageDocument(normalized.key)
  return cloneData(buildStructuredPageAdminResponse(normalized.key, savedSnapshot.data()))
}

exports.publishStructuredPageContent = async function publishStructuredPageContent(key, actor, expectedUpdatedAt = null) {
  const normalizedKey = String(key ?? '').trim()

  if (!normalizedKey) {
    throw createInvalidStructuredPageError('Structured page key is required.')
  }

  const db = getDb()
  const docRef = db.collection(STRUCTURED_PAGE_COLLECTION).doc(normalizedKey)
  let didPublish

  try {
    didPublish = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)

      if (!snapshot.exists) {
        return false
      }

      const currentData = snapshot.data()
      const currentEnvelope = normalizeStoredContentEnvelope(currentData)
      const normalized = normalizeStructuredPageDraft(normalizedKey, currentEnvelope.draft ?? currentEnvelope.published ?? {})

      assertExpectedUpdatedAtMatches(currentData.updatedAt, expectedUpdatedAt, () =>
        createStructuredPageConflictError(normalizedKey, currentData),
      )

      transaction.set(docRef, {
        draft: normalized,
        published: normalized,
        updatedBy: formatActor(actor),
        updatedAt: getServerTimestamp(),
        publishedBy: formatActor(actor),
        publishedAt: getServerTimestamp(),
      })

      return true
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  if (!didPublish) {
    return null
  }

  const savedSnapshot = await getStructuredPageDocument(normalizedKey)
  return cloneData(buildStructuredPageAdminResponse(normalizedKey, savedSnapshot.data()))
}

exports.resetStructuredPageContentToSeed = async function resetStructuredPageContentToSeed(key, actor) {
  const normalizedKey = String(key ?? '').trim()

  if (!normalizedKey) {
    throw createInvalidStructuredPageError('Structured page key is required.')
  }

  const seedPage = getStructuredPageSeed(normalizedKey)

  if (seedPage) {
    const normalized = normalizeStructuredPageDraft(normalizedKey, seedPage)

    try {
      await getDb()
        .collection(STRUCTURED_PAGE_COLLECTION)
        .doc(normalizedKey)
        .set({
          draft: normalized,
          published: normalized,
          updatedBy: formatActor(actor),
          updatedAt: getServerTimestamp(),
          publishedBy: formatActor(actor),
          publishedAt: getServerTimestamp(),
        })
    } catch (error) {
      if (isFirestoreUnavailableError(error)) {
        throw createSiteContentSetupError()
      }

      throw error
    }

    const savedSnapshot = await getStructuredPageDocument(normalizedKey)
    return cloneData(buildStructuredPageAdminResponse(normalizedKey, savedSnapshot.data()))
  }

  try {
    await getDb().collection(STRUCTURED_PAGE_COLLECTION).doc(normalizedKey).delete()
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw createSiteContentSetupError()
    }

    throw error
  }

  return null
}

exports.listStructuredPages = async function listStructuredPages() {
  const records = await listStructuredPageDocumentsFromFirestore()
  return cloneData(buildStructuredPageSummaryList(records, 'public'))
}

exports.listAdminStructuredPages = async function listAdminStructuredPages() {
  const records = await listStructuredPageDocumentsFromFirestore()
  return cloneData(buildStructuredPageSummaryList(records, 'admin'))
}

exports.listPageInventory = async function listPageInventory() {
  const records = await listStructuredPageDocumentsFromFirestore()
  return cloneData(buildPageIndexDocument(buildStructuredPageSummaryList(records, 'public')).pageInventory)
}

exports.listAdminPageInventory = async function listAdminPageInventory() {
  const records = await listStructuredPageDocumentsFromFirestore()
  return cloneData(buildPageIndexDocument(buildStructuredPageSummaryList(records, 'admin')).pageInventory)
}
