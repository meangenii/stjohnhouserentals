const { onRequest } = require('firebase-functions/v2/https')
const {
  getCharterBySlug,
  listAllCharters,
  listCharters,
  resetCharterRecordsToSeed,
  saveCharterRecord,
  seedCharterRecords,
} = require('./charterRepository')
const { HttpError, requireAdminUser } = require('./firebaseAdmin')
const {
  getPropertyBySlug,
  listAllProperties,
  listBedroomGroups,
  listProperties,
  listPropertySummaries,
  resetPropertyRecordsToSeed,
  savePropertyRecord,
  seedPropertyRecords,
} = require('./propertyRepository')
const { createMediaFolder, listMediaLibrary, uploadMediaAsset } = require('./mediaRepository')
const {
  getSiteShellContent,
  getStructuredPageContent,
  listPageInventory,
  listStructuredPages,
  resetSiteShellContentToSeed,
  resetStructuredPageContentToSeed,
  saveSiteShellContent,
  saveStructuredPageContent,
  seedSiteContentRecords,
} = require('./siteContentRepository')

const startedAt = new Date().toISOString()

const publicSiteConfig = {
  siteName: 'St. John House Rentals',
  phase: 'structured-content migration',
  stack: ['react', 'firebase-hosting', 'cloud-functions', 'firestore'],
  contentSource: 'Firestore-backed site shell, pages, properties, and charters',
  routes: [
    '/',
    '/about-us',
    '/st-john-rentals',
    '/for-rent',
    '/property-for-sale',
    '/car-barge-information',
    '/passenger-ferry',
    '/cars',
    '/boats',
    '/map',
    '/advertise',
    '/ferrys',
    '/privacy-policy',
    '/terms-of-agreement',
    '/rental-properties/:slug',
    '/charter-boat-rentals/:slug',
    '/admin',
  ],
}

function normalizeRequestPath(pathname) {
  const normalizedPath = String(pathname ?? '').replace(/^\/+/, '')

  if (normalizedPath === 'api') {
    return ''
  }

  return normalizedPath.replace(/^api\/+/, '')
}

function sendError(response, error, path) {
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: 'request-failed',
      message: error.message,
      ...error.details,
    })
    return
  }

  response.status(500).json({
    error: 'internal',
    message: error instanceof Error ? error.message : 'Unexpected siteApi error',
    path,
  })
}

exports.siteApi = onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
  const path = normalizeRequestPath(request.path)

  try {
    if (request.method === 'GET' && (path === '' || path === 'health')) {
      response.json({
        service: 'siteApi',
        status: 'ok',
        phase: publicSiteConfig.phase,
        startedAt,
        checkedAt: new Date().toISOString(),
      })
      return
    }

    if (request.method === 'GET' && path === 'site-config') {
      const structuredPages = await listStructuredPages()

      response.json({
        ...publicSiteConfig,
        structuredPageCount: structuredPages.length,
        checkedAt: new Date().toISOString(),
      })
      return
    }

    if (request.method === 'GET' && path === 'content/site-shell') {
      response.json(await getSiteShellContent())
      return
    }

    if (request.method === 'GET' && path === 'content/pages') {
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        pages: await listStructuredPages(),
        inventory: await listPageInventory(),
      })
      return
    }

    if (request.method === 'GET' && path.startsWith('content/pages/')) {
      const pageKey = path.replace(/^content\/pages\//, '')
      const page = await getStructuredPageContent(pageKey)

      if (!page) {
        response.status(404).json({
          error: 'not-found',
          message: 'Structured page content not found in siteApi',
          key: pageKey,
        })
        return
      }

      response.json(page)
      return
    }

    if (request.method === 'GET' && path === 'properties') {
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        groups: await listBedroomGroups(),
      })
      return
    }

    if (request.method === 'GET' && path === 'properties/catalog') {
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        properties: await listProperties(),
      })
      return
    }

    if (request.method === 'GET' && (path === 'properties/summary' || path === 'properties/summaries')) {
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        properties: await listPropertySummaries(),
      })
      return
    }

    if (request.method === 'GET' && path.startsWith('properties/')) {
      const slug = path.replace(/^properties\//, '')
      const property = await getPropertyBySlug(slug)

      if (!property) {
        response.status(404).json({
          error: 'not-found',
          message: 'Property not found in siteApi',
          slug,
        })
        return
      }

      response.json(property)
      return
    }

    if (request.method === 'GET' && path === 'charters') {
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        charters: await listCharters(),
      })
      return
    }

    if (request.method === 'GET' && path.startsWith('charters/')) {
      const slug = path.replace(/^charters\//, '')
      const charter = await getCharterBySlug(slug)

      if (!charter) {
        response.status(404).json({
          error: 'not-found',
          message: 'Charter not found in siteApi',
          slug,
        })
        return
      }

      response.json(charter)
      return
    }

    if (request.method === 'POST' && path === 'admin/properties') {
      const adminUser = await requireAdminUser(request)
      const savedProperty = await savePropertyRecord(
        request.body?.draft ?? {},
        request.body?.originalSlug ?? '',
        adminUser,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property: savedProperty,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/properties/catalog') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        properties: await listAllProperties(),
      })
      return
    }

    if (request.method === 'DELETE' && path === 'admin/properties/overrides') {
      await requireAdminUser(request)
      const result = await resetPropertyRecordsToSeed()
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        reset: result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/charters') {
      const adminUser = await requireAdminUser(request)
      const savedCharter = await saveCharterRecord(
        request.body?.draft ?? {},
        request.body?.originalSlug ?? '',
        adminUser,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        charter: savedCharter,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/charters/catalog') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        charters: await listAllCharters(),
      })
      return
    }

    if (request.method === 'DELETE' && path === 'admin/charters/overrides') {
      await requireAdminUser(request)
      const result = await resetCharterRecordsToSeed()
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        reset: result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/media/folders') {
      const adminUser = await requireAdminUser(request)
      const folder = await createMediaFolder(request.body?.parentPath ?? 'media', request.body?.folderName ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        folder,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/media/library') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...(await listMediaLibrary()),
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/media/upload') {
      const adminUser = await requireAdminUser(request)
      const media = await uploadMediaAsset(request.body ?? {}, adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        media,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/content/site-shell') {
      const adminUser = await requireAdminUser(request)
      const siteShell = await saveSiteShellContent(request.body?.draft ?? {}, adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        siteShell,
      })
      return
    }

    if (request.method === 'DELETE' && path === 'admin/content/site-shell') {
      const adminUser = await requireAdminUser(request)
      const siteShell = await resetSiteShellContentToSeed(adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        siteShell,
      })
      return
    }

    if (request.method === 'POST' && path.startsWith('admin/content/pages/')) {
      const adminUser = await requireAdminUser(request)
      const pageKey = path.replace(/^admin\/content\/pages\//, '')
      const page = await saveStructuredPageContent(pageKey, request.body?.draft ?? {}, adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        page,
      })
      return
    }

    if (request.method === 'DELETE' && path.startsWith('admin/content/pages/')) {
      const adminUser = await requireAdminUser(request)
      const pageKey = path.replace(/^admin\/content\/pages\//, '')
      const page = await resetStructuredPageContentToSeed(pageKey, adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        page,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/seed-firestore') {
      await requireAdminUser(request)
      const replace = request.body?.replace === true
      const [siteContent, properties, charters] = await Promise.all([
        seedSiteContentRecords({ replace, actor: 'admin-seed' }),
        seedPropertyRecords({ replace, actor: 'admin-seed' }),
        seedCharterRecords({ replace, actor: 'admin-seed' }),
      ])

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        replace,
        siteContent,
        properties,
        charters,
      })
      return
    }

    response.status(404).json({
      error: 'not-found',
      message: 'Route not found in siteApi',
      path: request.path,
    })
  } catch (error) {
    sendError(response, error, request.path)
  }
})
