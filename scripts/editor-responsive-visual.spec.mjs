import AxeBuilder from '@axe-core/playwright'
import { expect, test } from 'playwright/test'
import { createServer } from 'vite'

const HARNESS_PATH = '/admin/__editor-test'
const REVIEW_HARNESS_PATH = '/admin/__editor-review-test'
const STORAGE_KEY = 'genericcms:editor-interaction-fixture'

let baseUrl = ''
let server

async function openCleanHarness(page) {
  await page.goto(`${baseUrl}${HARNESS_PATH}`)
  await page.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), STORAGE_KEY)
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()
  await expect(page.locator('.admin-page-editor-shell')).toBeVisible()
}

async function readEditorLayout(page) {
  return page.locator('.admin-page-editor-shell').evaluate((shell) => {
    const readBox = (selector) => {
      const element = shell.querySelector(selector)
      const box = element?.getBoundingClientRect()

      return box
        ? { bottom: box.bottom, height: box.height, left: box.left, right: box.right, top: box.top, width: box.width }
        : null
    }

    return {
      canvas: readBox('.admin-page-editor-canvas'),
      clientWidth: document.documentElement.clientWidth,
      floatingInspector: readBox('.admin-selected-block-floating-inspector'),
      inspector: readBox('.block-inspector'),
      layout: readBox('.admin-page-editor-layout-view'),
      layers: readBox('.block-outline'),
      scrollWidth: document.documentElement.scrollWidth,
      toolbar: readBox('.admin-page-editor-canvas-toolbar'),
    }
  })
}

async function selectPreviewDevice(page, label) {
  await page.getByRole('button', { name: /^Preview device:/ }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
}

function expectUsableBox(box) {
  expect(box).not.toBeNull()
  expect(box.width).toBeGreaterThan(120)
  expect(box.height).toBeGreaterThan(80)
}

test.beforeAll(async () => {
  server = await createServer({
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const address = server.httpServer.address()

  if (!address || typeof address !== 'object') {
    throw new Error('Vite did not expose an editor visual-test server address.')
  }

  baseUrl = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
})

test('desktop editor keeps layers beside the canvas and swaps visual/layout in place', async ({ page }) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await openCleanHarness(page)
  const closedLayout = await readEditorLayout(page)

  expect(closedLayout.scrollWidth).toBeLessThanOrEqual(closedLayout.clientWidth)
  expectUsableBox(closedLayout.layers)
  expect(closedLayout.layers.width).toBeLessThan(360)
  expect(closedLayout.toolbar).not.toBeNull()
  expect(closedLayout.toolbar.width).toBeGreaterThan(160)
  expect(closedLayout.toolbar.height).toBeGreaterThan(40)
  expectUsableBox(closedLayout.canvas)
  expect(closedLayout.canvas.left).toBeGreaterThanOrEqual(closedLayout.layers.right)
  expect(closedLayout.canvas.width).toBeGreaterThan(closedLayout.layers.width * 3)
  await expect(page.getByRole('button', { name: 'Edit background', exact: true })).toBeHidden()

  await page.getByRole('button', { name: 'Layout', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Layout layers' }).getByText(/px x/).first()).toBeVisible()
  const measuredLayout = await readEditorLayout(page)
  expectUsableBox(measuredLayout.layout)
  expect(measuredLayout.canvas.left).toBeCloseTo(closedLayout.canvas.left, 0)
  expect(measuredLayout.canvas.top).toBeCloseTo(closedLayout.canvas.top, 0)
  expect(measuredLayout.canvas.width).toBeCloseTo(closedLayout.canvas.width, 0)

  await page.getByRole('region', { name: 'Layout layers' }).locator('.block-layout-outline-button').filter({ hasText: 'Hero Banner' }).click()
  await page.getByRole('button', { name: 'Visual', exact: true }).click()
  const blockToolbar = page.locator('.block-toolbar')
  await expect(blockToolbar.getByRole('button', { name: 'Move up', exact: true })).toBeVisible()
  await expect(blockToolbar.getByRole('button', { name: 'Duplicate', exact: true })).toHaveText('')
  await expect(page.getByRole('button', { name: 'Edit background', exact: true })).toBeVisible()
  const selectedLayout = await readEditorLayout(page)
  expectUsableBox(selectedLayout.floatingInspector)
  const selectedBlockBox = await page.locator('[data-editor-selection-id="fixture-hero"]').boundingBox()
  expect(selectedBlockBox).not.toBeNull()
  expect(selectedLayout.floatingInspector.top).toBeGreaterThan(selectedBlockBox.y)

  await page.getByRole('button', { name: 'Edit background', exact: true }).click()
  const backgroundDialog = page.getByRole('dialog', { name: 'Background', exact: true })
  const dialogBox = await backgroundDialog.boundingBox()
  expect(dialogBox).not.toBeNull()
  expect(dialogBox.width).toBeLessThan(1400)
  expect(dialogBox.height).toBeLessThan(960)
  await backgroundDialog.getByRole('button', { name: 'Close', exact: true }).click()
})

test('tablet workspace keeps the rail narrow and the canvas wide', async ({ page }) => {
  await page.setViewportSize({ height: 1000, width: 1000 })
  await openCleanHarness(page)
  const layout = await readEditorLayout(page)

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  expectUsableBox(layout.layers)
  expectUsableBox(layout.canvas)
  expect(layout.inspector?.width ?? 0).toBe(0)
  expect(layout.layers.width).toBeLessThan(340)
  expect(layout.canvas.left).toBeGreaterThanOrEqual(layout.layers.right)
  expect(layout.canvas.width).toBeGreaterThan(layout.layers.width * 2)
  await selectPreviewDevice(page, 'Tablet')
  await expect(page.locator('.admin-site-preview-viewport--tablet')).toBeVisible()
})

test('mobile workspace stacks the rail above the canvas without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 390 })
  await openCleanHarness(page)
  const layout = await readEditorLayout(page)

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
  expectUsableBox(layout.layers)
  expectUsableBox(layout.canvas)
  expect(layout.inspector?.width ?? 0).toBe(0)
  expect(layout.layers.width).toBeLessThanOrEqual(layout.clientWidth)
  expect(layout.canvas.top).toBeGreaterThanOrEqual(layout.layers.bottom)
  await selectPreviewDevice(page, 'Mobile')
  const mobileViewport = page.locator('.admin-site-preview-viewport--mobile')
  await expect(mobileViewport).toBeVisible()
  await expect(mobileViewport).toHaveCSS('width', '358px')

  // Picking a device from the split-button menu also switches to read-only Preview mode;
  // return to Edit to reach the Layers rail and block toolbar below.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-button').filter({ hasText: 'Hero Banner' }).click()
  const selectedLayout = await readEditorLayout(page)
  expect(selectedLayout.scrollWidth).toBeLessThanOrEqual(selectedLayout.clientWidth)
  await expect(page.locator('.block-toolbar').getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
  expectUsableBox(selectedLayout.floatingInspector)
})

test('canvas controls and inspector tabs support keyboard navigation with no automated accessibility violations', async ({ page }) => {
  await page.setViewportSize({ height: 1000, width: 1440 })
  await openCleanHarness(page)

  const layoutButton = page.getByRole('button', { name: 'Layout', exact: true })
  await layoutButton.focus()
  await page.keyboard.press('Enter')
  await expect(layoutButton).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Layout layers' })).toBeVisible()
  await page.getByRole('button', { name: 'Visual', exact: true }).click()

  await page.getByRole('region', { name: 'Page layers' }).locator('.block-outline-button').filter({ hasText: 'Hero Banner' }).focus()
  await page.keyboard.press('Enter')

  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector).toBeVisible()
  const contentTab = inspector.getByRole('tab', { name: 'Content', exact: true })
  await contentTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(inspector.getByRole('tab', { name: 'Style', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(inspector.getByRole('tab', { name: 'Settings', exact: true })).toHaveAttribute('aria-selected', 'true')

  const results = await new AxeBuilder({ page }).include('.editor-interaction-harness').analyze()
  const violations = results.violations.map((violation) => ({
    help: violation.help,
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.flatMap((node) => node.target),
  }))

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
})

test('review tools stay out of the page flow until requested from one toolbar', async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1200 })
  await page.goto(`${baseUrl}${REVIEW_HARNESS_PATH}`)
  await page.getByRole('heading', { name: 'Review tools', exact: true }).waitFor()

  const headingToolbar = page.locator('.admin-page-editor-heading-toolbar')
  const headingLayout = await headingToolbar.evaluate((toolbar) => {
    const elements = [toolbar.querySelector('h2'), toolbar.querySelector('select'), toolbar.querySelector('.admin-page-editor-heading-actions')]
    const boxes = elements.map((element) => element.getBoundingClientRect())
    return {
      centers: boxes.map((box) => box.top + box.height / 2),
      height: toolbar.getBoundingClientRect().height,
      scrollWidth: toolbar.scrollWidth,
      width: toolbar.clientWidth,
    }
  })
  expect(Math.max(...headingLayout.centers) - Math.min(...headingLayout.centers)).toBeLessThan(2)
  expect(headingLayout.height).toBeLessThan(60)
  expect(headingLayout.scrollWidth).toBeLessThanOrEqual(headingLayout.width)
  await expect(headingToolbar).toHaveScreenshot('editor-page-heading-toolbar.png')

  const tools = page.locator('.editor-review-harness-tools')
  const details = tools.locator('details')
  await expect(details).toHaveCount(0)
  await expect(tools).toHaveScreenshot('editor-review-tools-compact.png')

  const compactBox = await tools.boundingBox()
  expect(compactBox).not.toBeNull()
  expect(compactBox.height).toBeLessThan(70)

  await page.getByRole('button', { name: 'Revision history: 40 revisions', exact: true }).click()
  const revisions = page.getByRole('region', { name: 'Page revision history' })
  const revisionsBody = revisions.locator('.admin-page-revisions-body')
  await expect(revisionsBody).toBeVisible()
  const revisionScroll = await revisionsBody.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(revisionScroll.clientHeight).toBeLessThanOrEqual(400)
  expect(revisionScroll.scrollHeight).toBeGreaterThan(revisionScroll.clientHeight)
  await expect(revisions.getByRole('button', { name: 'Preview', exact: true }).first()).toHaveText('')
  await expect(revisions.getByRole('button', { name: 'Restore', exact: true }).first()).toHaveText('')

  await page.getByRole('button', { name: 'Page checks: 2 issues', exact: true }).click()
  await expect(revisions).toHaveCount(0)
  await expect(page.locator('.admin-page-quality')).toBeVisible()
  await page.getByRole('button', { name: 'Page checks: 2 issues', exact: true }).click()
  await expect(tools.locator('details')).toHaveCount(0)

  const results = await new AxeBuilder({ page }).include('.editor-review-harness').analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
})
