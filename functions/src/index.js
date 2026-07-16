const { onRequest } = require('firebase-functions/v2/https')
const { listAdvertiseInquiries, saveAdvertiseInquiry } = require('./advertiseInquiryRepository')
const { getIcsAvailability } = require('./calendarRepository')
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
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaAssets,
  deleteMediaFolder,
  listMediaLibrary,
  moveMediaAssets,
  uploadMediaAsset,
} = require('./mediaRepository')
const { acquireLock, getLockStatus, heartbeatLock, listLockStatuses, releaseLock } = require('./editLockRepository')
const {
  getAdminSiteShellContent,
  getAdminStructuredPageContent,
  getSiteShellContent,
  getStructuredPageContent,
  listAdminPageInventory,
  listAdminStructuredPages,
  listPageInventory,
  listStructuredPages,
  publishSiteShellContent,
  publishStructuredPageContent,
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

const PUBLIC_AVAILABILITY_CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800'

function sendAvailabilityJson(response, payload) {
  response.set('Cache-Control', PUBLIC_AVAILABILITY_CACHE_CONTROL)
  response.json(payload)
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

      const availability = await getIcsAvailability(property)

      sendAvailabilityJson(response, {
        source: 'ics',
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
      const result = await acquireLock(request.body?.resourceType ?? '', request.body?.resourceId ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/edit-locks/heartbeat') {
      const adminUser = await requireAdminUser(request)
      const result = await heartbeatLock(request.body?.resourceType ?? '', request.body?.resourceId ?? '', adminUser)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...result,
      })
      return
    }

    if (request.method === 'POST' && path === 'admin/edit-locks/release') {
      const adminUser = await requireAdminUser(request)
      const result = await releaseLock(request.body?.resourceType ?? '', request.body?.resourceId ?? '', adminUser)

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
        inventory: await listAdminPageInventory(),
      })
      return
    }

    if (request.method === 'GET' && path.startsWith('admin/content/pages/')) {
      await requireAdminUser(request)
      const pageKey = path.replace(/^admin\/content\/pages\//, '')
      const page = await getAdminStructuredPageContent(pageKey)

      if (!page?.page) {
        response.status(404).json({
          error: 'not-found',
          message: 'Structured page draft not found in siteApi',
          key: pageKey,
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

    if (request.method === 'POST' && path.startsWith('admin/content/pages/') && path.endsWith('/publish')) {
      const adminUser = await requireAdminUser(request)
      const pageKey = path.replace(/^admin\/content\/pages\//, '').replace(/\/publish$/, '')
      const page = await publishStructuredPageContent(pageKey, adminUser, request.body?.expectedUpdatedAt ?? null)

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
      })
      return
    }

    if (request.method === 'POST' && path.startsWith('admin/content/pages/')) {
      const adminUser = await requireAdminUser(request)
      const pageKey = path.replace(/^admin\/content\/pages\//, '')
      const page = await saveStructuredPageContent(
        pageKey,
        request.body?.draft ?? {},
        adminUser,
        request.body?.expectedUpdatedAt ?? null,
      )

      response.json({
        source: 'firestore',
        checkedAt: new Date().toISOString(),
        ...page,
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
  return onRequest({ region: 'us-central1', cors: true }, async (request, response) => {
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

exports.siteApiStaging = createSiteApiFunction({
  serviceName: 'siteApiStaging',
  mode: 'staging',
  resolveDatabaseId: resolveStagingDatabaseId,
})
