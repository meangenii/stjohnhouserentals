const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { preparePropertyPaymentBillingPatch } = require('./propertyRepository')

const PAYMENT_COLLECTION = 'cmsClientPayments'
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

function normalizePaymentDraft(payload) {
  const clientId = normalizeField(payload?.clientId, { label: 'Client', maxLength: 200, required: true })
  const propertySlug = normalizeField(payload?.propertySlug, { label: 'Property', maxLength: 200 })
  const amount = normalizeField(payload?.amount, { label: 'Amount', maxLength: 40, required: true })
  const paidAt = normalizeDateOnlyValue(payload?.paidAt, { label: 'Payment date', required: true })
  const method = normalizeField(payload?.method, { label: 'Method', maxLength: 80 })
  const note = normalizeField(payload?.note, { label: 'Note', maxLength: 1000 })
  const listingFeeInterval = normalizeField(payload?.listingFeeInterval, { label: 'Billing interval', maxLength: 20 })

  return { clientId, propertySlug, amount, paidAt, method, note, listingFeeInterval }
}

function normalizeStoredPaymentRecord(id, record = {}) {
  return {
    id: String(id ?? '').trim(),
    clientId: String(record.clientId ?? '').trim(),
    propertySlug: String(record.propertySlug ?? '').trim(),
    propertyName: String(record.propertyName ?? '').trim(),
    amount: String(record.amount ?? '').trim(),
    paidAt: String(record.paidAt ?? '').trim(),
    method: String(record.method ?? '').trim(),
    note: String(record.note ?? '').trim(),
    createdAt: normalizeTimestampValue(record.createdAt),
    createdBy: String(record.createdBy ?? '').trim(),
  }
}

async function listPaymentsForClient(clientId) {
  const normalizedClientId = String(clientId ?? '').trim()

  if (!normalizedClientId) {
    throw new HttpError(400, 'A client id is required.')
  }

  try {
    const snapshot = await getDb().collection(PAYMENT_COLLECTION).where('clientId', '==', normalizedClientId).get()
    return snapshot.docs
      .map((document) => normalizeStoredPaymentRecord(document.id, document.data()))
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The payments service is temporarily unavailable.')
    }

    throw error
  }
}

async function recordPayment(payload, adminUser) {
  const payment = normalizePaymentDraft(payload)
  const propertyName = normalizeField(payload?.propertyName, { label: 'Property name', maxLength: 200 })

  const db = getDb()
  const docRef = db.collection(PAYMENT_COLLECTION).doc()

  // Both writes happen in one transaction: if the property lookup fails (e.g. a stale or
  // mistyped propertySlug), the whole transaction is rejected before either document is
  // written, instead of leaving an orphaned payment record with no billing update applied.
  await db.runTransaction(async (transaction) => {
    const propertyPatch = payment.propertySlug
      ? await preparePropertyPaymentBillingPatch(
          transaction,
          payment.propertySlug,
          { paidAt: payment.paidAt, listingFeeInterval: payment.listingFeeInterval },
          adminUser,
        )
      : null

    transaction.set(docRef, {
      clientId: payment.clientId,
      propertySlug: payment.propertySlug,
      propertyName,
      amount: payment.amount,
      paidAt: payment.paidAt,
      method: payment.method,
      note: payment.note,
      createdAt: getServerTimestamp(),
      createdBy: adminUser.email || adminUser.uid,
    })

    if (propertyPatch) {
      transaction.set(propertyPatch.docRef, propertyPatch.patchedRecord)
    }
  })

  const savedSnapshot = await docRef.get()
  return normalizeStoredPaymentRecord(savedSnapshot.id, savedSnapshot.data())
}

async function deletePayment(id) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'A payment id is required.')
  }

  const docRef = getDb().collection(PAYMENT_COLLECTION).doc(normalizedId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That payment could not be found.')
  }

  await docRef.delete()
}

exports.listPaymentsForClient = listPaymentsForClient
exports.recordPayment = recordPayment
exports.deletePayment = deletePayment
exports.PAYMENT_COLLECTION = PAYMENT_COLLECTION
