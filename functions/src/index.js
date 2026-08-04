const { onRequest } = require('firebase-functions/v2/https')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { listAdvertiseInquiries, saveAdvertiseInquiry } = require('./advertiseInquiryRepository')
const { getCalendarAvailability } = require('./calendarRepository')
const {
  createManagedBackupExport,
  createStagingClone,
  deployStagingPreview,
  getBackupOperationsStatus,
  getBackupWorkspaceStatus,
  switchPublicSiteTarget,
} = require('./backupAdminRepository')
const {
  getCharterBySlug,
  listAllCharters,
  listCharters,
  publishCharterRecord,
  resetCharterRecordsToSeed,
  saveCharterRecord,
  seedCharterRecords,
} = require('./charterRepository')
const {
  HttpError,
  getLiveFirestoreDatabaseId,
  getStagingFirestoreDatabaseId,
  isDefaultFirestoreDatabaseId,
  requireAdminUser,
  runWithRuntimeContext,
} = require('./firebaseAdmin')
const {
  deletePropertyRecord,
  getAdminPropertyBySlug,
  getPropertyBySlug,
  listAllProperties,
  listBedroomGroups,
  listProperties,
  listPropertySummaries,
  publishPropertyRecord,
  resetPropertyRecordsToSeed,
  savePropertyRecord,
  setPropertyActiveState,
  seedPropertyRecords,
} = require('./propertyRepository')
const {
  convertMediaAssetsToAvif,
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaAssets,
  deleteMediaFolder,
  findMediaUsage,
  listMediaLibrary,
  moveMediaAssets,
  uploadMediaAsset,
} = require('./mediaRepository')
const { acquireLock, getLockStatus, heartbeatLock, listLockStatuses, releaseLock } = require('./editLockRepository')
const {
  buildRobotsTxt,
  buildSitemap,
  createCharterRoute,
  createNotFoundRoute,
  createPropertyRoute,
  createSeoRoutes,
  injectPrerenderHead,
  normalizePathname,
} = require('./seoRenderer')
const {
  getAdminSiteShellContent,
  getAdminStructuredPageContent,
  getStructuredPageRevision,
  getSiteShellContent,
  getStructuredPageContent,
  listAdminPageInventory,
  listAdminStructuredPages,
  listDeletedStructuredPages,
  listStructuredPageRevisions,
  listPageInventory,
  listStructuredPages,
  publishSiteShellContent,
  publishStructuredPageContent,
  resetSiteShellContentToSeed,
  resetStructuredPageContentToSeed,
  restoreDeletedStructuredPage,
  restoreStructuredPageRevision,
  saveSiteShellContent,
  saveStructuredPageContent,
  seedSiteContentRecords,
} = require('./siteContentRepository')
const {
  matchAdminStructuredPageDocumentPath,
  matchAdminStructuredPagePublishPath,
  matchAdminStructuredPageRevisionListPath,
} = require('./siteApiRoutes')

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

const PUBLIC_AVAILABILITY_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800'
const PUBLIC_SEO_CACHE_CONTROL = 'no-store'
const SITE_API_FUNCTION_OPTIONS = {
  region: 'us-central1',
  cors: true,
  memory: '1GiB',
  timeoutSeconds: 540,
}
const SITE_SEO_FUNCTION_OPTIONS = {
  region: 'us-central1',
}
const INDEX_SHELL_PATH = join(__dirname, 'generated', 'indexShell.html')
const FALLBACK_INDEX_SHELL = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '    <title>St. John House Rentals</title>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n')
let cachedIndexShell = ''

function sendAvailabilityJson(response, payload) {
  response.set('Cache-Control', PUBLIC_AVAILABILITY_CACHE_CONTROL)
  response.json(payload)
}

function loadIndexShell() {
  if (cachedIndexShell) {
    return cachedIndexShell
  }

  try {
    cachedIndexShell = readFileSync(INDEX_SHELL_PATH, 'utf8')
  } catch {
    cachedIndexShell = FALLBACK_INDEX_SHELL
  }

  return cachedIndexShell
}

function normalizeRequestPath(pathname) {
  const normalizedPath = String(pathname ?? '').replace(/^\/+/, '')
  const apiPrefixes = new Set(['api', 'siteApi', 'siteApiStaging'])

  if (apiPrefixes.has(normalizedPath)) {
    return ''
  }

  return normalizedPath.replace(/^(?:api|siteApi|siteApiStaging)\/+/, '')
}

function sendError(response, error, path) {
  if (error instanceof HttpError) {
    console.warn('siteApi request failed', {
      path,
      status: error.status,
      message: error.message,
    })
    response.status(error.status).json({
      error: 'request-failed',
      message: error.message,
      ...error.details,
    })
    return
  }

  console.error('siteApi unexpected error', {
    path,
    message: error instanceof Error ? error.message : 'Unexpected siteApi error',
    stack: error instanceof Error ? error.stack : undefined,
  })
  response.status(500).json({
    error: 'internal',
    message: error instanceof Error ? error.message : 'Unexpected siteApi error',
    path,
  })
}

function getSeoRequestPathname(request) {
  const urlPath = String(request.path || request.url || '/').split('?')[0].split('#')[0]
  return normalizePathname(urlPath)
}

function getSlugAfterPrefix(pathname, prefix) {
  const normalizedPrefix = normalizePathname(prefix)
  const normalizedPathname = normalizePathname(pathname)

  if (!normalizedPathname.startsWith(`${normalizedPrefix}/`)) {
    return ''
  }

  return normalizedPathname.slice(normalizedPrefix.length + 1)
}

function sendSeoHtml(response, route, status = 200) {
  response.status(status)
  response.type('html')
  response.send(injectPrerenderHead(loadIndexShell(), route))
}

async function handleSiteSeoRequest(request, response, { serviceName, databaseId, mode }) {
  const pathname = getSeoRequestPathname(request)
  response.set('Cache-Control', PUBLIC_SEO_CACHE_CONTROL)
  response.set('X-Firestore-Database', databaseId)
  response.set('X-Site-Api-Variant', mode)
  response.set('X-Site-Seo-Service', serviceName)

  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.status(405).send('Method Not Allowed')
      return
    }

    if (pathname === '/robots.txt') {
      response.type('text/plain')
      response.send(buildRobotsTxt())
      return
    }

    if (pathname === '/sitemap.xml') {
      const [properties, charters] = await Promise.all([listPropertySummaries(), listCharters()])
      response.type('application/xml')
      response.send(buildSitemap(createSeoRoutes({ properties, charters })))
      return
    }

    const propertySlug = getSlugAfterPrefix(pathname, '/rental-properties') || getSlugAfterPrefix(pathname, '/1bedroom')

    if (propertySlug) {
      const property = await getPropertyBySlug(propertySlug)

      if (!property) {
        sendSeoHtml(response, createNotFoundRoute(pathname), 404)
        return
      }

      sendSeoHtml(response, createPropertyRoute(property, pathname))
      return
    }

    const charterSlug = getSlugAfterPrefix(pathname, '/charter-boat-rentals')

    if (charterSlug) {
      const charter = await getCharterBySlug(charterSlug)

      if (!charter) {
        sendSeoHtml(response, createNotFoundRoute(pathname), 404)
        return
      }

      sendSeoHtml(response, createCharterRoute(charter, pathname))
      return
    }

    sendSeoHtml(response, createNotFoundRoute(pathname), 404)
  } catch (error) {
    sendError(response, error, request.path)
  }
}

async function handleSiteApiRequest(request, response, { serviceName, databaseId, mode }) {
  const path = normalizeRequestPath(request.path)
  response.set('Cache-Control', 'no-store')
  response.set('X-Firestore-Database', databaseId)
  response.set('X-Site-Api-Variant', mode)

  try {
    if (request.method === 'GET' && (path === '' || path === 'health')) {
      response.json({
        service: serviceName,
        status: 'ok',
        phase: publicSiteConfig.phase,
        databaseId,
        mode,
        startedAt,
        checkedAt: new Date().toISOString(),
      })
      return
    }

    if (request.method === 'GET' && path === 'site-config') {
      const structuredPages = await listStructuredPages()

      response.json({
        ...publicSiteConfig,
        apiVariant: mode,
        databaseId,
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

    if (request.method === 'GET' && path === 'calendar/availability') {
      const slug = String(request.query?.slug ?? '').trim()

      if (!slug) {
        response.status(400).json({
          error: 'invalid-request',
          message: 'A property slug is required to load calendar availability.',
        })
        return
      }

      const property = await getPropertyBySlug(slug)

      if (!property) {
        response.status(404).json({
          error: 'not-found',
          message: 'Property not found in siteApi',
          slug,
        })
        return
      }

      const availability = await getCalendarAvailability(property)

      sendAvailabilityJson(response, {
        checkedAt: new Date().toISOString(),
        slug,
        ...availability,
      })
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

    if (request.method === 'POST' && path === 'contact/advertise') {
      const inquiry = await saveAdvertiseInquiry(request.body ?? {}, request)

      response.status(201).json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        inquiry,
      })
      return
    }

    if (request.method === 'POST' && path === 'contact/inquiry') {
      const inquiry = await saveAdvertiseInquiry({ source: 'page', ...request.body }, request)

      response.status(201).json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        inquiry,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/contact/advertise') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        inquiries: await listAdvertiseInquiries(),
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/backups/status') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore-admin',
        checkedAt: new Date().toISOString(),
        ...(await getBackupWorkspaceStatus()),
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/backups/export') {
      const adminUser = await requireAdminUser(request)
      const backup = await createManagedBackupExport(request.body ?? {}, adminUser)

      response.status(202).json({
        source: 'firestore-admin',
        checkedAt: new Date().toISOString(),
        ...backup,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/backups/clone') {
      const adminUser = await requireAdminUser(request)
      const clone = await createStagingClone(request.body ?? {}, adminUser)

      response.status(202).json({
        source: 'firestore-admin',
        checkedAt: new Date().toISOString(),
        ...clone,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/backups/staging-preview') {
      const adminUser = await requireAdminUser(request)
      const preview = await deployStagingPreview(adminUser)

      response.json({
        source: 'firebase-hosting',
        checkedAt: new Date().toISOString(),
        ...preview,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/backups/cutover') {
      const adminUser = await requireAdminUser(request)
      const cutover = await switchPublicSiteTarget(request.body ?? {}, adminUser)

      response.json({
        source: 'firebase-hosting',
        checkedAt: new Date().toISOString(),
        ...cutover,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/backups/operations/status') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore-admin',
        checkedAt: new Date().toISOString(),
        operations: await getBackupOperationsStatus(request.body ?? {}),
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/properties') {
      const adminUser = await requireAdminUser(request)
      const savedProperty = await savePropertyRecord(
        request.body?.draft ?? {},
        request.body?.originalSlug ?? '',
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property: savedProperty,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/properties/publish') {
      const adminUser = await requireAdminUser(request)
      const publishedProperty = await publishPropertyRecord(
        request.body?.originalSlug ?? '',
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property: publishedProperty,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/properties/active') {
      const adminUser = await requireAdminUser(request)
      const property = await setPropertyActiveState(
        request.body?.originalSlug ?? '',
        request.body?.active !== false,
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property,
      })
      return
    }

    if (request.method === 'DELETE' && path === 'admin/properties') {
      const adminUser = await requireAdminUser(request)
      const deletedProperty = await deletePropertyRecord(request.body?.originalSlug ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property: deletedProperty,
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

    if (request.method === 'GET' && path.startsWith('admin/properties/')) {
      await requireAdminUser(request)
      const slug = decodeURIComponent(path.replace(/^admin\/properties\//, ''))
      const property = await getAdminPropertyBySlug(slug)

      if (!property) {
        response.status(404).json({
          error: 'not-found',
          message: 'Property not found in admin catalog',
          slug,
        })
        return
      }

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        property,
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
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        charter: savedCharter,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/charters/publish') {
      const adminUser = await requireAdminUser(request)
      const publishedCharter = await publishCharterRecord(
        request.body?.originalSlug ?? '',
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        charter: publishedCharter,
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

    if (request.method === 'DELETE' && path === 'admin/media/folders') {
      const adminUser = await requireAdminUser(request)
      const result = await deleteMediaFolder(request.body?.folderPath ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        result,
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

    if (request.method === 'GET' && path === 'admin/media/usage') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...(await findMediaUsage(request.query?.mediaId ?? '')),
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

    if (request.method === 'POST' && path === 'admin/media/library/delete') {
      await requireAdminUser(request)
      const media = await deleteMediaAssets(request.body?.mediaIds ?? [])

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        media,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/media/library/convert-avif') {
      const adminUser = await requireAdminUser(request)
      const result = await convertMediaAssetsToAvif(request.body?.mediaIds ?? [], adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/media/library/move') {
      const adminUser = await requireAdminUser(request)
      const result = await moveMediaAssets(request.body?.mediaIds ?? [], request.body?.folderPath ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        result,
      })
      return
    }

    if (request.method === 'DELETE' && path.startsWith('admin/media/library/')) {
      await requireAdminUser(request)
      const mediaId = path.replace(/^admin\/media\/library\//, '')
      const media = await deleteMediaAsset(mediaId)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        media,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/edit-locks') {
      await requireAdminUser(request)
      const status = await getLockStatus(request.query?.resourceType ?? '', request.query?.resourceId ?? '')

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...status,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/edit-locks/list') {
      await requireAdminUser(request)
      const locks = await listLockStatuses(request.query?.resourceType ?? '')

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        locks,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/edit-locks/acquire') {
      const adminUser = await requireAdminUser(request)
      const result = await acquireLock(
        request.body?.resourceType ?? '',
        request.body?.resourceId ?? '',
        adminUser,
        request.body?.leaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/edit-locks/heartbeat') {
      const adminUser = await requireAdminUser(request)
      const result = await heartbeatLock(
        request.body?.resourceType ?? '',
        request.body?.resourceId ?? '',
        adminUser,
        request.body?.leaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/edit-locks/release') {
      const adminUser = await requireAdminUser(request)
      const result = await releaseLock(
        request.body?.resourceType ?? '',
        request.body?.resourceId ?? '',
        adminUser,
        request.body?.leaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...result,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/content/site-shell') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...(await getAdminSiteShellContent()),
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/content/site-shell') {
      const adminUser = await requireAdminUser(request)
      const siteShell = await saveSiteShellContent(request.body?.draft ?? {}, adminUser, request.body?.expectedUpdatedAt ?? null)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...siteShell,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/content/site-shell/publish') {
      const adminUser = await requireAdminUser(request)
      const siteShell = await publishSiteShellContent(adminUser, request.body?.expectedUpdatedAt ?? null)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...siteShell,
      })
      return
    }

    if (request.method === 'DELETE' && path === 'admin/content/site-shell') {
      const adminUser = await requireAdminUser(request)
      const siteShell = await resetSiteShellContentToSeed(adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...siteShell,
      })
      return
    }

    if (request.method === 'GET' && path === 'admin/content/pages') {
      await requireAdminUser(request)
      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        pages: await listAdminStructuredPages(),
        deletedPages: await listDeletedStructuredPages(),
        inventory: await listAdminPageInventory(),
      })
      return
    }

    const revisionListPageKey = matchAdminStructuredPageRevisionListPath(path)

    if (request.method === 'GET' && revisionListPageKey) {
      await requireAdminUser(request)
      const revisions = await listStructuredPageRevisions(revisionListPageKey, request.query?.limit)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        revisions,
      })
      return
    }

    const revisionDetailMatch = path.match(/^admin\/content\/pages\/([^/]+)\/revisions\/([^/]+)$/)

    if (request.method === 'GET' && revisionDetailMatch) {
      await requireAdminUser(request)
      const pageKey = decodeURIComponent(revisionDetailMatch[1])
      const revisionId = decodeURIComponent(revisionDetailMatch[2])
      const revision = await getStructuredPageRevision(pageKey, revisionId)

      if (!revision) {
        response.status(404).json({ error: 'not-found', message: 'Structured page revision was not found.' })
        return
      }

      response.json({ source: 'firestore', checkedAt: new Date().toISOString(), revision })
      return
    }

    const pageDocumentKey = matchAdminStructuredPageDocumentPath(path)

    if (request.method === 'GET' && pageDocumentKey) {
      await requireAdminUser(request)
      const page = await getAdminStructuredPageContent(pageDocumentKey)

      if (!page?.page) {
        response.status(404).json({
          error: 'not-found',
          message: 'Structured page draft not found in siteApi',
          key: pageDocumentKey,
        })
        return
      }

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    const revisionRestoreMatch = path.match(/^admin\/content\/pages\/([^/]+)\/revisions\/([^/]+)\/restore$/)
    const deletedPageRestoreMatch = path.match(/^admin\/content\/pages\/([^/]+)\/restore-deleted$/)

    if (request.method === 'POST' && deletedPageRestoreMatch) {
      const adminUser = await requireAdminUser(request)
      const pageKey = decodeURIComponent(deletedPageRestoreMatch[1])
      const page = await restoreDeletedStructuredPage(pageKey, adminUser, request.body?.expectedUpdatedAt ?? null)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    if (request.method === 'POST' && revisionRestoreMatch) {
      const adminUser = await requireAdminUser(request)
      const pageKey = decodeURIComponent(revisionRestoreMatch[1])
      const revisionId = decodeURIComponent(revisionRestoreMatch[2])
      const page = await restoreStructuredPageRevision(
        pageKey,
        revisionId,
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
        request.body?.editLeaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    const publishPageKey = matchAdminStructuredPagePublishPath(path)

    if (request.method === 'POST' && publishPageKey) {
      const adminUser = await requireAdminUser(request)
      const page = await publishStructuredPageContent(
        publishPageKey,
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
        request.body?.editLeaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    if (request.method === 'POST' && pageDocumentKey) {
      const adminUser = await requireAdminUser(request)
      const page = await saveStructuredPageContent(
        pageDocumentKey,
        request.body?.draft ?? {},
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
        request.body?.editLeaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    if (request.method === 'DELETE' && pageDocumentKey) {
      const adminUser = await requireAdminUser(request)
      const page = await resetStructuredPageContentToSeed(
        pageDocumentKey,
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
        request.body?.editLeaseId ?? '',
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...(page ?? { page: null, publication: null }),
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
}

function createSiteApiFunction({ serviceName, mode, resolveDatabaseId }) {
  return onRequest(SITE_API_FUNCTION_OPTIONS, async (request, response) => {
    let databaseId = ''

    try {
      databaseId = resolveDatabaseId()
    } catch (error) {
      sendError(response, error, request.path)
      return
    }

    return runWithRuntimeContext({ databaseId, mode }, async () =>
      handleSiteApiRequest(request, response, { serviceName, databaseId, mode }),
    )
  })
}

function createSiteSeoFunction({ serviceName, mode, resolveDatabaseId }) {
  return onRequest(SITE_SEO_FUNCTION_OPTIONS, async (request, response) => {
    let databaseId = ''

    try {
      databaseId = resolveDatabaseId()
    } catch (error) {
      sendError(response, error, request.path)
      return
    }

    return runWithRuntimeContext({ databaseId, mode }, async () =>
      handleSiteSeoRequest(request, response, { serviceName, databaseId, mode }),
    )
  })
}

function resolveStagingDatabaseId() {
  const stagingDatabaseId = getStagingFirestoreDatabaseId()

  if (isDefaultFirestoreDatabaseId(stagingDatabaseId)) {
    throw new Error(
      'siteApiStaging requires FIRESTORE_STAGING_DATABASE_ID to be set to a non-default cloned Firestore database.',
    )
  }

  return stagingDatabaseId
}

exports.siteApi = createSiteApiFunction({
  serviceName: 'siteApi',
  mode: 'live',
  resolveDatabaseId: () => getLiveFirestoreDatabaseId(),
})

exports.siteSeo = createSiteSeoFunction({
  serviceName: 'siteSeo',
  mode: 'live',
  resolveDatabaseId: () => getLiveFirestoreDatabaseId(),
})

exports.siteApiStaging = createSiteApiFunction({
  serviceName: 'siteApiStaging',
  mode: 'staging',
  resolveDatabaseId: resolveStagingDatabaseId,
})
