const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')

const EDIT_LOCK_COLLECTION = 'cmsEditLocks'

function normalizeResourceType(resourceType) {
  const type = String(resourceType ?? '').trim()

  if (!type) {
    throw new HttpError(400, 'resourceType is required.')
  }

  return type
}

function normalizeResourceId(resourceId) {
  const id = String(resourceId ?? '').trim()

  if (!id) {
    throw new HttpError(400, 'resourceId is required.')
  }

  return id
}

function normalizeLeaseId(leaseId) {
  const id = String(leaseId ?? '').trim()

  if (!id) {
    throw new HttpError(400, 'leaseId is required.')
  }

  return id
}

function buildLockDocId(resourceType, resourceId) {
  return `${resourceType}:${encodeURIComponent(resourceId)}`
}

function serializeLock(lockData) {
  if (!lockData) {
    return null
  }

  return {
    resourceType: lockData.resourceType,
    resourceId: lockData.resourceId,
    lockedBy: lockData.lockedBy || '',
    lockedByEmail: lockData.lockedByEmail || '',
    lockedAt: lockData.lockedAt?.toMillis?.() ?? null,
    lastHeartbeat: lockData.lastHeartbeat?.toMillis?.() ?? null,
  }
}

function createLockUnavailableError() {
  return new HttpError(
    503,
    'Cloud Firestore is not set up for this Firebase project yet. Create the default Firestore database before using edit locks.',
  )
}

exports.acquireLock = async function acquireLock(resourceType, resourceId, adminUser, leaseId) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const normalizedLeaseId = normalizeLeaseId(leaseId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))

  try {
    return await getDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      const existing = snapshot.exists ? snapshot.data() : null
      const heldByRequesterSession = existing?.lockedBy === adminUser.uid && existing?.leaseId === normalizedLeaseId

      if (existing && !heldByRequesterSession) {
        const ownerLabel =
          existing.lockedBy === adminUser.uid
            ? 'another tab under your account'
            : existing.lockedByEmail || 'another admin'

        throw new HttpError(409, `This ${type} is currently being edited by ${ownerLabel}.`, {
          lock: serializeLock(existing),
        })
      }

      const now = getServerTimestamp()
      const nextLock = {
        resourceType: type,
        resourceId: id,
        lockedBy: adminUser.uid,
        lockedByEmail: adminUser.email || '',
        leaseId: normalizedLeaseId,
        lockedAt: heldByRequesterSession ? existing.lockedAt || now : now,
        lastHeartbeat: now,
      }

      transaction.set(docRef, nextLock)

      return {
        locked: true,
        lock: {
          resourceType: type,
          resourceId: id,
          lockedBy: nextLock.lockedBy,
          lockedByEmail: nextLock.lockedByEmail,
          lockedAt: heldByRequesterSession ? serializeLock(existing)?.lockedAt ?? Date.now() : Date.now(),
          lastHeartbeat: Date.now(),
        },
      }
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createLockUnavailableError()
    }

    throw error
  }
}

exports.takeOverLock = async function takeOverLock(resourceType, resourceId, adminUser, leaseId) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const normalizedLeaseId = normalizeLeaseId(leaseId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))

  try {
    return await getDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      const existing = snapshot.exists ? snapshot.data() : null
      const heldByRequesterSession = existing?.lockedBy === adminUser.uid && existing?.leaseId === normalizedLeaseId
      const now = getServerTimestamp()
      const nextLock = {
        resourceType: type,
        resourceId: id,
        lockedBy: adminUser.uid,
        lockedByEmail: adminUser.email || '',
        leaseId: normalizedLeaseId,
        lockedAt: heldByRequesterSession ? existing.lockedAt || now : now,
        lastHeartbeat: now,
        takenOverAt: heldByRequesterSession ? existing.takenOverAt || null : now,
        takenOverFrom: heldByRequesterSession ? existing.takenOverFrom || null : serializeLock(existing),
      }

      transaction.set(docRef, nextLock)

      return {
        locked: true,
        previousLock: heldByRequesterSession ? null : serializeLock(existing),
        lock: {
          resourceType: type,
          resourceId: id,
          lockedBy: nextLock.lockedBy,
          lockedByEmail: nextLock.lockedByEmail,
          lockedAt: heldByRequesterSession ? serializeLock(existing)?.lockedAt ?? Date.now() : Date.now(),
          lastHeartbeat: Date.now(),
        },
      }
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createLockUnavailableError()
    }

    throw error
  }
}

exports.heartbeatLock = async function heartbeatLock(resourceType, resourceId, adminUser, leaseId) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const normalizedLeaseId = normalizeLeaseId(leaseId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))

  try {
    return await getDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      const existing = snapshot.exists ? snapshot.data() : null
      const heldByRequesterSession = existing?.lockedBy === adminUser.uid && existing?.leaseId === normalizedLeaseId

      if (!existing) {
        throw new HttpError(409, 'Your edit lock is no longer active. Take over editing to continue.', { lock: null })
      }

      if (!heldByRequesterSession) {
        throw new HttpError(409, `Editing was taken over by ${existing.lockedByEmail || 'another admin'}.`, {
          lock: serializeLock(existing),
        })
      }

      transaction.update(docRef, { lastHeartbeat: getServerTimestamp() })

      return {
        locked: true,
        lock: {
          resourceType: type,
          resourceId: id,
          lockedBy: existing.lockedBy,
          lockedByEmail: existing.lockedByEmail,
          lockedAt: serializeLock(existing)?.lockedAt ?? null,
          lastHeartbeat: Date.now(),
        },
      }
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    if (isFirestoreUnavailableError(error)) {
      throw createLockUnavailableError()
    }

    throw error
  }
}

exports.releaseLock = async function releaseLock(resourceType, resourceId, adminUser, leaseId) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const normalizedLeaseId = normalizeLeaseId(leaseId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))

  try {
    const snapshot = await docRef.get()

    if (
      snapshot.exists &&
      snapshot.data()?.lockedBy === adminUser.uid &&
      snapshot.data()?.leaseId === normalizedLeaseId
    ) {
      await docRef.delete()
    }

    return { released: true }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return { released: true }
    }

    throw error
  }
}

exports.assertActiveEditLease = async function assertActiveEditLease(
  transaction,
  resourceType,
  resourceId,
  adminUser,
  leaseId,
) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const normalizedLeaseId = normalizeLeaseId(leaseId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))
  const snapshot = await transaction.get(docRef)
  const existing = snapshot.exists ? snapshot.data() : null
  const owned =
    existing &&
    existing.lockedBy === adminUser.uid &&
    existing.leaseId === normalizedLeaseId

  if (!owned) {
    const activeLock = existing || null
    const message = activeLock
      ? `This ${type} is currently being edited by ${activeLock.lockedByEmail || 'another admin'}.`
      : 'Your edit lock is no longer active. Take over editing before making more changes.'

    throw new HttpError(409, message, { lock: serializeLock(activeLock) })
  }

  transaction.update(docRef, { lastHeartbeat: getServerTimestamp() })
  return existing
}

exports.getLockStatus = async function getLockStatus(resourceType, resourceId) {
  const type = normalizeResourceType(resourceType)
  const id = normalizeResourceId(resourceId)
  const docRef = getDb().collection(EDIT_LOCK_COLLECTION).doc(buildLockDocId(type, id))

  try {
    const snapshot = await docRef.get()

    if (!snapshot.exists) {
      return { locked: false, lock: null }
    }

    return { locked: true, lock: serializeLock(snapshot.data()) }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return { locked: false, lock: null }
    }

    throw error
  }
}

exports.listLockStatuses = async function listLockStatuses(resourceType) {
  const type = normalizeResourceType(resourceType)

  try {
    const snapshot = await getDb().collection(EDIT_LOCK_COLLECTION).where('resourceType', '==', type).get()

    return snapshot.docs
      .map((document) => document.data())
      .map((data) => serializeLock(data))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return []
    }

    throw error
  }
}
