import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const HARNESS_PATH = '/admin/__editor-test'
const STORAGE_KEY = 'genericcms:editor-interaction-fixture'

async function readBlockCount(page) {
  return Number(await page.getByTestId('fixture-block-count').textContent())
}

async function openContextView(page, name) {
  const launcher = page.getByRole('button', { name: `Open ${name}`, exact: true })

  if ((await launcher.getAttribute('aria-pressed')) !== 'true') {
    await launcher.click()
  }
}

async function readLayerLabels(page) {
  await openContextView(page, 'Layers')
  const labels = await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-item-label').allTextContents()
  await openContextView(page, 'Inspector')
  return labels
}

async function readHiddenLayerCount(page) {
  await openContextView(page, 'Layers')
  const count = await page.getByRole('region', { name: 'Page layers' }).getByText('Hidden', { exact: true }).count()
  await openContextView(page, 'Inspector')
  return count
}

const server = await createServer({
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
  },
})

let browser

try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'Vite did not expose a test server address.')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 900, width: 1440 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`http://127.0.0.1:${address.port}${HARNESS_PATH}`)
  await page.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), STORAGE_KEY)
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()

  await page.getByRole('button', { name: 'New page', exact: true }).click()
  assert.equal(await readBlockCount(page), 0, 'A new page should start with an empty block tree.')

  await page.getByRole('button', { name: '+ Add block', exact: true }).click()
  await page.getByRole('button', { name: 'Hero Banner', exact: true }).click()
  assert.equal(await readBlockCount(page), 1, 'Adding a hero should create one block.')
  await openContextView(page, 'Layout')
  await page.getByRole('region', { name: 'Layout layers' }).getByText(/px x/).first().waitFor()
  await openContextView(page, 'Inspector')

  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  const canvasToolbar = page.locator('.block-toolbar')
  await inspector.locator('label:has(> span:text-is("Title")) textarea').fill('Browser-tested hero')
  await page.getByRole('heading', { name: 'Browser-tested hero', exact: true }).waitFor()

  const heroCta = page.locator('.block-hero-button').first()
  await heroCta.click()
  await page.locator('.admin-inline-format-toolbar').waitFor({ state: 'visible' })
  await page.locator('.admin-inline-link-settings').waitFor({ state: 'visible' })
  assert.equal(
    await heroCta.getAttribute('data-admin-inline-editing'),
    'true',
    'Clicking the hero CTA should keep the inline editor active after mouse release.',
  )
  await page.locator('.admin-inline-format-toolbar').getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('.admin-inline-format-toolbar').waitFor({ state: 'detached' })

  await page.getByRole('button', { name: '+ Insert below', exact: true }).click()
  await page.getByRole('button', { name: 'Rich Text', exact: true }).click()
  assert.equal(await readBlockCount(page), 2, 'Inserting below should preserve the existing hero.')

  await inspector.getByRole('tab', { name: 'Settings', exact: true }).click()
  await inspector.getByLabel('Editor label', { exact: true }).fill('Body text')
  await canvasToolbar.getByRole('button', { name: 'Duplicate', exact: true }).click()
  assert.equal(await readBlockCount(page), 3, 'Duplicating should add a copy to the same container.')

  await inspector.getByRole('tab', { name: 'Settings', exact: true }).click()
  await inspector.getByLabel('Editor label', { exact: true }).fill('Browser duplicate')
  await canvasToolbar.getByRole('button', { name: 'Move up', exact: true }).click()
  assert.deepEqual(
    await readLayerLabels(page),
    ['Hero Banner', 'Browser duplicate', 'Body text'],
    'Move up should update the layer order.',
  )

  await canvasToolbar.getByRole('button', { name: 'Move down', exact: true }).click()
  assert.deepEqual(
    await readLayerLabels(page),
    ['Hero Banner', 'Body text', 'Browser duplicate'],
    'Move down should update the layer order.',
  )
  await canvasToolbar.getByRole('button', { name: 'Move up', exact: true }).click()

  const visibleControl = inspector.getByLabel('Visible', { exact: true })
  await visibleControl.uncheck()
  assert.equal(await readHiddenLayerCount(page), 1)
  await visibleControl.check()
  assert.equal(await readHiddenLayerCount(page), 0)

  page.once('dialog', (dialog) => dialog.accept())
  await canvasToolbar.getByRole('button', { name: 'Delete', exact: true }).click()
  assert.equal(await readBlockCount(page), 2, 'Delete should remove the selected block.')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.equal(await readBlockCount(page), 3, 'Undo should restore the deleted block.')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  assert.equal(await readBlockCount(page), 2, 'Redo should remove the restored block again.')

  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  await page.getByTestId('fixture-status').getByText('Saved for this test session', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Page settings', exact: true }).click()
  await inspector.getByLabel('Page title', { exact: true }).fill('Changed after save')
  assert.equal(await page.getByTestId('fixture-dirty-state').textContent(), 'Unsaved')

  await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
  await openContextView(page, 'Inspector')
  assert.equal(await inspector.getByLabel('Page title', { exact: true }).inputValue(), 'Untitled Page')

  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()
  assert.equal(await readBlockCount(page), 2, 'A browser reload should recover the explicitly saved block tree.')
  await page.getByRole('heading', { name: 'Browser-tested hero', exact: true }).waitFor()

  await page.evaluate((storageKey) => {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        blocks: [
          {
            id: 'unsupported-fixture',
            payload: { privateLegacyValue: 'must not render' },
            type: 'retired-promo',
            version: 1,
          },
        ],
        contentModel: 'block-page',
        group: 'custom',
        key: 'editorInteractionFixture',
        metaDescription: 'Unsupported block rendering fixture.',
        navLabel: 'Unsupported Fixture',
        path: '/unsupported-fixture',
        routeAliases: [],
        source: 'structured',
        title: 'Unsupported Fixture',
      }),
    )
  }, STORAGE_KEY)
  await page.reload()
  await page.getByRole('alert').filter({ hasText: 'retired-promo is not registered' }).waitFor()
  await openContextView(page, 'Layers')
  await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-button').click()
  await page.getByRole('complementary', { name: 'Inspector' }).getByRole('alert').waitFor()

  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  await page.getByText('This section is currently unavailable.', { exact: true }).waitFor()
  assert.equal(await page.getByText('retired-promo', { exact: true }).count(), 0, 'Public fallback must not expose the unknown type.')
  assert.equal(await page.getByText('must not render', { exact: true }).count(), 0, 'Public fallback must not expose stored payload data.')
  assert.deepEqual(pageErrors, [], `The editor emitted browser errors: ${pageErrors.join('; ')}`)

  console.log('Page editor browser interaction tests passed.')
} finally {
  await browser?.close()
  await server.close()
}
