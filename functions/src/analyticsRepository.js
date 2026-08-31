const { GoogleAuth } = require('google-auth-library')
const { HttpError } = require('./firebaseAdmin')
const { primeApplicationDefaultCredentialsFromFirebaseCli } = require('./firebaseCliCredentialBootstrap')

const ANALYTICS_DATA_API_ROOT = 'https://analyticsdata.googleapis.com/v1beta'
const ANALYTICS_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const DEFAULT_DATE_RANGE = {
  startDate: '30daysAgo',
  endDate: 'today',
}
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_CUSTOM_DATE_RANGE_DAYS = 366

let authClientPromise = null

function normalizeString(value) {
  return String(value ?? '').trim()
}

function normalizePropertyId(value) {
  return normalizeString(value).replace(/^properties\//, '')
}

function getAnalyticsPropertyId() {
  return normalizePropertyId(
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID ||
      process.env.GA4_PROPERTY_ID ||
      process.env.FIREBASE_ANALYTICS_PROPERTY_ID ||
      '',
  )
}

function normalizePagePath(value) {
  const candidate = normalizeString(value)

  if (!candidate) {
    return ''
  }

  let pathname

  try {
    pathname = new URL(candidate).pathname
  } catch {
    pathname = candidate.split(/[?#]/, 1)[0]
  }

  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`
  }

  return pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
}

function parseDateOnly(value) {
  const normalized = normalizeString(value)

  if (!DATE_ONLY_PATTERN.test(normalized)) {
    return null
  }

  const [year, month, day] = normalized.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }

  return date
}

function normalizeAnalyticsDateRange({ startDate, endDate } = {}) {
  const normalizedStartDate = normalizeString(startDate)
  const normalizedEndDate = normalizeString(endDate)

  if (!normalizedStartDate && !normalizedEndDate) {
    return { ...DEFAULT_DATE_RANGE }
  }

  const parsedStartDate = parseDateOnly(normalizedStartDate)
  const parsedEndDate = parseDateOnly(normalizedEndDate)

  if (!parsedStartDate || !parsedEndDate) {
    throw new HttpError(400, 'Analytics start and end dates must both be valid dates (YYYY-MM-DD).')
  }

  if (parsedStartDate > parsedEndDate) {
    throw new HttpError(400, 'Analytics start date must be on or before the end date.')
  }

  const inclusiveDayCount = Math.round((parsedEndDate.getTime() - parsedStartDate.getTime()) / 86400000) + 1

  if (inclusiveDayCount > MAX_CUSTOM_DATE_RANGE_DAYS) {
    throw new HttpError(400, `Analytics date range must be ${MAX_CUSTOM_DATE_RANGE_DAYS} days or fewer.`)
  }

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  }
}

function getPropertyPagePathCandidates(property = {}) {
  return Array.from(
    new Set(
      [
        property.path,
        property.slug ? `/rental-properties/${property.slug}` : '',
        property.slug ? `/1bedroom/${property.slug}` : '',
      ]
        .map((value) => normalizePagePath(value))
        .filter(Boolean),
    ),
  )
}

async function getAuthClient() {
  if (!authClientPromise) {
    primeApplicationDefaultCredentialsFromFirebaseCli()

    const auth = new GoogleAuth({
      scopes: [ANALYTICS_READONLY_SCOPE],
    })

    authClientPromise = auth.getClient()
  }

  return authClientPromise
}

function createPagePathFilter(pagePaths = []) {
  const expressions = pagePaths.map((pagePath) => ({
    filter: {
      fieldName: 'pagePath',
      stringFilter: {
        matchType: 'EXACT',
        value: pagePath,
        caseSensitive: false,
      },
    },
  }))

  if (expressions.length === 1) {
    return expressions[0]
  }

  return {
    orGroup: {
      expressions,
    },
  }
}

async function runAnalyticsReport(propertyId, body) {
  const authClient = await getAuthClient()
  const response = await authClient.request({
    url: `${ANALYTICS_DATA_API_ROOT}/properties/${encodeURIComponent(propertyId)}:runReport`,
    method: 'POST',
    data: body,
  })

  return response.data ?? {}
}

function readMetricValue(row, index) {
  const rawValue = row?.metricValues?.[index]?.value
  const numericValue = Number(rawValue)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function readDimensionValue(row, index) {
  return normalizeString(row?.dimensionValues?.[index]?.value)
}

function buildEmptyMetrics() {
  return {
    activeUsers: 0,
    averageSessionDuration: 0,
    engagementRate: 0,
    sessions: 0,
    views: 0,
  }
}

function createAnalyticsUnavailableMessage(error) {
  const status = Number(error?.response?.status ?? error?.code ?? 0)
  const apiMessage = normalizeString(error?.response?.data?.error?.message || error?.message)

  if (status === 403) {
    return 'Google Analytics refused the report request. Grant the Cloud Functions service account Analytics Viewer access to the GA4 property and confirm the Analytics Data API is enabled.'
  }

  if (status === 404) {
    return 'Google Analytics could not find the configured GA4 property id. Check GOOGLE_ANALYTICS_PROPERTY_ID.'
  }

  return apiMessage || 'Google Analytics data is temporarily unavailable.'
}

async function getPropertyAnalyticsReport(property = {}, requestedDateRange = {}) {
  const propertyId = getAnalyticsPropertyId()
  const pagePaths = getPropertyPagePathCandidates(property)
  const dateRange = normalizeAnalyticsDateRange(requestedDateRange)

  if (!propertyId) {
    return {
      status: 'unconfigured',
      message: 'Set GOOGLE_ANALYTICS_PROPERTY_ID to the numeric GA4 property id to show client property analytics.',
      pagePaths,
      dateRange,
      metrics: buildEmptyMetrics(),
      daily: [],
      sources: [],
    }
  }

  if (pagePaths.length === 0) {
    return {
      status: 'unavailable',
      message: 'This property does not have a public page path to query in Google Analytics.',
      pagePaths,
      dateRange,
      metrics: buildEmptyMetrics(),
      daily: [],
      sources: [],
    }
  }

  const dimensionFilter = createPagePathFilter(pagePaths)

  let summaryReport
  let dailyReport
  let sourceReport

  try {
    ;[summaryReport, dailyReport, sourceReport] = await Promise.all([
      runAnalyticsReport(propertyId, {
        dateRanges: [dateRange],
        dimensionFilter,
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'engagementRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
      runAnalyticsReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'date' }],
        dimensionFilter,
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ dimension: { dimensionName: 'date' }, desc: true }],
        limit: 30,
      }),
      runAnalyticsReport(propertyId, {
        dateRanges: [dateRange],
        dimensions: [{ name: 'sessionSourceMedium' }],
        dimensionFilter,
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 10,
      }),
    ])
  } catch (error) {
    return {
      status: 'unavailable',
      message: createAnalyticsUnavailableMessage(error),
      pagePaths,
      propertyId,
      dateRange,
      metrics: buildEmptyMetrics(),
      daily: [],
      sources: [],
    }
  }

  const summaryRow = summaryReport.rows?.[0] ?? null

  return {
    status: 'ready',
    pagePaths,
    propertyId,
    dateRange,
    metrics: summaryRow
      ? {
          views: readMetricValue(summaryRow, 0),
          activeUsers: readMetricValue(summaryRow, 1),
          sessions: readMetricValue(summaryRow, 2),
          engagementRate: readMetricValue(summaryRow, 3),
          averageSessionDuration: readMetricValue(summaryRow, 4),
        }
      : buildEmptyMetrics(),
    daily: (dailyReport.rows ?? []).map((row) => ({
      date: readDimensionValue(row, 0),
      views: readMetricValue(row, 0),
      activeUsers: readMetricValue(row, 1),
    })),
    sources: (sourceReport.rows ?? []).map((row) => ({
      sourceMedium: readDimensionValue(row, 0),
      sessions: readMetricValue(row, 0),
    })),
  }
}

exports.getPropertyAnalyticsReport = getPropertyAnalyticsReport
exports.normalizeAnalyticsDateRange = normalizeAnalyticsDateRange
