const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')

const INVOICE_COLLECTION = 'cmsClientInvoices'
const INVOICE_COUNTER_COLLECTION = 'cmsClientInvoiceCounters'
const INVOICE_STATUSES = new Set(['draft', 'sent', 'paid', 'overdue', 'void'])
const ANALYTICS_STATUSES = new Set(['ready', 'unconfigured', 'unavailable'])
const SOCIAL_STAT_KEYS = ['views', 'viewers', 'clicks', 'impressions', 'reach', 'engagements']
const ENGAGEMENT_METRIC_KEYS = [
  'siteLikes',
  'facebookLikes',
  'facebookShareClicks',
  'pinterestShareClicks',
  'twitterShareClicks',
  'whatsappShareClicks',
  'emailShareClicks',
  'nativeShareClicks',
]
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const INVOICE_NUMBER_PREFIX = 'STJHR'
const INVOICE_NUMBER_PATTERN = /^(?:GENCMS|STJHR)-(\d{4})-(\d{3,})$/

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

function normalizeField(value, { label, maxLength, required = false } = {}) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')

  if (required && !normalized) {
    throw new HttpError(400, `${label} is required.`)
  }

  if (normalized.length > maxLength) {
    throw new HttpError(400, `${label} must be ${maxLength} characters or fewer.`)
  }

  return normalized
}

function normalizeDateOnlyValue(value, { label, required = false } = {}) {
  const normalized = String(value ?? '').trim().slice(0, 10)

  if (!normalized) {
    if (required) {
      throw new HttpError(400, `${label} is required.`)
    }

    return ''
  }

  if (!DATE_ONLY_PATTERN.test(normalized)) {
    throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`)
  }

  const [year, month, day] = normalized.split('-').map((part) => Number(part))
  const parsedDate = new Date(Date.UTC(year, month - 1, day))
  const isValidCalendarDate =
    parsedDate.getUTCFullYear() === year && parsedDate.getUTCMonth() === month - 1 && parsedDate.getUTCDate() === day

  if (!isValidCalendarDate) {
    throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`)
  }

  return normalized
}

function normalizeLineItems(value) {
  const items = Array.isArray(value) ? value : []
  const normalized = items
    .map((item) => ({
      description: normalizeField(item?.description, { label: 'Line item description', maxLength: 200 }),
      amount: normalizeField(item?.amount, { label: 'Line item amount', maxLength: 20 }),
    }))
    .filter((item) => item.description || item.amount)

  if (normalized.length === 0) {
    throw new HttpError(400, 'At least one invoice line item is required.')
  }

  return normalized
}

function normalizeMetricValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeOptionalMetricValue(value) {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return null
  }

  const cleanedValue = rawValue.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  if (!/[0-9]/.test(cleanedValue)) {
    return null
  }

  const number = Number(cleanedValue)
  return Number.isFinite(number) ? number : null
}

function normalizeSocialStatEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const metricSource = entry.metrics && typeof entry.metrics === 'object' ? entry.metrics : entry
  const metrics = SOCIAL_STAT_KEYS.reduce((normalized, key) => {
    const value = normalizeOptionalMetricValue(metricSource[key])

    if (value !== null) {
      normalized[key] = value
    }

    return normalized
  }, {})

  if (Object.keys(metrics).length === 0) {
    return null
  }

  const startDate = normalizeDateOnlyValue(entry.startDate ?? entry.dateRange?.startDate, {
    label: 'Social stats start date',
  })
  const endDate = normalizeDateOnlyValue(entry.endDate ?? entry.dateRange?.endDate, {
    label: 'Social stats end date',
  })

  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new HttpError(400, 'Social stats start and end dates must both be provided.')
  }

  if (startDate && startDate > endDate) {
    throw new HttpError(400, 'Social stats start date must be on or before the end date.')
  }

  return {
    label:
      normalizeField(entry.label ?? entry.platform ?? 'Social media marketing', {
        label: 'Social stats label',
        maxLength: 120,
      }) || 'Social media marketing',
    startDate,
    endDate,
    metrics,
  }
}

function normalizeSocialStats(value) {
  const entries = Array.isArray(value) ? value : value ? [value] : []
  return entries.map(normalizeSocialStatEntry).filter(Boolean).slice(0, 10)
}

function normalizeAnalyticsSnapshot(snapshot = {}) {
  const propertySlug = String(snapshot?.propertySlug ?? '').trim()

  if (!propertySlug) {
    return null
  }

  const report = snapshot?.report ?? snapshot
  const status = ANALYTICS_STATUSES.has(report?.status) ? report.status : 'unavailable'
  const metrics = report?.metrics ?? {}

  return {
    propertySlug,
    propertyName: String(snapshot?.propertyName ?? '').trim(),
    capturedAt: String(snapshot?.capturedAt ?? '').trim(),
    status,
    message: String(report?.message ?? '').trim(),
    dateRange: {
      startDate: String(report?.dateRange?.startDate ?? '').trim(),
      endDate: String(report?.dateRange?.endDate ?? '').trim(),
    },
    pagePaths: Array.isArray(report?.pagePaths)
      ? report.pagePaths.map((path) => String(path ?? '').trim()).filter(Boolean).slice(0, 10)
      : [],
    metrics: {
      views: normalizeMetricValue(metrics.views),
      activeUsers: normalizeMetricValue(metrics.activeUsers),
      sessions: normalizeMetricValue(metrics.sessions),
      engagementRate: normalizeMetricValue(metrics.engagementRate),
      averageSessionDuration: normalizeMetricValue(metrics.averageSessionDuration),
    },
    sources: Array.isArray(report?.sources)
      ? report.sources.slice(0, 5).map((row) => ({
          sourceMedium: String(row?.sourceMedium ?? '').trim(),
          sessions: normalizeMetricValue(row?.sessions),
        }))
      : [],
    socialStats: normalizeSocialStats(
      report?.socialStats ?? snapshot?.socialStats ?? report?.marketingStats ?? snapshot?.marketingStats,
    ),
  }
}

function normalizeAnalyticsSnapshots(value) {
  const snapshots = Array.isArray(value) ? value : value ? [value] : []
  return snapshots.map(normalizeAnalyticsSnapshot).filter(Boolean).slice(0, 20)
}

function normalizeEngagementSnapshot(snapshot = {}) {
  const propertySlug = String(snapshot?.propertySlug ?? '').trim()

  if (!propertySlug) {
    return null
  }

  const report = snapshot?.report ?? snapshot
  const counts = report?.counts ?? {}

  return {
    propertySlug,
    propertyName: String(snapshot?.propertyName ?? '').trim(),
    capturedAt: String(snapshot?.capturedAt ?? '').trim(),
    dateRange: {
      startDate: String(report?.dateRange?.startDate ?? '').trim(),
      endDate: String(report?.dateRange?.endDate ?? '').trim(),
    },
    requestedDateRange: {
      startDate: String(report?.requestedDateRange?.startDate ?? '').trim(),
      endDate: String(report?.requestedDateRange?.endDate ?? '').trim(),
    },
    trackingStartDate: String(report?.trackingStartDate ?? '').trim(),
    clamped: report?.clamped === true,
    counts: ENGAGEMENT_METRIC_KEYS.reduce((normalized, key) => {
      normalized[key] = normalizeMetricValue(counts[key])
      return normalized
    }, {}),
    totalEvents: normalizeMetricValue(report?.totalEvents),
  }
}

function normalizeEngagementSnapshots(value) {
  const snapshots = Array.isArray(value) ? value : value ? [value] : []
  return snapshots.map(normalizeEngagementSnapshot).filter(Boolean).slice(0, 20)
}

function computeAmountTotal(lineItems) {
  const total = lineItems.reduce((sum, item) => {
    const numeric = Number(String(item.amount).replace(/[^0-9.-]/g, ''))
    return sum + (Number.isFinite(numeric) ? numeric : 0)
  }, 0)

  return total.toFixed(2)
}

function normalizeInvoiceDraft(payload) {
  const clientId = normalizeField(payload?.clientId, { label: 'Client', maxLength: 200, required: true })
  const propertySlugs = Array.isArray(payload?.propertySlugs)
    ? Array.from(
        new Set(
          payload.propertySlugs
            .map((slug) => normalizeField(slug, { label: 'Property identifier', maxLength: 200 }))
            .filter(Boolean),
        ),
      )
    : []
  const lineItems = normalizeLineItems(payload?.lineItems)
  const issueDate = normalizeDateOnlyValue(payload?.issueDate, { label: 'Issue date', required: true })
  const dueDate = normalizeDateOnlyValue(payload?.dueDate, { label: 'Due date' })
  const analyticsStartDate = normalizeDateOnlyValue(payload?.analyticsStartDate, { label: 'Analytics start date' })
  const analyticsEndDate = normalizeDateOnlyValue(payload?.analyticsEndDate, { label: 'Analytics end date' })
  const notes = normalizeField(payload?.notes, { label: 'Notes', maxLength: 2000 })
  const analyticsSnapshots = normalizeAnalyticsSnapshots(payload?.analyticsSnapshots)
  const engagementSnapshots = normalizeEngagementSnapshots(payload?.engagementSnapshots)
  const socialStats = normalizeSocialStats(payload?.socialStats ?? payload?.marketingStats)

  if (propertySlugs.length === 0) {
    throw new HttpError(400, 'Select at least one property for this invoice.')
  }

  if (propertySlugs.length > 20) {
    throw new HttpError(400, 'An invoice can include no more than 20 properties.')
  }

  if (Boolean(analyticsStartDate) !== Boolean(analyticsEndDate)) {
    throw new HttpError(400, 'Analytics start and end dates must both be provided.')
  }

  if (analyticsStartDate && analyticsStartDate > analyticsEndDate) {
    throw new HttpError(400, 'Analytics start date must be on or before the end date.')
  }

  if (dueDate && dueDate < issueDate) {
    throw new HttpError(400, 'Due date must be on or after the issue date.')
  }

  return {
    clientId,
    propertySlugs,
    lineItems,
    issueDate,
    dueDate,
    analyticsStartDate,
    analyticsEndDate,
    analyticsSnapshots,
    engagementSnapshots,
    socialStats,
    notes,
  }
}

function normalizeStoredInvoiceRecord(id, record = {}) {
  return {
    id: String(id ?? '').trim(),
    invoiceNumber: String(record.invoiceNumber ?? '').trim(),
    clientId: String(record.clientId ?? '').trim(),
    propertySlugs: Array.isArray(record.propertySlugs) ? record.propertySlugs.map((slug) => String(slug ?? '').trim()) : [],
    lineItems: Array.isArray(record.lineItems)
      ? record.lineItems.map((item) => ({ description: String(item?.description ?? ''), amount: String(item?.amount ?? '') }))
      : [],
    amountTotal: String(record.amountTotal ?? '').trim(),
    issueDate: String(record.issueDate ?? '').trim(),
    dueDate: String(record.dueDate ?? '').trim(),
    analyticsStartDate: String(record.analyticsStartDate ?? '').trim(),
    analyticsEndDate: String(record.analyticsEndDate ?? '').trim(),
    analyticsSnapshots: normalizeAnalyticsSnapshots(record.analyticsSnapshots ?? record.analyticsSnapshot),
    engagementSnapshots: normalizeEngagementSnapshots(record.engagementSnapshots ?? record.engagementSnapshot),
    socialStats: normalizeSocialStats(record.socialStats ?? record.marketingStats),
    status: INVOICE_STATUSES.has(record.status) ? record.status : 'draft',
    notes: String(record.notes ?? '').trim(),
    createdAt: normalizeTimestampValue(record.createdAt),
    updatedAt: normalizeTimestampValue(record.updatedAt),
    createdBy: String(record.createdBy ?? '').trim(),
  }
}

// A one-time fallback for the first invoice created for a given year after this counter
// collection was introduced: seeds the counter from any pre-existing invoice numbers so it
// can't collide with invoices created before the counter existed. Reading through the
// transaction keeps this consistent with the counter document read/write below.
async function findMaxExistingSequenceForYear(transaction, year) {
  const snapshot = await transaction.get(getDb().collection(INVOICE_COLLECTION))

  return snapshot.docs.reduce((max, document) => {
    const match = INVOICE_NUMBER_PATTERN.exec(String(document.data()?.invoiceNumber ?? ''))

    if (!match || Number(match[1]) !== year) {
      return max
    }

    return Math.max(max, Number(match[2]))
  }, 0)
}

// Reserves the next invoice number for `year` atomically within the caller's transaction:
// concurrent invoice creations contend on the same counter document, so Firestore retries
// the loser instead of both computing the same "next" number.
async function reserveNextInvoiceNumber(transaction, counterRef, year) {
  const counterSnapshot = await transaction.get(counterRef)
  const nextSequence = counterSnapshot.exists
    ? Number(counterSnapshot.data()?.sequence ?? 0) + 1
    : (await findMaxExistingSequenceForYear(transaction, year)) + 1

  transaction.set(counterRef, { sequence: nextSequence, updatedAt: getServerTimestamp() })

  return `${INVOICE_NUMBER_PREFIX}-${year}-${String(nextSequence).padStart(3, '0')}`
}

async function listInvoicesForClient(clientId) {
  const normalizedClientId = String(clientId ?? '').trim()

  if (!normalizedClientId) {
    throw new HttpError(400, 'A client id is required.')
  }

  try {
    const snapshot = await getDb().collection(INVOICE_COLLECTION).where('clientId', '==', normalizedClientId).get()
    return snapshot.docs
      .map((document) => normalizeStoredInvoiceRecord(document.id, document.data()))
      .sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : 0))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The invoices service is temporarily unavailable.')
    }

    throw error
  }
}

async function getInvoice(id) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'An invoice id is required.')
  }

  const snapshot = await getDb().collection(INVOICE_COLLECTION).doc(normalizedId).get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That invoice could not be found.')
  }

  return normalizeStoredInvoiceRecord(snapshot.id, snapshot.data())
}

async function createInvoice(payload, adminUser) {
  const invoice = normalizeInvoiceDraft(payload)
  const year = Number(invoice.issueDate.slice(0, 4))
  const amountTotal = computeAmountTotal(invoice.lineItems)

  const db = getDb()
  const docRef = db.collection(INVOICE_COLLECTION).doc()
  const counterRef = db.collection(INVOICE_COUNTER_COLLECTION).doc(String(year))

  await db.runTransaction(async (transaction) => {
    const invoiceNumber = await reserveNextInvoiceNumber(transaction, counterRef, year)

    transaction.set(docRef, {
      invoiceNumber,
      clientId: invoice.clientId,
      propertySlugs: invoice.propertySlugs,
      lineItems: invoice.lineItems,
      amountTotal,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      analyticsStartDate: invoice.analyticsStartDate,
      analyticsEndDate: invoice.analyticsEndDate,
      analyticsSnapshots: invoice.analyticsSnapshots,
      engagementSnapshots: invoice.engagementSnapshots,
      socialStats: invoice.socialStats,
      status: 'draft',
      notes: invoice.notes,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
      createdBy: adminUser.email || adminUser.uid,
    })
  })

  const savedSnapshot = await docRef.get()
  return normalizeStoredInvoiceRecord(savedSnapshot.id, savedSnapshot.data())
}

async function updateInvoiceStatus(id, status) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'An invoice id is required.')
  }

  const normalizedStatus = String(status ?? '').trim()

  if (!INVOICE_STATUSES.has(normalizedStatus)) {
    throw new HttpError(400, `Status must be one of: ${Array.from(INVOICE_STATUSES).join(', ')}.`)
  }

  const docRef = getDb().collection(INVOICE_COLLECTION).doc(normalizedId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That invoice could not be found.')
  }

  await docRef.update({ status: normalizedStatus, updatedAt: getServerTimestamp() })

  const savedSnapshot = await docRef.get()
  return normalizeStoredInvoiceRecord(savedSnapshot.id, savedSnapshot.data())
}

async function deleteInvoice(id) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'An invoice id is required.')
  }

  const docRef = getDb().collection(INVOICE_COLLECTION).doc(normalizedId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That invoice could not be found.')
  }

  await docRef.delete()
}

exports.listInvoicesForClient = listInvoicesForClient
exports.getInvoice = getInvoice
exports.createInvoice = createInvoice
exports.updateInvoiceStatus = updateInvoiceStatus
exports.deleteInvoice = deleteInvoice
exports.INVOICE_COLLECTION = INVOICE_COLLECTION
exports._test = {
  normalizeAnalyticsSnapshot,
  normalizeInvoiceDraft,
  normalizeStoredInvoiceRecord,
}
