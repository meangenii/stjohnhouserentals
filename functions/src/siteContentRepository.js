const siteContent = require('./generated/siteContent.json')
const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')

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

function getPageIndexSeed() {
  return {
    structuredPageSummaries: cloneData(siteContent.structuredPageSummaries || []),
    pageInventory: cloneData(siteContent.pageInventory || []),
  }
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

  const data = snapshot.data()
  delete data.updatedBy
  delete data.updatedAt

  return cloneData(data)
}

exports.getStructuredPageContent = async function getStructuredPageContent(key) {
  const snapshot = await getStructuredPageDocument(key)

  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data()
  delete data.updatedBy
  delete data.updatedAt

  return cloneData(data)
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
