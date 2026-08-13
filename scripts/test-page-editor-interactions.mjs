import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const HARNESS_PATH = '/admin/__editor-test'
const STORAGE_KEY = 'genericcms:editor-interaction-fixture'

async function readBlockCount(page) {
  return Number(await page.getByTestId('fixture-block-count').textContent())
}

async function openContextView(page, name) {
  if (name === 'Layers') {
    return
  }

  if (name === 'Layout') {
    const layoutButton = page.getByRole('button', { name: 'Layout', exact: true })

    if ((await layoutButton.getAttribute('aria-pressed')) !== 'true') {
      await layoutButton.click()
    }

    return
  }

  if (name === 'Inspector') {
    const visualButton = page.getByRole('button', { name: 'Visual', exact: true })

    if ((await visualButton.count()) > 0 && (await visualButton.getAttribute('aria-pressed')) !== 'true') {
      await visualButton.click()
    }

    const inspector = page.getByRole('complementary', { name: 'Inspector' })
    // The selection inspector floats over the selected block and only appears once its
    // position has been measured on a requestAnimationFrame after the Visual/Layout
    // toggle re-render, so an immediate count() races that measurement. Give it a moment
    // before assuming no block is selected and falling back to Page settings.
    const inspectorAppeared = await inspector
      .first()
      .waitFor({ state: 'attached', timeout: 2000 })
      .then(() => true)
      .catch(() => false)

    if (!inspectorAppeared) {
      const settingsButton = page.locator('.admin-page-editor-canvas-toolbar').getByRole('button', { name: 'Page settings', exact: true })

      if ((await settingsButton.count()) > 0 && (await settingsButton.getAttribute('aria-pressed')) !== 'true') {
        await settingsButton.click()
      }
    }
  }
}

async function readLayerLabels(page) {
  await openContextView(page, 'Layers')
  const labels = await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-list .block-outline-item-label').allTextContents()
  await openContextView(page, 'Inspector')
  return labels
}

async function readHiddenLayerCount(page) {
  await openContextView(page, 'Layers')
  const count = await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-list').getByText('Hidden', { exact: true }).count()
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
  const pageBodyLayer = page.getByRole('region', { name: 'Page layers' }).getByRole('button', { name: 'Page', exact: true })
  await pageBodyLayer.click()
  await page.getByRole('complementary', { name: 'Inspector' }).getByRole('tab', { name: 'Style', exact: true }).waitFor()
  assert.equal(await pageBodyLayer.getAttribute('aria-pressed'), 'true', 'The page body layer should select overall page properties.')
  await page.getByRole('button', { name: 'Visual', exact: true }).click()

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

  // The hero CTA button only renders once it has real button text/link and is explicitly enabled.
  await inspector.getByLabel('Button text', { exact: true }).fill('Contact us')
  await inspector.getByLabel('Button link Path', { exact: true }).fill('/contact-us')
  await inspector.getByLabel('Show CTA button', { exact: true }).check()
  await page.locator('.block-hero-button').first().waitFor()

  const heroCta = page.locator('.block-hero-button').first()
  await heroCta.click()
  await page.locator('.admin-inline-format-toolbar').waitFor({ state: 'visible' })
  await page.locator('.admin-inline-link-settings').waitFor({ state: 'visible' })
  assert.equal(
    await page.locator('.admin-inline-format-toolbar .admin-rich-text-menu-label').count(),
    0,
    'Inline text formatting menus should not show separate Tag or Size labels.',
  )
  assert.equal(
    await heroCta.getAttribute('data-admin-inline-editing'),
    'true',
    'Clicking the hero CTA should keep the inline editor active after mouse release.',
  )
  await page.locator('.admin-inline-format-toolbar').getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('.admin-inline-format-toolbar').waitFor({ state: 'detached' })

  await inspector.getByRole('tab', { name: 'Style', exact: true }).click()
  await inspector.getByLabel('Title style', { exact: true }).selectOption('feature-card')
  const styledHeroTitle = page.locator('.block-hero h1[data-block-element-style-target="title"]').first()
  await styledHeroTitle.waitFor()
  const styledHeroTitleClassName = await styledHeroTitle.getAttribute('class')
  assert.match(styledHeroTitleClassName, /block-element-style-target/, 'Element style presets should apply to selected block elements.')
  assert.match(styledHeroTitleClassName, /block-style-frame--radius-large/, 'Element style preset classes should render on the styled element.')
  await inspector.getByRole('tab', { name: 'Content', exact: true }).click()

  await page.getByRole('button', { name: '+ Insert below', exact: true }).click()
  await page.getByRole('button', { name: 'Rich Text', exact: true }).click()
  assert.equal(await readBlockCount(page), 2, 'Inserting below should preserve the existing hero.')

  const richTextToolbar = inspector.locator('.admin-rich-text-toolbar').first()
  const richTextCanvas = inspector.locator('.admin-rich-text-canvas').first()
  await richTextCanvas.click()
  await richTextToolbar.waitFor({ state: 'visible' })
  assert.equal(
    await richTextToolbar.locator('.admin-rich-text-menu-label').count(),
    0,
    'Rich text toolbar Tag and Size menus should not render separate labels.',
  )
  assert.equal(await richTextToolbar.getByRole('button', { name: 'Add Row', exact: true }).count(), 0)
  assert.equal(await richTextToolbar.getByRole('button', { name: 'Add Column', exact: true }).count(), 0)
  assert.equal(await richTextToolbar.getByRole('button', { name: 'Delete Row', exact: true }).count(), 0)
  assert.equal(await richTextToolbar.getByRole('button', { name: 'Delete Column', exact: true }).count(), 0)
  await richTextToolbar.getByRole('button', { name: 'Insert Table', exact: true }).click()
  assert.equal(await richTextToolbar.getByRole('button', { name: 'Add Row', exact: true }).count(), 0)
  await richTextCanvas.locator('td, th').first().click()
  await richTextToolbar.getByRole('button', { name: 'Add Row', exact: true }).waitFor()
  await richTextToolbar.getByRole('button', { name: 'Add Column', exact: true }).waitFor()
  await richTextToolbar.getByRole('button', { name: 'Delete Row', exact: true }).waitFor()
  await richTextToolbar.getByRole('button', { name: 'Delete Column', exact: true }).waitFor()

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
  const savedStyledPage = await page.evaluate((storageKey) => JSON.parse(window.sessionStorage.getItem(storageKey)), STORAGE_KEY)
  assert.equal(savedStyledPage.blocks[0].elementStyles.title.presetId, 'feature-card', 'Element style preset choices should persist in page data.')
  await page.locator('.editor-interaction-harness-actions').getByRole('button', { name: 'Page settings', exact: true }).click()
  await inspector.getByRole('tab', { name: 'Settings', exact: true }).click()
  await inspector.getByLabel('Page title', { exact: true }).fill('Changed after save')
  assert.equal(await page.getByTestId('fixture-dirty-state').textContent(), 'Unsaved')

  await page.getByRole('button', { name: 'Reload saved', exact: true }).click()
  await openContextView(page, 'Inspector')
  await inspector.getByRole('tab', { name: 'Settings', exact: true }).click()
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
  await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-list .block-outline-button').click()
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
