const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')

const INVOICE_COLLECTION = 'cmsClientInvoices'
const INVOICE_COUNTER_COLLECTION = 'cmsClientInvoiceCounters'
const INVOICE_STATUSES = new Set(['draft', 'sent', 'paid', 'overdue', 'void'])
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const INVOICE_NUMBER_PATTERN = /^GENCMS-(\d{4})-(\d{3,})$/

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
    ? payload.propertySlugs.map((slug) => String(slug ?? '').trim()).filter(Boolean)
    : []
  const lineItems = normalizeLineItems(payload?.lineItems)
  const issueDate = normalizeDateOnlyValue(payload?.issueDate, { label: 'Issue date', required: true })
  const dueDate = normalizeDateOnlyValue(payload?.dueDate, { label: 'Due date' })
  const notes = normalizeField(payload?.notes, { label: 'Notes', maxLength: 2000 })

  return { clientId, propertySlugs, lineItems, issueDate, dueDate, notes }
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

  return `GENCMS-${year}-${String(nextSequence).padStart(3, '0')}`
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

exports.listInvoicesForClient = listInvoicesForClient
exports.createInvoice = createInvoice
exports.updateInvoiceStatus = updateInvoiceStatus
exports.INVOICE_COLLECTION = INVOICE_COLLECTION
