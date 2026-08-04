import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const HARNESS_PATH = '/admin/__editor-test'
const STORAGE_KEY = 'genericcms:editor-interaction-fixture'

const server = await createServer({
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
  },
})

let browser

async function addBlock(page, label) {
  const insertButton = page.getByRole('button', { name: '+ Insert below', exact: true })
  const addButton = page.getByRole('button', { name: '+ Add block', exact: true })

  if (await insertButton.count()) {
    await insertButton.click()
  } else {
    await addButton.click()
  }

  await page.getByRole('button', { name: label, exact: true }).click()

  const inspectorLauncher = page.getByRole('button', { name: 'Open Inspector', exact: true })
  if ((await inspectorLauncher.getAttribute('aria-pressed')) !== 'true') {
    await inspectorLauncher.click()
  }
}

function getListItem(scope, index = 0) {
  return scope.locator('details.block-inspector-list-item').nth(index)
}

async function selectContainerLayer(page, label) {
  await page.getByRole('button', { name: 'Open Layers', exact: true }).click()
  await page
    .getByRole('region', { name: 'Page layers' })
    .locator('.block-outline-container')
    .filter({ hasText: label })
    .click()
}

async function selectBlockLayer(page, label) {
  await page.getByRole('button', { name: 'Open Layers', exact: true }).click()
  await page
    .getByRole('region', { name: 'Page layers' })
    .locator('.block-outline-button')
    .filter({ hasText: label })
    .click()
}

try {
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address === 'object', 'Vite did not expose a test server address.')

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { height: 1100, width: 1800 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/api/properties/summaries', (route) => route.fulfill({ json: { groups: [], properties: [] } }))
  await page.route('**/api/charters', (route) => route.fulfill({ json: { charters: [] } }))

  await page.goto(`http://127.0.0.1:${address.port}${HARNESS_PATH}`)
  await page.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), STORAGE_KEY)
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()
  await page.getByRole('button', { name: 'New page', exact: true }).click()

  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  await addBlock(page, 'Hero Banner')
  await inspector.getByLabel('Title', { exact: true }).fill('Current page hero')
  await inspector.getByLabel('Lead', { exact: true }).fill('Hero copy stays on the current page rail while the background spans the canvas.')
  await inspector.getByLabel('Button text', { exact: true }).fill('Explore rentals')
  await inspector.getByLabel('Button link Path', { exact: true }).fill('/for-rent')
  await page.getByRole('heading', { name: 'Current page hero', exact: true }).waitFor()
  const heroLayout = await page.locator('.block-hero').evaluate((hero) => {
    const surface = hero.closest('.admin-site-preview-surface')
    const copy = hero.querySelector('.block-hero-inner')
    const heroRect = hero.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()
    const copyRect = copy.getBoundingClientRect()
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)

    return {
      copyWidth: copyRect.width,
      heroLeft: heroRect.left,
      heroWidth: heroRect.width,
      rootFontSize,
      surfaceLeft: surfaceRect.left,
      surfaceWidth: surfaceRect.width,
    }
  })
  assert.ok(Math.abs(heroLayout.heroLeft - heroLayout.surfaceLeft) <= 2, 'New hero blocks must align to the full preview surface.')
  assert.ok(Math.abs(heroLayout.heroWidth - heroLayout.surfaceWidth) <= 2, 'New hero blocks must span the full preview surface.')
  assert.ok(heroLayout.copyWidth <= heroLayout.rootFontSize * 72 + 2, 'Hero copy should stay on the current page copy rail.')

  await addBlock(page, 'Image + Text Split')
  await inspector.getByLabel('Kicker', { exact: true }).fill('Island guide')
  await inspector.getByLabel('Title', { exact: true }).fill('Explore every shoreline')
  await inspector.getByLabel('Body', { exact: true }).fill('Professional split-section body copy.')
  await inspector.getByLabel('Image side', { exact: true }).selectOption('right')
  const splitImage = inspector.getByRole('group', { name: 'Section image', exact: true })
  await splitImage.getByLabel('Alt text', { exact: true }).fill('Shoreline at sunset')
  await splitImage.getByLabel('Image title', { exact: true }).fill('Shoreline')
  await inspector.getByLabel('Link text', { exact: true }).fill('View the guide')
  await inspector.getByLabel('Link Path', { exact: true }).fill('/island-guide')
  await page.locator('.block-split--image-right').waitFor()
  await page.getByRole('heading', { name: 'Explore every shoreline', exact: true }).waitFor()
  const splitLayout = await page.locator('.block-split').evaluate((split) => {
    const block = split.closest('.block-page-block')
    const surface = split.closest('.admin-site-preview-surface')
    const blockRect = block.getBoundingClientRect()
    const surfaceRect = surface.getBoundingClientRect()

    return {
      blockLeft: blockRect.left,
      blockWidth: blockRect.width,
      surfaceLeft: surfaceRect.left,
      surfaceWidth: surfaceRect.width,
    }
  })
  assert.ok(splitLayout.blockLeft > splitLayout.surfaceLeft, 'Contained editor blocks should keep the current page gutter.')
  assert.ok(splitLayout.blockWidth < splitLayout.surfaceWidth, 'Contained editor blocks should not render as edge-to-edge sections.')
  const splitLink = page.getByRole('link', { name: 'View the guide', exact: true })
  const splitLinkPresentation = await splitLink.evaluate((link) => {
    const styles = window.getComputedStyle(link)
    const parentStyles = window.getComputedStyle(link.parentElement)

    return {
      color: styles.color,
      isInlineLink: link.classList.contains('site-inline-link'),
      parentColor: parentStyles.color,
      textDecorationLine: styles.textDecorationLine,
    }
  })
  assert.equal(splitLinkPresentation.isInlineLink, true)
  assert.match(splitLinkPresentation.textDecorationLine, /underline/)
  assert.notEqual(splitLinkPresentation.color, splitLinkPresentation.parentColor)

  await addBlock(page, 'Feature Grid')
  await inspector.getByLabel('Title', { exact: true }).fill('Included services')
  await inspector.getByRole('button', { name: 'Add Feature', exact: true }).click()
  const feature = getListItem(inspector)
  await feature.getByLabel('Icon', { exact: true }).selectOption('pin')
  await feature.getByLabel('Title', { exact: true }).fill('Local planning')
  await feature.getByLabel('Description', { exact: true }).fill('Detailed recommendations for every stay.')
  await page.locator('.block-feature-grid-item').filter({ hasText: 'Local planning' }).waitFor()

  await addBlock(page, 'Rich Text')
  await inspector.getByLabel('Text', { exact: true }).fill('Rich text authored through the schema Inspector.')
  await page.locator('.block-rich-text').filter({ hasText: 'Rich text authored through the schema Inspector.' }).waitFor()

  await addBlock(page, 'Image')
  await inspector.getByLabel('Caption', { exact: true }).fill('A managed image caption')
  const imageField = inspector.getByRole('group', { name: 'Image', exact: true })
  await imageField.getByLabel('Alt text', { exact: true }).fill('Villa exterior')
  await imageField.getByLabel('Image title', { exact: true }).fill('Villa exterior photograph')
  await imageField.getByLabel('Decorative image', { exact: true }).check()
  assert.equal(await imageField.getByLabel('Alt text', { exact: true }).isDisabled(), true)
  await imageField.getByLabel('Decorative image', { exact: true }).uncheck()
  await page.locator('.block-image-caption').filter({ hasText: 'A managed image caption' }).waitFor()

  await addBlock(page, 'Call-to-Action Band')
  await inspector.getByLabel('Title', { exact: true }).fill('Plan your arrival')
  await inspector.getByLabel('Body', { exact: true }).fill('Talk with the local team before you travel.')
  await inspector.getByLabel('Button text', { exact: true }).fill('Start planning')
  await inspector.getByLabel('Button link Path', { exact: true }).fill('/contact-us')
  await inspector.getByRole('button', { name: 'Brand Green', exact: true }).click()
  await page.locator('.block-cta-band').filter({ hasText: 'Plan your arrival' }).waitFor()
  const ctaLinkPresentation = await page.getByRole('link', { name: 'Start planning', exact: true }).evaluate((link) => ({
    isButtonLink: link.classList.contains('site-button-link'),
    isInlineLink: link.classList.contains('site-inline-link'),
    textDecorationLine: window.getComputedStyle(link).textDecorationLine,
  }))
  assert.equal(ctaLinkPresentation.isButtonLink, true)
  assert.equal(ctaLinkPresentation.isInlineLink, false)
  assert.equal(ctaLinkPresentation.textDecorationLine, 'none')

  await addBlock(page, 'Testimonials / Reviews')
  await inspector.getByRole('button', { name: 'Add Testimonial', exact: true }).click()
  const testimonial = getListItem(inspector)
  await testimonial.getByLabel('Quote', { exact: true }).fill('The editor handled every detail cleanly.')
  await testimonial.getByLabel('Author', { exact: true }).fill('Alex Morgan')
  await page.locator('.block-testimonials-item').filter({ hasText: 'Alex Morgan' }).waitFor()

  await addBlock(page, 'Image Gallery')
  await inspector.getByRole('button', { name: 'Add Image', exact: true }).click()
  const galleryImage = getListItem(inspector).getByRole('group', { name: 'Gallery image', exact: true })
  await galleryImage.getByLabel('Alt text', { exact: true }).fill('Gallery view one')
  await galleryImage.getByLabel('Image title', { exact: true }).fill('Pool terrace')
  assert.equal(await page.locator('.block-image-gallery-item').count(), 1)

  await addBlock(page, 'Spacer / Divider')
  await inspector.getByLabel('Size', { exact: true }).selectOption('large')
  await page.locator('.block-spacer--large').waitFor()

  await addBlock(page, 'Property / Charter Directory')
  await inspector.getByLabel('Title', { exact: true }).fill('Available charters')
  await inspector.getByLabel('Source', { exact: true }).selectOption('charters')
  await page.locator('.block-directory-embed').filter({ hasText: 'Available charters' }).waitFor()

  await addBlock(page, 'Contact / Inquiry Form')
  await inspector.getByLabel('Title', { exact: true }).fill('Ask about availability')
  await inspector.getByLabel('Intro', { exact: true }).fill('Send your dates and preferred property.')
  const contactForm = page.locator('.block-contact-form')
  await contactForm.filter({ hasText: 'Ask about availability' }).waitFor()
  assert.equal(await contactForm.getByRole('button', { name: 'Send Message', exact: true }).isDisabled(), true)

  await addBlock(page, 'Repeating Cards')
  await inspector.getByRole('button', { name: 'Add Card', exact: true }).click()
  const card = getListItem(inspector)
  await card.getByLabel('Card title', { exact: true }).fill('Professional card')
  const cardImage = card.getByRole('group', { name: 'Card image', exact: true })
  await cardImage.getByLabel('Alt text', { exact: true }).fill('Card cover image')
  await page.locator('.block-group-card').filter({ hasText: 'Professional card' }).waitFor()
  await selectContainerLayer(page, 'Professional card')
  await inspector.getByLabel('Card title', { exact: true }).fill('Selected professional card')
  await page.locator('.block-group-card--selected').filter({ hasText: 'Selected professional card' }).waitFor()

  await selectBlockLayer(page, 'Repeating Cards')
  await addBlock(page, 'Columns')
  assert.equal(
    await inspector.locator('.block-inspector-header').getByRole('heading').textContent(),
    'Columns',
    `Adding a root row must select its block Inspector. Current Inspector:\n${await inspector.innerText()}`,
  )
  await inspector.getByRole('tab', { name: 'Layout', exact: true }).click()
  await inspector.getByLabel('Column layout', { exact: true }).selectOption('3-equal')
  assert.equal(await page.locator('.block-row-column').count(), 3)
  await selectContainerLayer(page, 'Column 2')
  await inspector.getByRole('tab', { name: 'Layout', exact: true }).click()
  await inspector.getByLabel('Width ratio', { exact: true }).fill('2.5')
  assert.equal(await page.locator('.block-row-column').nth(1).evaluate((column) => column.style.flexGrow), '2.5')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectContainerLayer(page, 'Column 2')
  await inspector.getByRole('tab', { name: 'Layout', exact: true }).click()
  assert.equal(await inspector.getByLabel('Width ratio', { exact: true }).inputValue(), '1')

  await selectBlockLayer(page, 'Columns')
  await addBlock(page, 'Two-Column Text')
  await inspector.getByLabel('Left column', { exact: true }).fill('Left-side editorial content.')
  await inspector.getByLabel('Right column', { exact: true }).fill('Right-side editorial content.')
  const twoColumnSides = page.locator('.block-two-column-side')
  await twoColumnSides.nth(0).filter({ hasText: 'Left-side editorial content.' }).waitFor()
  await twoColumnSides.nth(1).filter({ hasText: 'Right-side editorial content.' }).waitFor()

  assert.equal(await page.getByTestId('fixture-block-count').textContent(), '14')
  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  await page.getByTestId('fixture-status').getByText('Saved for this test session', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()

  const savedPage = await page.evaluate((storageKey) => JSON.parse(window.sessionStorage.getItem(storageKey)), STORAGE_KEY)
  const blocksByType = Object.fromEntries(savedPage.blocks.map((block) => [block.type, block]))

  assert.deepEqual(savedPage.blocks.map((block) => block.type), [
    'hero',
    'image-text-split',
    'feature-grid',
    'rich-text',
    'image',
    'cta-band',
    'testimonials',
    'image-gallery',
    'spacer',
    'directory-embed',
    'contact-form',
    'group',
    'row',
    'two-column-text',
  ])
  assert.equal(blocksByType.hero.title, 'Current page hero')
  assert.equal(blocksByType.hero.action.path, '/for-rent')
  assert.match(blocksByType['image-text-split'].body, /Professional split-section body copy\./)
  assert.equal(blocksByType['image-text-split'].imagePosition, 'right')
  assert.equal(blocksByType['image-text-split'].image.alt, 'Shoreline at sunset')
  assert.equal(blocksByType['image-text-split'].action.path, '/island-guide')
  assert.equal(blocksByType['feature-grid'].items[0].kind, 'pin')
  assert.match(blocksByType['rich-text'].html, /Rich text authored through the schema Inspector\./)
  assert.equal(blocksByType.image.image.decorative, false)
  assert.equal(blocksByType.image.image.alt, 'Villa exterior')
  assert.equal(blocksByType['cta-band'].action.backgroundColor, '#18750c')
  assert.equal(blocksByType.testimonials.items[0].author, 'Alex Morgan')
  assert.equal(blocksByType['image-gallery'].images[0].title, 'Pool terrace')
  assert.equal(blocksByType.spacer.size, 'large')
  assert.equal(blocksByType['directory-embed'].source, 'charters')
  assert.equal(blocksByType['contact-form'].intro, 'Send your dates and preferred property.')
  assert.equal(blocksByType.group.items[0].title, 'Selected professional card')
  assert.equal(blocksByType.row.columns.length, 3)
  assert.deepEqual(blocksByType.row.columns.map((column) => column.width), [1, 1, 1])
  assert.match(blocksByType['two-column-text'].left, /Left-side editorial content\./)
  assert.match(blocksByType['two-column-text'].right, /Right-side editorial content\./)
  assert.deepEqual(pageErrors, [], `Block authoring emitted browser errors: ${pageErrors.join('; ')}`)

  console.log('Complete block authoring browser coverage passed.')
} finally {
  await browser?.close()
  await server.close()
}
