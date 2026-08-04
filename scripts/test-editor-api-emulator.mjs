import assert from 'node:assert/strict'

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-genericcms-editor'
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001'
const PAGE_KEY = 'editor-api-e2e-page'
const PAGE_PATH = '/editor-api-e2e-page'
const ADMIN_PAGE_PATH = `admin/content/pages/${PAGE_KEY}`
const EDIT_LEASE_ID = 'editor-api-e2e-primary-lease'
const API_BASE_URL = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/us-central1/siteApi`

assert.match(PROJECT_ID, /^demo-/, 'The editor API integration test must use a Firebase demo project.')
assert.ok(process.env.FIREBASE_EMULATOR_HUB, 'The Firebase emulator hub must start this integration test.')
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'The Auth emulator must be active for this integration test.')
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'The Firestore emulator must be active for this integration test.')

function createDraft(title, lead) {
  return {
    blocks: [
      {
        action: { backgroundColor: '#2269ff', label: 'Contact us', path: '/contact-us' },
        id: 'editor-api-e2e-hero',
        image: { kind: 'image' },
        lead,
        title,
        type: 'hero',
        version: 1,
      },
    ],
    contentModel: 'block-page',
    group: 'custom',
    key: PAGE_KEY,
    metaDescription: 'Local-only editor API integration fixture.',
    navLabel: 'Editor API Fixture',
    path: PAGE_PATH,
    routeAliases: [],
    source: 'structured',
    title,
  }
}

async function readJson(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text}`)
  }
}

async function requestApi(path, { body, method = 'GET', token = '' } = {}) {
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method,
  })

  return { response, payload: await readJson(response) }
}

async function createEmulatorUser() {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=editor-api-e2e-key`,
    {
      body: JSON.stringify({
        email: 'editor-api-e2e@example.test',
        password: 'Local-only-password-123!',
        returnSecureToken: true,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200, `Auth emulator user creation failed: ${JSON.stringify(payload)}`)
  assert.ok(payload.idToken, 'Auth emulator did not issue an ID token.')
  return payload.idToken
}

function assertSavedAt(publication, message) {
  assert.equal(typeof publication?.savedAt, 'number', message)
  assert.ok(Number.isFinite(publication.savedAt), message)
  return publication.savedAt
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const draftV1 = createDraft('API draft version one', 'Saved but not published.')
const unauthorized = await requestApi(ADMIN_PAGE_PATH, {
  body: { draft: draftV1 },
  method: 'POST',
})
assert.equal(unauthorized.response.status, 401)
assert.equal(unauthorized.payload.error, 'request-failed')

const idToken = await createEmulatorUser()
const firstSave = await requestApi(ADMIN_PAGE_PATH, {
  body: { draft: draftV1 },
  method: 'POST',
  token: idToken,
})
assert.equal(firstSave.response.status, 200, JSON.stringify(firstSave.payload))
assert.equal(firstSave.payload.page.title, 'API draft version one')
assert.equal(firstSave.payload.publishedPage, null)
assert.equal(firstSave.payload.publication.hasUnpublishedChanges, true)
const firstSavedAt = assertSavedAt(firstSave.payload.publication, 'First save must return a numeric concurrency token.')

const acquireLease = await requestApi('admin/edit-locks/acquire', {
  body: { leaseId: EDIT_LEASE_ID, resourceId: PAGE_KEY, resourceType: 'structuredPage' },
  method: 'POST',
  token: idToken,
})
assert.equal(acquireLease.response.status, 200, JSON.stringify(acquireLease.payload))

const secondTabLease = await requestApi('admin/edit-locks/acquire', {
  body: { leaseId: 'editor-api-e2e-second-tab', resourceId: PAGE_KEY, resourceType: 'structuredPage' },
  method: 'POST',
  token: idToken,
})
assert.equal(secondTabLease.response.status, 409, 'A second editor session must not share the first tab lease.')

const publicBeforePublish = await requestApi(`content/pages/${PAGE_KEY}`)
assert.equal(publicBeforePublish.response.status, 404, 'Saving a draft must not make it public.')

await delay(20)
const draftV2 = createDraft('API draft version two', 'Ready for explicit publication.')
const secondSave = await requestApi(ADMIN_PAGE_PATH, {
  body: { draft: draftV2, editLeaseId: EDIT_LEASE_ID, expectedUpdatedAt: firstSavedAt },
  method: 'POST',
  token: idToken,
})
assert.equal(secondSave.response.status, 200, JSON.stringify(secondSave.payload))
assert.equal(secondSave.payload.page.title, 'API draft version two')
const secondSavedAt = assertSavedAt(secondSave.payload.publication, 'Second save must return a numeric concurrency token.')
assert.notEqual(secondSavedAt, firstSavedAt, 'Successive saves must advance the concurrency token.')

const staleSave = await requestApi(ADMIN_PAGE_PATH, {
  body: {
    draft: createDraft('Stale overwrite', 'This update must be rejected.'),
    editLeaseId: EDIT_LEASE_ID,
    expectedUpdatedAt: firstSavedAt,
  },
  method: 'POST',
  token: idToken,
})
assert.equal(staleSave.response.status, 409)
assert.equal(staleSave.payload.latest.page.title, 'API draft version two')
assert.equal(staleSave.payload.latest.publication.savedAt, secondSavedAt)

const stalePublish = await requestApi(`${ADMIN_PAGE_PATH}/publish`, {
  body: { editLeaseId: EDIT_LEASE_ID, expectedUpdatedAt: firstSavedAt },
  method: 'POST',
  token: idToken,
})
assert.equal(stalePublish.response.status, 409)
assert.equal(stalePublish.payload.latest.page.title, 'API draft version two')

await delay(20)
const publish = await requestApi(`${ADMIN_PAGE_PATH}/publish`, {
  body: { editLeaseId: EDIT_LEASE_ID, expectedUpdatedAt: secondSavedAt },
  method: 'POST',
  token: idToken,
})
assert.equal(publish.response.status, 200, JSON.stringify(publish.payload))
assert.equal(publish.payload.page.title, 'API draft version two')
assert.equal(publish.payload.publishedPage.title, 'API draft version two')
assert.equal(publish.payload.publication.hasUnpublishedChanges, false)
const publishedSavedAt = assertSavedAt(publish.payload.publication, 'Publish must advance the concurrency token.')
assert.notEqual(publishedSavedAt, secondSavedAt)

const publicAfterPublish = await requestApi(`content/pages/${PAGE_KEY}`)
assert.equal(publicAfterPublish.response.status, 200, JSON.stringify(publicAfterPublish.payload))
assert.equal(publicAfterPublish.payload.title, 'API draft version two')
assert.equal(publicAfterPublish.payload.blocks[0].lead, 'Ready for explicit publication.')

await delay(20)
const draftV3 = createDraft('API draft version three', 'This remains private until another publish.')
const thirdSave = await requestApi(ADMIN_PAGE_PATH, {
  body: { draft: draftV3, editLeaseId: EDIT_LEASE_ID, expectedUpdatedAt: publishedSavedAt },
  method: 'POST',
  token: idToken,
})
assert.equal(thirdSave.response.status, 200, JSON.stringify(thirdSave.payload))
assert.equal(thirdSave.payload.page.title, 'API draft version three')
assert.equal(thirdSave.payload.publishedPage.title, 'API draft version two')
assert.equal(thirdSave.payload.publication.hasUnpublishedChanges, true)
const thirdSavedAt = assertSavedAt(thirdSave.payload.publication, 'Third save must return a numeric concurrency token.')

const publicAfterThirdSave = await requestApi(`content/pages/${PAGE_KEY}`)
assert.equal(publicAfterThirdSave.response.status, 200)
assert.equal(publicAfterThirdSave.payload.title, 'API draft version two', 'A later draft save must not change public content.')

const adminReload = await requestApi(ADMIN_PAGE_PATH, { token: idToken })
assert.equal(adminReload.response.status, 200)
assert.equal(adminReload.payload.page.title, 'API draft version three')
assert.equal(adminReload.payload.publishedPage.title, 'API draft version two')

const revisions = await requestApi(`${ADMIN_PAGE_PATH}/revisions`, { token: idToken })
assert.equal(revisions.response.status, 200, JSON.stringify(revisions.payload))
assert.deepEqual(
  revisions.payload.revisions.map((revision) => revision.action).sort(),
  ['publish', 'save', 'save', 'save'],
)
assert.ok(revisions.payload.revisions.every((revision) => revision.actor === 'editor-api-e2e@example.test'))

const revisionDetail = await requestApi(`${ADMIN_PAGE_PATH}/revisions/${revisions.payload.revisions[0].id}`, { token: idToken })
assert.equal(revisionDetail.response.status, 200, JSON.stringify(revisionDetail.payload))
assert.equal(revisionDetail.payload.revision.page.key, PAGE_KEY)

const deletePage = await requestApi(ADMIN_PAGE_PATH, {
  body: { editLeaseId: EDIT_LEASE_ID, expectedUpdatedAt: thirdSavedAt },
  method: 'DELETE',
  token: idToken,
})
assert.equal(deletePage.response.status, 200, JSON.stringify(deletePage.payload))

const publicAfterDelete = await requestApi(`content/pages/${PAGE_KEY}`)
assert.equal(publicAfterDelete.response.status, 404, 'A deleted page must immediately leave public reads.')

const directoryAfterDelete = await requestApi('admin/content/pages', { token: idToken })
assert.equal(directoryAfterDelete.response.status, 200)
const deletedSummary = directoryAfterDelete.payload.deletedPages.find((page) => page.key === PAGE_KEY)
assert.ok(deletedSummary, 'Deleted custom pages must remain recoverable from the admin directory.')

const restoreDeleted = await requestApi(`${ADMIN_PAGE_PATH}/restore-deleted`, {
  body: { expectedUpdatedAt: deletedSummary.savedAt },
  method: 'POST',
  token: idToken,
})
assert.equal(restoreDeleted.response.status, 200, JSON.stringify(restoreDeleted.payload))
assert.equal(restoreDeleted.payload.page.title, 'API draft version three')
assert.equal(restoreDeleted.payload.publishedPage, null, 'Recovering a deleted page must not publish it automatically.')

const publicAfterRestore = await requestApi(`content/pages/${PAGE_KEY}`)
assert.equal(publicAfterRestore.response.status, 404, 'A recovered page must stay private until explicitly published.')

console.log('Authenticated editor API emulator workflow passed.')
