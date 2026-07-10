const { GoogleAuth } = require('google-auth-library')
const {
  HttpError,
  getLiveFirestoreDatabaseId,
  getStagingFirestoreDatabaseId,
  isDefaultFirestoreDatabaseId,
  isStagingRuntime,
} = require('./firebaseAdmin')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('./firebaseCliCredentialBootstrap')

const FIRESTORE_ADMIN_API_ROOT = 'https://firestore.googleapis.com/v1'
const FIREBASE_HOSTING_API_ROOT = 'https://firebasehosting.googleapis.com/v1beta1'
const FIRESTORE_ADMIN_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const DEFAULT_HOSTING_SITE_ID = 'st-john-house-rentals'
const DEFAULT_STAGING_CHANNEL_ID = 'staging'
const DEFAULT_STAGING_CHANNEL_TTL = '604800s'
const LIVE_CHANNEL_ID = 'live'
const PUBLIC_API_TARGETS = {
  live: {
    functionId: 'siteApi',
    label: 'Original live database',
  },
  staging: {
    functionId: 'siteApiStaging',
    label: 'Staging clone database',
  },
}
const PUBLIC_API_FUNCTION_IDS = new Set(Object.values(PUBLIC_API_TARGETS).map((entry) => entry.functionId))
const PUBLIC_API_SOURCE_PATTERNS = new Set(['/api/**', '/api{,/**}'])
const HOSTING_OPERATION_POLL_INTERVAL_MS = 1000
const HOSTING_OPERATION_TIMEOUT_MS = 45000

let authClientPromise = null

function normalizeString(value) {
  return String(value ?? '').trim()
}

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(String(value ?? ''))
  } catch {
    return fallback
  }
}

function getProjectId() {
  const configuredProjectId =
    normalizeString(process.env.GCLOUD_PROJECT) ||
    normalizeString(process.env.GOOGLE_CLOUD_PROJECT) ||
    normalizeString(process.env.FIREBASE_PROJECT_ID)

  if (configuredProjectId) {
    return configuredProjectId
  }

  const firebaseConfig = normalizeString(process.env.FIREBASE_CONFIG)

  if (firebaseConfig.startsWith('{')) {
    return normalizeString(parseJson(firebaseConfig, {})?.projectId)
  }

  return ''
}

function getBackupOutputUri() {
  return normalizeString(process.env.FIRESTORE_BACKUP_OUTPUT_URI || process.env.FIRESTORE_BACKUP_BUCKET_URI)
}

function buildDatabaseResourceName(projectId, databaseId) {
  return `projects/${projectId}/databases/${databaseId}`
}

function encodeResourceName(resourceName) {
  return String(resourceName ?? '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function getAuthClient() {
  if (!authClientPromise) {
    primeApplicationDefaultCredentialsFromFirebaseCli()

    const auth = new GoogleAuth({
      scopes: [FIRESTORE_ADMIN_SCOPE],
    })

    authClientPromise = auth.getClient()
  }

  return authClientPromise
}

function buildApiRequestUrl(apiRoot, resourcePath, query = {}) {
  const requestUrl = new URL(`${apiRoot}/${resourcePath}`)

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }

    const normalizedValue = typeof value === 'string' ? value.trim() : value

    if (normalizedValue === '') {
      return
    }

    requestUrl.searchParams.set(key, String(normalizedValue))
  })

  return requestUrl.toString()
}

async function requestGoogleApi(apiRoot, resourcePath, { method = 'GET', body, query } = {}) {
  const authClient = await getAuthClient()
  const requestUrl = buildApiRequestUrl(apiRoot, resourcePath, query)

  try {
    const response = await authClient.request({
      url: requestUrl,
      method,
      ...(body !== undefined
        ? {
            data: body,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        : {}),
    })

    if (typeof response?.data === 'string') {
      return parseJson(response.data, { message: response.data.trim() })
    }

    return response?.data ?? null
  } catch (error) {
    const responseStatus = Number(error?.response?.status || error?.status || 0)
    const responseData =
      typeof error?.response?.data === 'string'
        ? parseJson(error.response.data, { message: String(error.response.data).trim() })
        : error?.response?.data ?? null

    throw new HttpError(
      responseStatus === 400 || responseStatus === 401 || responseStatus === 403 || responseStatus === 404 ? responseStatus : 502,
      responseData?.error?.message ||
        responseData?.message ||
        (error instanceof Error ? error.message : '') ||
        `Google API request failed with status ${responseStatus || 'unknown'}.`,
      {
        apiError: responseData?.error ?? responseData ?? null,
      },
    )
  }
}

async function requestFirestoreAdmin(resourcePath, options = {}) {
  return requestGoogleApi(FIRESTORE_ADMIN_API_ROOT, resourcePath, options)
}

async function requestHostingAdmin(resourcePath, options = {}) {
  return requestGoogleApi(FIREBASE_HOSTING_API_ROOT, resourcePath, options)
}

function truncateToMinute(input) {
  const date = new Date(input)
  date.setUTCSeconds(0, 0)
  return date
}

function ceilToMinute(input) {
  const date = new Date(input)
  const truncated = truncateToMinute(date)

  if (truncated.getTime() === date.getTime()) {
    return truncated
  }

  truncated.setUTCMinutes(truncated.getUTCMinutes() + 1)
  return truncated
}

function latestStableSnapshotTime() {
  return truncateToMinute(Date.now() - 60_000)
}

function defaultSnapshotTime() {
  return latestStableSnapshotTime().toISOString()
}

function normalizeSnapshotTime(value) {
  const normalizedValue = normalizeString(value)

  if (!normalizedValue) {
    return defaultSnapshotTime()
  }

  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpError(400, 'Enter a valid snapshot time in RFC 3339 format.')
  }

  return truncateToMinute(parsedDate).toISOString()
}

function validateSnapshotTime(snapshotTime, earliestVersionTime = '') {
  const requestedSnapshot = new Date(snapshotTime)

  if (Number.isNaN(requestedSnapshot.getTime())) {
    throw new HttpError(400, 'Enter a valid snapshot time in RFC 3339 format.')
  }

  const earliestRecoverableTime = normalizeString(earliestVersionTime)

  if (earliestRecoverableTime) {
    const earliestAllowedSnapshot = ceilToMinute(earliestRecoverableTime)

    if (requestedSnapshot.getTime() < earliestAllowedSnapshot.getTime()) {
      throw new HttpError(
        400,
        `Snapshot time ${snapshotTime} is older than the earliest recoverable minute. Use ${earliestAllowedSnapshot.toISOString()} or later.`,
      )
    }
  }

  const latestAllowedSnapshot = latestStableSnapshotTime()

  if (requestedSnapshot.getTime() > latestAllowedSnapshot.getTime()) {
    throw new HttpError(
      400,
      `Snapshot time ${snapshotTime} is newer than the latest stable recoverable minute. Use ${latestAllowedSnapshot.toISOString()} or earlier.`,
    )
  }
}

function normalizeCollectionIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => normalizeString(entry)).filter(Boolean))]
  }

  return [...new Set(normalizeString(value).split(',').map((entry) => entry.trim()).filter(Boolean))]
}

function validateCloneDatabaseId(value) {
  const databaseId = normalizeString(value)

  if (!databaseId) {
    throw new HttpError(400, 'Enter a destination database id for the staging clone, or configure FIRESTORE_STAGING_DATABASE_ID.')
  }

  if (isDefaultFirestoreDatabaseId(databaseId)) {
    throw new HttpError(400, 'The staging clone must target a non-default Firestore database id.')
  }

  if (databaseId.length < 4 || databaseId.length > 63) {
    throw new HttpError(400, 'Clone database ids must be between 4 and 63 characters.')
  }

  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(databaseId)) {
    throw new HttpError(400, 'Clone database ids may only use lowercase letters, numbers, and dashes, and must start with a letter.')
  }

  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(databaseId)) {
    throw new HttpError(400, 'Clone database ids must not be UUID-like.')
  }

  return databaseId
}

function normalizeTimestampValue(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString()
  }

  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString()
  }

  return ''
}

function createJsonClone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

function normalizeOperation(operation) {
  if (!operation || typeof operation !== 'object') {
    return null
  }

  return {
    name: normalizeString(operation.name),
    done: operation.done === true,
    metadata: createJsonClone(operation.metadata),
    response: createJsonClone(operation.response),
    error: operation.error
      ? {
          code: Number(operation.error.code ?? 0),
          message: normalizeString(operation.error.message),
          details: createJsonClone(operation.error.details),
        }
      : null,
  }
}

function deriveJobStatus(jobRecord, operation = null) {
  if (operation?.error) {
    return 'failed'
  }

  if (operation?.done) {
    return 'completed'
  }

  return normalizeString(jobRecord?.status) || 'running'
}

function normalizeBackupJobResponse(record = {}, operation = null) {
  const normalizedOperation = normalizeOperation(operation || record.operation)
  const operationName = normalizeString(record.operationName || normalizedOperation?.name)
  const releaseName = normalizeString(record.releaseName)
  const versionName = normalizeString(record.versionName)

  return {
    id: operationName || releaseName || versionName || `${normalizeString(record.type)}-${normalizeString(record.snapshotTime)}` || 'backup-job',
    type: normalizeString(record.type),
    status: deriveJobStatus(record, normalizedOperation),
    requestedAt: normalizeTimestampValue(record.requestedAt) || new Date().toISOString(),
    requestedBy: normalizeString(record.requestedBy),
    snapshotTime: normalizeString(record.snapshotTime),
    sourceDatabase: normalizeString(record.sourceDatabase),
    destinationDatabase: normalizeString(record.destinationDatabase),
    outputUriPrefix: normalizeString(record.outputUriPrefix),
    collectionIds: Array.isArray(record.collectionIds) ? record.collectionIds.map((entry) => normalizeString(entry)).filter(Boolean) : [],
    operationName,
    operation: normalizedOperation,
    operationLookupError: normalizeString(record.operationLookupError),
    previousPublicTargetVariant: normalizeString(record.previousPublicTargetVariant),
    publicTargetVariant: normalizeString(record.publicTargetVariant),
    releaseName,
    releaseTime: normalizeString(record.releaseTime),
    siteUrl: normalizeString(record.siteUrl),
    versionName,
  }
}

function getHostingSiteId(projectId) {
  return normalizeString(process.env.FIREBASE_HOSTING_SITE_ID) || normalizeString(projectId) || DEFAULT_HOSTING_SITE_ID
}

function getStagingChannelId() {
  return normalizeString(process.env.FIREBASE_STAGING_CHANNEL_ID) || DEFAULT_STAGING_CHANNEL_ID
}

function getStagingChannelTtl() {
  return normalizeString(process.env.FIREBASE_STAGING_CHANNEL_TTL) || DEFAULT_STAGING_CHANNEL_TTL
}

function resolvePublicApiTarget(functionId) {
  const normalizedFunctionId = normalizeString(functionId)
  const matchingEntry = Object.entries(PUBLIC_API_TARGETS).find(([, entry]) => entry.functionId === normalizedFunctionId)

  if (!matchingEntry) {
    return {
      configured: false,
      functionId: normalizedFunctionId,
      label: normalizedFunctionId || 'Unknown API target',
      variant: '',
    }
  }

  const [variant, entry] = matchingEntry

  return {
    configured: true,
    functionId: entry.functionId,
    label: entry.label,
    variant,
  }
}

function findPublicApiRewrite(version = {}) {
  const rewrites = Array.isArray(version?.config?.rewrites) ? version.config.rewrites : []

  return (
    rewrites.find((rewrite) => PUBLIC_API_FUNCTION_IDS.has(normalizeString(rewrite?.function))) ||
    rewrites.find((rewrite) => PUBLIC_API_SOURCE_PATTERNS.has(normalizeString(rewrite?.glob)))
  )
}

function derivePublicApiTargetFromVersion(version = {}) {
  const rewrite = findPublicApiRewrite(version)
  const resolvedTarget = resolvePublicApiTarget(rewrite?.function)

  return {
    ...resolvedTarget,
    exists: Boolean(rewrite),
    functionRegion: normalizeString(rewrite?.functionRegion) || 'us-central1',
    sourcePattern: normalizeString(rewrite?.glob || rewrite?.regex || rewrite?.path),
  }
}

function createVersionConfigForTarget(versionConfig = {}, targetVariant) {
  const targetConfig = PUBLIC_API_TARGETS[normalizeString(targetVariant)]

  if (!targetConfig) {
    throw new HttpError(400, 'Choose either the live database or the staging clone as the public site target.')
  }

  const nextConfig = createJsonClone(versionConfig) || {}
  const rewrites = Array.isArray(nextConfig.rewrites) ? nextConfig.rewrites.map((rewrite) => createJsonClone(rewrite)) : []
  let rewriteUpdated = false

  nextConfig.rewrites = rewrites.map((rewrite) => {
    if (!PUBLIC_API_FUNCTION_IDS.has(normalizeString(rewrite?.function))) {
      return rewrite
    }

    rewriteUpdated = true

    return {
      ...rewrite,
      function: targetConfig.functionId,
      functionRegion: normalizeString(rewrite?.functionRegion) || 'us-central1',
    }
  })

  if (!rewriteUpdated) {
    throw new HttpError(409, 'The live Hosting config does not contain the expected /api rewrite, so the public cutover cannot be switched safely.')
  }

  return nextConfig
}

function normalizeVersionSummary(version = {}) {
  const publicApiTarget = derivePublicApiTargetFromVersion(version)

  return {
    apiTarget: publicApiTarget,
    createTime: normalizeString(version?.createTime),
    finalizeTime: normalizeString(version?.finalizeTime),
    name: normalizeString(version?.name),
    status: normalizeString(version?.status),
  }
}

function normalizeReleaseSummary(release = {}) {
  const versionSummary = normalizeVersionSummary(release?.version)

  return {
    message: normalizeString(release?.message),
    name: normalizeString(release?.name),
    releaseTime: normalizeString(release?.releaseTime),
    type: normalizeString(release?.type),
    version: versionSummary,
    versionName: versionSummary.name,
  }
}

async function getChannelStatus(siteId, channelId, { label } = {}) {
  const normalizedSiteId = normalizeString(siteId)
  const normalizedChannelId = normalizeString(channelId)

  if (!normalizedSiteId || !normalizedChannelId) {
    return {
      channelId: normalizedChannelId,
      exists: false,
      label: normalizeString(label),
      message: 'Not configured.',
      siteId: normalizedSiteId,
    }
  }

  const channelResourceName = `sites/${normalizedSiteId}/channels/${normalizedChannelId}`

  try {
    const channel = await requestHostingAdmin(encodeResourceName(channelResourceName))
    const release = normalizeReleaseSummary(channel?.release)

    return {
      channelId: normalizedChannelId,
      createTime: normalizeString(channel?.createTime),
      exists: true,
      label: normalizeString(label),
      message: '',
      name: normalizeString(channel?.name),
      release,
      siteId: normalizedSiteId,
      updateTime: normalizeString(channel?.updateTime),
      url: normalizeString(channel?.url),
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return {
        channelId: normalizedChannelId,
        exists: false,
        label: normalizeString(label),
        message: 'Channel not found.',
        siteId: normalizedSiteId,
      }
    }

    throw error
  }
}

async function ensureStagingChannel(siteId, channelId) {
  const normalizedSiteId = normalizeString(siteId)
  const normalizedChannelId = normalizeString(channelId)

  if (!normalizedSiteId || !normalizedChannelId) {
    throw new HttpError(500, 'The staging Hosting channel is not configured.')
  }

  if (normalizedChannelId === LIVE_CHANNEL_ID) {
    throw new HttpError(400, 'The staging preview channel must not be the live Hosting channel.')
  }

  return requestHostingAdmin(encodeResourceName(`sites/${normalizedSiteId}/channels/${normalizedChannelId}`), {
    method: 'PATCH',
    query: {
      updateMask: 'ttl',
    },
    body: {
      ttl: getStagingChannelTtl(),
    },
  })
}

async function readHostingOperation(operationName) {
  const normalizedOperationName = normalizeString(operationName)

  if (!normalizedOperationName) {
    return null
  }

  return requestHostingAdmin(encodeResourceName(normalizedOperationName))
}

async function waitForHostingOperation(operationName, { timeoutMs = HOSTING_OPERATION_TIMEOUT_MS } = {}) {
  const normalizedOperationName = normalizeString(operationName)

  if (!normalizedOperationName) {
    throw new HttpError(502, 'The Firebase Hosting operation did not return an operation name.')
  }

  const deadline = Date.now() + timeoutMs
  let operation = await readHostingOperation(normalizedOperationName)

  while (!operation?.done && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, HOSTING_OPERATION_POLL_INTERVAL_MS))
    operation = await readHostingOperation(normalizedOperationName)
  }

  if (!operation?.done) {
    throw new HttpError(504, 'Timed out while waiting for Firebase Hosting to finish the public site cutover.')
  }

  if (operation?.error) {
    throw new HttpError(
      502,
      normalizeString(operation.error.message) || 'Firebase Hosting could not finish the public site cutover.',
      {
        apiError: createJsonClone(operation.error),
      },
    )
  }

  return operation
}

async function getDatabaseStatus(projectId, databaseId, { label } = {}) {
  const normalizedDatabaseId = normalizeString(databaseId)

  if (!normalizedDatabaseId) {
    return {
      label: normalizeString(label),
      configured: false,
      exists: false,
      databaseId: '',
      message: 'Not configured.',
    }
  }

  const databaseResourceName = buildDatabaseResourceName(projectId, normalizedDatabaseId)

  try {
    const database = await requestFirestoreAdmin(encodeResourceName(databaseResourceName))

    return {
      label: normalizeString(label),
      configured: true,
      exists: true,
      databaseId: normalizedDatabaseId,
      name: normalizeString(database?.name),
      uid: normalizeString(database?.uid),
      locationId: normalizeString(database?.locationId),
      type: normalizeString(database?.type),
      state: normalizeString(database?.state),
      concurrencyMode: normalizeString(database?.concurrencyMode),
      appEngineIntegrationMode: normalizeString(database?.appEngineIntegrationMode),
      deleteProtectionState: normalizeString(database?.deleteProtectionState),
      pointInTimeRecoveryEnablement: normalizeString(database?.pointInTimeRecoveryEnablement),
      earliestVersionTime: normalizeString(database?.earliestVersionTime),
      versionRetentionPeriod: normalizeString(database?.versionRetentionPeriod),
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return {
        label: normalizeString(label),
        configured: true,
        exists: false,
        databaseId: normalizedDatabaseId,
        message: 'Database not found.',
      }
    }

    throw error
  }
}

async function readOperation(operationName) {
  const normalizedOperationName = normalizeString(operationName)

  if (!normalizedOperationName) {
    return null
  }

  return requestFirestoreAdmin(encodeResourceName(normalizedOperationName))
}

function ensureBackupActionsUseLiveApi() {
  if (isStagingRuntime()) {
    throw new HttpError(403, 'Backup actions are disabled on the staging API. Use the live admin workspace to manage backups.')
  }
}

async function getLiveDatabaseMetadata(projectId) {
  const liveDatabase = await getDatabaseStatus(projectId, getLiveFirestoreDatabaseId(), { label: 'Live database' })

  if (!liveDatabase.exists) {
    throw new HttpError(404, 'The live Firestore database could not be found.')
  }

  if (liveDatabase.pointInTimeRecoveryEnablement !== 'POINT_IN_TIME_RECOVERY_ENABLED') {
    throw new HttpError(400, 'Point-in-time recovery is not enabled on the live Firestore database.')
  }

  return liveDatabase
}

exports.getBackupWorkspaceStatus = async function getBackupWorkspaceStatus() {
  const projectId = getProjectId()

  if (!projectId) {
    throw new HttpError(500, 'Unable to determine the Firebase project id for backup management.')
  }

  const hostingSiteId = getHostingSiteId(projectId)
  const stagingChannelId = getStagingChannelId()
  const [liveDatabase, stagingDatabase, liveChannel, stagingChannel] = await Promise.all([
    getDatabaseStatus(projectId, getLiveFirestoreDatabaseId(), { label: 'Live database' }),
    getDatabaseStatus(projectId, getStagingFirestoreDatabaseId(), { label: 'Staging database' }),
    getChannelStatus(hostingSiteId, LIVE_CHANNEL_ID, { label: 'Public live site' }),
    getChannelStatus(hostingSiteId, stagingChannelId, { label: 'Staging preview' }),
  ])

  return {
    apiVariant: isStagingRuntime() ? 'staging' : 'live',
    backupActionsEnabled: !isStagingRuntime(),
    backupOutputUri: getBackupOutputUri(),
    hosting: {
      liveChannel,
      publicTrafficTarget: normalizeString(liveChannel?.release?.version?.apiTarget?.variant),
      siteId: hostingSiteId,
      stagingChannel,
    },
    liveDatabase,
    projectId,
    stagingDatabase,
  }
}

exports.getBackupOperationsStatus = async function getBackupOperationsStatus(payload = {}) {
  const operationNames = Array.isArray(payload?.operationNames)
    ? [...new Set(payload.operationNames.map((value) => normalizeString(value)).filter(Boolean))]
    : []

  return Promise.all(
    operationNames.map(async (operationName) => {
      try {
        const operation = await readOperation(operationName)
        return {
          operationName,
          operation: normalizeOperation(operation),
          status: deriveJobStatus({}, operation),
        }
      } catch (error) {
        return {
          operationName,
          operation: null,
          operationLookupError: error instanceof Error ? error.message : 'Unable to load the operation status.',
          status: 'warning',
        }
      }
    }),
  )
}

exports.createManagedBackupExport = async function createManagedBackupExport(payload = {}, adminUser) {
  ensureBackupActionsUseLiveApi()

  const projectId = getProjectId()

  if (!projectId) {
    throw new HttpError(500, 'Unable to determine the Firebase project id for backup management.')
  }

  const liveDatabase = await getLiveDatabaseMetadata(projectId)
  const snapshotTime = normalizeSnapshotTime(payload?.snapshotTime)
  validateSnapshotTime(snapshotTime, liveDatabase.earliestVersionTime)

  const outputUriPrefix = normalizeString(payload?.outputUriPrefix) || getBackupOutputUri()

  if (!outputUriPrefix) {
    throw new HttpError(400, 'Configure FIRESTORE_BACKUP_OUTPUT_URI before creating managed backups from the admin.')
  }

  const collectionIds = normalizeCollectionIds(payload?.collectionIds)
  const databaseResourceName = buildDatabaseResourceName(projectId, liveDatabase.databaseId)
  const operation = await requestFirestoreAdmin(`${encodeResourceName(databaseResourceName)}:exportDocuments`, {
    method: 'POST',
    body: {
      ...(collectionIds.length > 0 ? { collectionIds } : {}),
      outputUriPrefix,
      snapshotTime,
    },
  })

  return {
    job: normalizeBackupJobResponse(
      {
        collectionIds,
        operationName: normalizeString(operation?.name),
        outputUriPrefix,
        requestedAt: new Date().toISOString(),
        requestedBy: normalizeString(adminUser?.email || adminUser?.uid || 'admin'),
        snapshotTime,
        sourceDatabase: liveDatabase.databaseId,
        status: operation?.done === true ? 'completed' : 'running',
        type: 'managed-export',
      },
      operation,
    ),
  }
}

exports.createStagingClone = async function createStagingClone(payload = {}, adminUser) {
  ensureBackupActionsUseLiveApi()

  const projectId = getProjectId()

  if (!projectId) {
    throw new HttpError(500, 'Unable to determine the Firebase project id for backup management.')
  }

  const liveDatabase = await getLiveDatabaseMetadata(projectId)
  const snapshotTime = normalizeSnapshotTime(payload?.snapshotTime)
  validateSnapshotTime(snapshotTime, liveDatabase.earliestVersionTime)

  const destinationDatabase = validateCloneDatabaseId(payload?.databaseId || getStagingFirestoreDatabaseId())

  if (destinationDatabase === liveDatabase.databaseId) {
    throw new HttpError(400, 'The staging clone destination must be different from the live database id.')
  }

  const sourceDatabaseName = buildDatabaseResourceName(projectId, liveDatabase.databaseId)
  const operation = await requestFirestoreAdmin(`${encodeResourceName(`projects/${projectId}`)}/databases:clone`, {
    method: 'POST',
    body: {
      databaseId: destinationDatabase,
      pitrSnapshot: {
        database: sourceDatabaseName,
        snapshotTime,
      },
    },
  })

  return {
    job: normalizeBackupJobResponse(
      {
        destinationDatabase,
        operationName: normalizeString(operation?.name),
        requestedAt: new Date().toISOString(),
        requestedBy: normalizeString(adminUser?.email || adminUser?.uid || 'admin'),
        snapshotTime,
        sourceDatabase: liveDatabase.databaseId,
        status: operation?.done === true ? 'completed' : 'running',
        type: 'staging-clone',
      },
      operation,
    ),
  }
}

exports.switchPublicSiteTarget = async function switchPublicSiteTarget(payload = {}, adminUser) {
  ensureBackupActionsUseLiveApi()

  const projectId = getProjectId()

  if (!projectId) {
    throw new HttpError(500, 'Unable to determine the Firebase project id for backup management.')
  }

  const targetVariant = normalizeString(payload?.target || payload?.targetVariant).toLowerCase()
  if (!PUBLIC_API_TARGETS[targetVariant]) {
    throw new HttpError(400, 'Choose either the live database or the staging clone as the public site target.')
  }

  if (targetVariant === 'staging') {
    const stagingDatabaseStatus = await getDatabaseStatus(projectId, getStagingFirestoreDatabaseId(), { label: 'Staging database' })

    if (!stagingDatabaseStatus.exists) {
      throw new HttpError(400, 'The staging Firestore database does not exist yet. Clone the live database to staging before switching the public site.')
    }
  }

  const hostingSiteId = getHostingSiteId(projectId)
  const liveChannel = await getChannelStatus(hostingSiteId, LIVE_CHANNEL_ID, { label: 'Public live site' })

  if (!liveChannel.exists || !liveChannel.release?.versionName) {
    throw new HttpError(409, 'The public live Hosting channel does not have an active release to clone.')
  }

  const currentTarget = liveChannel.release.version.apiTarget

  if (!currentTarget.exists || !currentTarget.variant) {
    throw new HttpError(409, 'The current live Hosting release does not expose a switchable /api rewrite.')
  }

  if (currentTarget.variant === targetVariant) {
    return {
      job: normalizeBackupJobResponse({
        previousPublicTargetVariant: currentTarget.variant,
        publicTargetVariant: currentTarget.variant,
        releaseName: liveChannel.release.name,
        releaseTime: liveChannel.release.releaseTime,
        requestedAt: new Date().toISOString(),
        requestedBy: normalizeString(adminUser?.email || adminUser?.uid || 'admin'),
        siteUrl: liveChannel.url,
        status: 'completed',
        type: 'public-cutover',
        versionName: liveChannel.release.versionName,
      }),
      unchanged: true,
    }
  }

  const cloneOperation = await requestHostingAdmin(`sites/${hostingSiteId}/versions:clone`, {
    method: 'POST',
    body: {
      finalize: false,
      sourceVersion: liveChannel.release.versionName,
    },
  })

  const completedCloneOperation = await waitForHostingOperation(cloneOperation?.name)
  const clonedVersionName =
    normalizeString(completedCloneOperation?.response?.name) ||
    normalizeString(completedCloneOperation?.response?.version?.name) ||
    normalizeString(completedCloneOperation?.metadata?.target)

  if (!clonedVersionName) {
    throw new HttpError(502, 'Firebase Hosting finished cloning the live release but did not return the cloned version name.')
  }

  const clonedVersion = await requestHostingAdmin(encodeResourceName(clonedVersionName))
  const nextConfig = createVersionConfigForTarget(clonedVersion?.config, targetVariant)
  const finalizedVersion = await requestHostingAdmin(encodeResourceName(clonedVersionName), {
    method: 'PATCH',
    query: {
      updateMask: 'config,status',
    },
    body: {
      config: nextConfig,
      status: 'FINALIZED',
    },
  })

  const releaseMessageParts = [
    `Admin public cutover ${currentTarget.variant} → ${targetVariant}`,
    normalizeString(adminUser?.email || adminUser?.uid),
  ].filter(Boolean)

  const release = await requestHostingAdmin(`sites/${hostingSiteId}/channels/${LIVE_CHANNEL_ID}/releases`, {
    method: 'POST',
    query: {
      versionName: normalizeString(finalizedVersion?.name),
    },
    body: {
      message: releaseMessageParts.join(' | ').slice(0, 512),
      type: 'DEPLOY',
    },
  })

  const refreshedLiveChannel = await getChannelStatus(hostingSiteId, LIVE_CHANNEL_ID, { label: 'Public live site' })
  const nextTarget = refreshedLiveChannel.release?.version?.apiTarget || derivePublicApiTargetFromVersion(finalizedVersion)

  return {
    job: normalizeBackupJobResponse({
      previousPublicTargetVariant: currentTarget.variant,
      publicTargetVariant: normalizeString(nextTarget.variant) || targetVariant,
      releaseName: normalizeString(release?.name),
      releaseTime: normalizeString(release?.releaseTime),
      requestedAt: new Date().toISOString(),
      requestedBy: normalizeString(adminUser?.email || adminUser?.uid || 'admin'),
      siteUrl: refreshedLiveChannel.url,
      status: 'completed',
      type: 'public-cutover',
      versionName: normalizeString(finalizedVersion?.name),
    }),
    liveChannel: refreshedLiveChannel,
    unchanged: false,
  }
}

exports.deployStagingPreview = async function deployStagingPreview(adminUser) {
  ensureBackupActionsUseLiveApi()

  const projectId = getProjectId()

  if (!projectId) {
    throw new HttpError(500, 'Unable to determine the Firebase project id for backup management.')
  }

  const stagingDatabaseStatus = await getDatabaseStatus(projectId, getStagingFirestoreDatabaseId(), { label: 'Staging database' })

  if (!stagingDatabaseStatus.exists) {
    throw new HttpError(400, 'The staging Firestore database does not exist yet. Clone the live database to staging before deploying the staging preview.')
  }

  const hostingSiteId = getHostingSiteId(projectId)
  const stagingChannelId = getStagingChannelId()
  const liveChannel = await getChannelStatus(hostingSiteId, LIVE_CHANNEL_ID, { label: 'Public live site' })

  if (!liveChannel.exists || !liveChannel.release?.versionName) {
    throw new HttpError(409, 'The public live Hosting channel does not have an active release to clone for the staging preview.')
  }

  await ensureStagingChannel(hostingSiteId, stagingChannelId)

  const cloneOperation = await requestHostingAdmin(`sites/${hostingSiteId}/versions:clone`, {
    method: 'POST',
    body: {
      finalize: false,
      sourceVersion: liveChannel.release.versionName,
    },
  })

  const completedCloneOperation = await waitForHostingOperation(cloneOperation?.name)
  const clonedVersionName =
    normalizeString(completedCloneOperation?.response?.name) ||
    normalizeString(completedCloneOperation?.response?.version?.name) ||
    normalizeString(completedCloneOperation?.metadata?.target)

  if (!clonedVersionName) {
    throw new HttpError(502, 'Firebase Hosting finished cloning the live release but did not return the cloned version name for the staging preview.')
  }

  const clonedVersion = await requestHostingAdmin(encodeResourceName(clonedVersionName))
  const nextConfig = createVersionConfigForTarget(clonedVersion?.config, 'staging')
  const finalizedVersion = await requestHostingAdmin(encodeResourceName(clonedVersionName), {
    method: 'PATCH',
    query: {
      updateMask: 'config,status',
    },
    body: {
      config: nextConfig,
      status: 'FINALIZED',
    },
  })

  const releaseMessageParts = [
    'Admin staging preview refresh',
    normalizeString(adminUser?.email || adminUser?.uid),
  ].filter(Boolean)

  const release = await requestHostingAdmin(`sites/${hostingSiteId}/channels/${stagingChannelId}/releases`, {
    method: 'POST',
    query: {
      versionName: normalizeString(finalizedVersion?.name),
    },
    body: {
      message: releaseMessageParts.join(' | ').slice(0, 512),
      type: 'DEPLOY',
    },
  })

  const refreshedStagingChannel = await getChannelStatus(hostingSiteId, stagingChannelId, { label: 'Staging preview' })

  return {
    job: normalizeBackupJobResponse({
      destinationDatabase: stagingDatabaseStatus.databaseId,
      operationName: normalizeString(cloneOperation?.name),
      publicTargetVariant: 'staging',
      releaseName: normalizeString(release?.name),
      releaseTime: normalizeString(release?.releaseTime),
      requestedAt: new Date().toISOString(),
      requestedBy: normalizeString(adminUser?.email || adminUser?.uid || 'admin'),
      siteUrl: refreshedStagingChannel.url,
      sourceDatabase: getLiveFirestoreDatabaseId(),
      status: 'completed',
      type: 'staging-preview-deploy',
      versionName: normalizeString(finalizedVersion?.name),
    }),
    stagingChannel: refreshedStagingChannel,
  }
}
