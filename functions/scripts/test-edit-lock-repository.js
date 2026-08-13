const assert = require('node:assert/strict')

function makeTimestamp(millis = Date.now()) {
  return {
    toMillis() {
      return millis
    },
  }
}

class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message)
    this.status = status
    this.details = details
  }
}

function createSnapshot(data) {
  return {
    exists: Boolean(data),
    data() {
      return data ? { ...data } : null
    },
  }
}

function createFakeDb() {
  const documents = new Map()

  function getDocumentKey(docRef) {
    return docRef.__key
  }

  function makeDocRef(collectionName, documentId) {
    const docRef = {
      __key: `${collectionName}/${documentId}`,
      async delete() {
        documents.delete(getDocumentKey(docRef))
      },
      async get() {
        return createSnapshot(documents.get(getDocumentKey(docRef)))
      },
    }

    return docRef
  }

  return {
    collection(collectionName) {
      return {
        doc(documentId) {
          return makeDocRef(collectionName, documentId)
        },
      }
    },
    getDocumentData(key) {
      return documents.get(key)
    },
    async runTransaction(callback) {
      return callback({
        async get(docRef) {
          return createSnapshot(documents.get(getDocumentKey(docRef)))
        },
        set(docRef, data) {
          documents.set(getDocumentKey(docRef), { ...data })
        },
        update(docRef, patch) {
          documents.set(getDocumentKey(docRef), {
            ...(documents.get(getDocumentKey(docRef)) ?? {}),
            ...patch,
          })
        },
      })
    },
  }
}

const fakeDb = createFakeDb()
const firebaseAdminPath = require.resolve('../src/firebaseAdmin')

require.cache[firebaseAdminPath] = {
  exports: {
    HttpError,
    getDb() {
      return fakeDb
    },
    getServerTimestamp() {
      return makeTimestamp()
    },
    isFirestoreUnavailableError() {
      return false
    },
  },
  filename: firebaseAdminPath,
  id: firebaseAdminPath,
  loaded: true,
}

delete require.cache[require.resolve('../src/editLockRepository')]

const { acquireLock, heartbeatLock, releaseLock, takeOverLock } = require('../src/editLockRepository')

const adminUser = { email: 'johnnyluce@gmail.com', uid: 'same-user' }
const otherAdmin = { email: 'other@example.com', uid: 'other-user' }
const lockDocumentKey = 'cmsEditLocks/structuredPage:test'

async function assertRejectsWithStatus(promise, status, message) {
  await assert.rejects(
    promise,
    (error) => {
      assert.equal(error.status, status, message)
      return true
    },
  )
}

async function main() {
  await acquireLock('structuredPage', 'test', adminUser, 'lease-before-refresh')
  assert.equal(fakeDb.getDocumentData(lockDocumentKey).leaseId, 'lease-before-refresh')

  await acquireLock('structuredPage', 'test', adminUser, 'lease-before-refresh')
  assert.equal(
    fakeDb.getDocumentData(lockDocumentKey).leaseId,
    'lease-before-refresh',
    'A refresh by the same tab lease should keep the current lease active.',
  )

  await assertRejectsWithStatus(
    acquireLock('structuredPage', 'test', adminUser, 'lease-after-refresh'),
    409,
    'A second tab under the same admin account must be blocked by the active lease.',
  )
  assert.equal(fakeDb.getDocumentData(lockDocumentKey).leaseId, 'lease-before-refresh')

  await heartbeatLock('structuredPage', 'test', adminUser, 'lease-before-refresh')

  await assertRejectsWithStatus(
    acquireLock('structuredPage', 'test', otherAdmin, 'other-user-lease'),
    409,
    'A different admin must still be blocked by the active lock.',
  )

  await releaseLock('structuredPage', 'test', adminUser, 'lease-before-refresh')
  assert.equal(fakeDb.getDocumentData(lockDocumentKey), undefined)

  await acquireLock('structuredPage', 'test', adminUser, 'expired-lease')
  fakeDb.getDocumentData(lockDocumentKey).lastHeartbeat = makeTimestamp(Date.now() - 130000)

  await assertRejectsWithStatus(
    acquireLock('structuredPage', 'test', adminUser, 'new-lease-after-expiry'),
    409,
    'A stale lock must not be replaced automatically; the next editor must take over explicitly.',
  )
  assert.equal(fakeDb.getDocumentData(lockDocumentKey).leaseId, 'expired-lease')

  const takeover = await takeOverLock('structuredPage', 'test', adminUser, 'new-lease-after-expiry')
  assert.equal(takeover.previousLock.leaseId, undefined, 'Serialized lock details must not expose lease ids.')
  assert.equal(
    fakeDb.getDocumentData(lockDocumentKey).leaseId,
    'new-lease-after-expiry',
    'Taking over should replace the previous edit lease.',
  )

  fakeDb.getDocumentData(lockDocumentKey).lastHeartbeat = makeTimestamp(Date.now() - 130000)
  await heartbeatLock('structuredPage', 'test', adminUser, 'new-lease-after-expiry')
  assert.equal(
    fakeDb.getDocumentData(lockDocumentKey).leaseId,
    'new-lease-after-expiry',
    'A delayed heartbeat from the same browser lease should recover its own expired lock.',
  )

  console.log('Edit lock repository tests passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
