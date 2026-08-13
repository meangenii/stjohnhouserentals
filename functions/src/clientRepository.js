const {
  HttpError,
  assertExpectedUpdatedAtMatches,
  getDb,
  getServerTimestamp,
  isFirestoreUnavailableError,
} = require('./firebaseAdmin')
const { listAllProperties, setPropertyClientId } = require('./propertyRepository')

const CLIENT_COLLECTION = 'cmsClients'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'aol.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'earthlink.net',
  'msn.com',
  'me.com',
  'comcast.net',
])

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

function normalizeDateOnlyValue(value) {
  const normalized = String(value ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function normalizeClientDraft(payload) {
  const businessName = normalizeField(payload?.businessName, { label: 'Business name', maxLength: 160 })
  const contactName = normalizeField(payload?.contactName, { label: 'Contact name', maxLength: 160, required: true })
  const email = normalizeField(payload?.email, { label: 'Email', maxLength: 160 }).toLowerCase()
  const phone = normalizeField(payload?.phone, { label: 'Phone', maxLength: 40 })
  const subscriptionStartAt = normalizeDateOnlyValue(payload?.subscriptionStartAt)
  const subscriptionEndAt = normalizeDateOnlyValue(payload?.subscriptionEndAt)
  const address = normalizeField(payload?.address, { label: 'Address', maxLength: 300 })
  const notes = normalizeField(payload?.notes, { label: 'Notes', maxLength: 4000 })

  if (email && !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.')
  }

  return { businessName, contactName, email, phone, subscriptionStartAt, subscriptionEndAt, address, notes }
}

function normalizeStoredClientRecord(id, record = {}) {
  return {
    id: String(id ?? '').trim(),
    businessName: String(record.businessName ?? '').trim(),
    contactName: String(record.contactName ?? '').trim(),
    email: String(record.email ?? '').trim().toLowerCase(),
    phone: String(record.phone ?? '').trim(),
    subscriptionStartAt: normalizeDateOnlyValue(record.subscriptionStartAt),
    subscriptionEndAt: normalizeDateOnlyValue(record.subscriptionEndAt),
    address: String(record.address ?? '').trim(),
    notes: String(record.notes ?? '').trim(),
    archivedAt: normalizeTimestampValue(record.archivedAt),
    archivedBy: String(record.archivedBy ?? '').trim(),
    createdAt: normalizeTimestampValue(record.createdAt),
    updatedAt: normalizeTimestampValue(record.updatedAt),
    updatedBy: String(record.updatedBy ?? '').trim(),
  }
}

function titleCaseFromSlug(value) {
  return String(value ?? '')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function deriveClientNamesFromEmail(email) {
  const [localPart, domain] = String(email ?? '').split('@')
  const domainRoot = String(domain ?? '').split('.')[0] ?? ''
  const isFreeProvider = FREE_EMAIL_DOMAINS.has(String(domain ?? '').toLowerCase())

  const businessName = !isFreeProvider ? titleCaseFromSlug(domainRoot) : ''
  const contactName = titleCaseFromSlug(localPart) || businessName || email

  return { businessName, contactName }
}

function createClientConflictError(currentRecord, id) {
  return new HttpError(409, 'This client was changed by someone else since you loaded it. Reload to see the latest changes.', {
    current: normalizeStoredClientRecord(id, currentRecord),
  })
}

async function listClients() {
  try {
    const snapshot = await getDb().collection(CLIENT_COLLECTION).orderBy('contactName').get()
    return snapshot.docs
      .map((document) => normalizeStoredClientRecord(document.id, document.data()))
      .filter((client) => !client.archivedAt)
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The client service is temporarily unavailable.')
    }

    throw error
  }
}

async function getClient(id) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'A client id is required.')
  }

  const snapshot = await getDb().collection(CLIENT_COLLECTION).doc(normalizedId).get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That client could not be found.')
  }

  return normalizeStoredClientRecord(snapshot.id, snapshot.data())
}

async function saveClient(draft, id, adminUser, expectedUpdatedAt = null) {
  const normalizedId = String(id ?? '').trim()
  const client = normalizeClientDraft(draft)
  const db = getDb()
  const collectionRef = db.collection(CLIENT_COLLECTION)

  const savedId = await db.runTransaction(async (transaction) => {
    const docRef = normalizedId ? collectionRef.doc(normalizedId) : collectionRef.doc()
    const existingSnapshot = normalizedId ? await transaction.get(docRef) : null

    if (normalizedId && !existingSnapshot.exists) {
      throw new HttpError(404, 'That client could not be found.')
    }

    if (existingSnapshot?.exists) {
      assertExpectedUpdatedAtMatches(existingSnapshot.data().updatedAt, expectedUpdatedAt, () =>
        createClientConflictError(existingSnapshot.data(), existingSnapshot.id),
      )
    }

    transaction.set(
      docRef,
      {
        ...client,
        createdAt: existingSnapshot?.exists ? existingSnapshot.data().createdAt : getServerTimestamp(),
        updatedAt: getServerTimestamp(),
        updatedBy: adminUser.email || adminUser.uid,
      },
      { merge: false },
    )

    return docRef.id
  })

  return getClient(savedId)
}

async function archiveClient(id, adminUser) {
  const normalizedId = String(id ?? '').trim()

  if (!normalizedId) {
    throw new HttpError(400, 'A client id is required.')
  }

  const docRef = getDb().collection(CLIENT_COLLECTION).doc(normalizedId)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new HttpError(404, 'That client could not be found.')
  }

  await docRef.set(
    {
      archivedAt: getServerTimestamp(),
      archivedBy: adminUser.email || adminUser.uid,
      updatedAt: getServerTimestamp(),
      updatedBy: adminUser.email || adminUser.uid,
    },
    { merge: true },
  )
}

async function importClientsFromProperties(adminUser) {
  const [properties, existingClients] = await Promise.all([listAllProperties(), listClients()])
  const clientByEmail = new Map(existingClients.filter((client) => client.email).map((client) => [client.email, client]))

  const groups = new Map()
  const propertiesSkipped = []

  for (const property of properties) {
    const originalSlug = String(property?.adminOriginalSlug || property?.slug || '').trim()

    if (!originalSlug) {
      continue
    }

    if (String(property?.clientId ?? '').trim()) {
      continue
    }

    const email = String(property?.booking?.email ?? '').trim().toLowerCase()

    if (!email || !EMAIL_PATTERN.test(email)) {
      propertiesSkipped.push({ slug: originalSlug, name: property?.name ?? originalSlug, reason: 'No contact email found on this property.' })
      continue
    }

    if (!groups.has(email)) {
      groups.set(email, { phone: '', properties: [] })
    }

    const group = groups.get(email)
    group.properties.push({ slug: originalSlug, name: property?.name ?? originalSlug })

    if (!group.phone) {
      const phone = String(property?.booking?.phone ?? '').trim()

      if (phone) {
        group.phone = phone
      }
    }
  }

  let clientsCreated = 0
  let clientsReused = 0
  let propertiesLinked = 0

  for (const [email, group] of groups) {
    let client = clientByEmail.get(email)

    if (client) {
      clientsReused += 1
    } else {
      const { businessName, contactName } = deriveClientNamesFromEmail(email)
      const propertyNames = group.properties.map((property) => property.name).join(', ')
      const importDate = new Date().toISOString().slice(0, 10)

      client = await saveClient(
        {
          businessName,
          contactName,
          email,
          phone: group.phone,
          notes: `Auto-imported from ${group.properties.length} propert${group.properties.length === 1 ? 'y' : 'ies'} on ${importDate}: ${propertyNames}. Verify contact details.`,
        },
        '',
        adminUser,
      )
      clientByEmail.set(email, client)
      clientsCreated += 1
    }

    for (const property of group.properties) {
      await setPropertyClientId(property.slug, client.id, adminUser)
      propertiesLinked += 1
    }
  }

  return {
    clientsCreated,
    clientsReused,
    propertiesLinked,
    propertiesSkipped,
  }
}

exports.listClients = listClients
exports.getClient = getClient
exports.saveClient = saveClient
exports.archiveClient = archiveClient
exports.importClientsFromProperties = importClientsFromProperties
exports.CLIENT_COLLECTION = CLIENT_COLLECTION
