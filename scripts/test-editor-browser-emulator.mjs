import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-genericcms-editor'
const AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1:5001'
const API_KEY = 'editor-browser-e2e-key'
const EMAIL = 'editor-api-e2e@example.test'
const PASSWORD = 'Local-only-password-123!'
const PAGE_KEY = 'browser-editor-fixture'
const PAGE_TITLE = 'Browser Editor Fixture'
const API_TARGET = `http://${FUNCTIONS_EMULATOR_HOST}/${PROJECT_ID}/us-central1/siteApi`

assert.match(PROJECT_ID, /^demo-/, 'The editor browser integration test must use a Firebase demo project.')
assert.ok(process.env.FIREBASE_EMULATOR_HUB, 'The Firebase emulator hub must start this browser integration test.')
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'The Auth emulator must be active for this browser integration test.')
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'The Firestore emulator must be active for this browser integration test.')

async function readJson(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Expected JSON from ${response.url}, received: ${text}`)
  }
}

async function signInEmulatorUser() {
  const response = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  const payload = await readJson(response)

  assert.equal(response.status, 200, `Auth emulator sign-in failed: ${JSON.stringify(payload)}`)
  return payload
}

async function seedEmulatorContent(idToken) {
  const response = await fetch(`${API_TARGET}/admin/seed-firestore`, {
    body: JSON.stringify({ replace: false }),
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJson(response)

  assert.equal(response.status, 200, `Emulator content seeding failed: ${JSON.stringify(payload)}`)
}

function createPersistedFirebaseUser(authPayload) {
  const now = Date.now()

  return {
    apiKey: API_KEY,
    appName: '[DEFAULT]',
    createdAt: String(now),
    displayName: undefined,
    email: EMAIL,
    emailVerified: false,
    isAnonymous: false,
    lastLoginAt: String(now),
    phoneNumber: undefined,
    photoURL: undefined,
    providerData: [],
    stsTokenManager: {
      accessToken: authPayload.idToken,
      expirationTime: now + Number(authPayload.expiresIn || 3600) * 1000,
      refreshToken: authPayload.refreshToken,
    },
    uid: authPayload.localId,
  }
}

Object.assign(process.env, {
  VITE_ADMIN_EMAILS: EMAIL,
  VITE_API_BASE_URL: '/api',
  VITE_CHARTER_DATA_SOURCE: 'mock',
  VITE_FIREBASE_API_KEY: API_KEY,
  VITE_FIREBASE_APP_ID: '1:123456789:web:editor-browser-e2e',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  VITE_FIREBASE_AUTH_EMULATOR_HOST: AUTH_EMULATOR_HOST,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.firebasestorage.app`,
  VITE_PROPERTY_DATA_SOURCE: 'mock',
  VITE_SITE_CONTENT_SOURCE: 'firebase',
  VITE_USE_FUNCTIONS_EMULATOR: 'true',
})

const authPayload = await signInEmulatorUser()
await seedEmulatorContent(authPayload.idToken)
const persistedUser = createPersistedFirebaseUser(authPayload)
const persistenceKey = `firebase:authUser:${API_KEY}:[DEFAULT]`
const server = await createServer({
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
    proxy: {
      '/api': {
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        target: API_TARGET,
      },
    },
  },
})

let browser

try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'Vite did not expose a browser integration-test server address.')

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { height: 1000, width: 1440 } })
  await context.addInitScript(
    ({ key, user }) => {
      window.localStorage.setItem(key, JSON.stringify(user))
      window.sessionStorage.removeItem('genericcms.admin.editor-location')
    },
    { key: persistenceKey, user: persistedUser },
  )
  const page = await context.newPage()
  const pageErrors = []
  let revisionListRequests = 0
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (/\/admin\/content\/pages\/[^/]+\/revisions\/?$/.test(new URL(request.url()).pathname)) {
      revisionListRequests += 1
    }
  })

  await page.goto(`http://127.0.0.1:${address.port}/admin`)
  await page.getByRole('heading', { name: 'Page Editor', exact: true }).waitFor({ timeout: 20000 })
  assert.equal(await page.getByRole('button', { name: 'Sign in with Google', exact: true }).count(), 0)

  await page.getByRole('button', { name: 'New page', exact: true }).click()
  await page.getByLabel('Page Title', { exact: true }).fill(PAGE_TITLE)
  assert.equal(await page.getByLabel('URL Path', { exact: true }).inputValue(), `/${PAGE_KEY}`)
  await page.getByRole('button', { name: 'Create page', exact: true }).click()
  await page.getByText(`Created "${PAGE_TITLE}". Add blocks below, then save and publish when ready.`, { exact: true }).waitFor()

  await page.getByRole('button', { name: '+ Add block', exact: true }).click()
  await page.getByRole('button', { name: 'Hero Banner', exact: true }).click()
  await page.getByRole('button', { name: 'Open Inspector', exact: true }).click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await inspector.locator('label:has(> span:text-is("Title")) textarea').fill('Authenticated browser editor')
  await page.getByRole('heading', { name: 'Authenticated browser editor', exact: true }).waitFor()

  const saveDraft = page.getByRole('button', { name: 'Save draft', exact: true })
  await saveDraft.waitFor()
  await saveDraft.click()
  await page.getByText(`Saved draft changes to ${PAGE_TITLE}.`, { exact: true }).waitFor()

  const publishDraft = page.getByRole('button', { name: 'Publish saved draft', exact: true })
  await publishDraft.waitFor()
  await publishDraft.click()
  await page.getByText(`Published ${PAGE_TITLE} live.`, { exact: true }).waitFor()
  assert.equal(revisionListRequests, 0, 'Saving and publishing must not fetch revision history until the user opens it.')

  const publicResponse = await page.request.get(`http://127.0.0.1:${address.port}/api/content/pages/${PAGE_KEY}`)
  assert.equal(publicResponse.status(), 200, 'The published browser-authored page must be publicly readable.')
  const publicPage = await publicResponse.json()
  assert.equal(publicPage.blocks[0].title, 'Authenticated browser editor')

  await page.getByRole('button', { name: /Revision history:/ }).click()
  const revisions = page.getByRole('region', { name: 'Page revision history' })
  await revisions.getByText(/saved revisions?$/i).waitFor()
  assert.equal(revisionListRequests, 1, 'Opening revision history should make one contextual revision request.')
  await revisions.getByRole('button', { name: 'Preview', exact: true }).first().click()
  await revisions.getByText('Previewing a saved revision in the Canvas.', { exact: true }).waitFor()
  await revisions.getByRole('button', { name: 'Close preview', exact: true }).click()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete page', exact: true }).click()
  const trash = page.locator('details.admin-page-trash')
  await trash.waitFor()
  await trash.locator('summary').click()
  await trash.getByText(PAGE_TITLE, { exact: true }).waitFor()
  page.once('dialog', (dialog) => dialog.accept())
  await trash.getByRole('button', { name: 'Restore', exact: true }).click()
  await page.getByText(`Restored "${PAGE_TITLE}" as an unpublished draft.`, { exact: true }).waitFor()

  const restoredPublicResponse = await page.request.get(`http://127.0.0.1:${address.port}/api/content/pages/${PAGE_KEY}`)
  assert.equal(restoredPublicResponse.status(), 404, 'A restored deleted page must remain private until another explicit publish.')
  assert.deepEqual(pageErrors, [], `The production editor emitted browser errors: ${pageErrors.join('; ')}`)

  console.log('Authenticated production editor browser workflow passed.')
} finally {
  await browser?.close()
  await server.close()
}
