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

async function addBlock(page, label, { insertBelow = false } = {}) {
  await page.getByRole('button', { name: insertBelow ? '+ Insert below' : '+ Add block', exact: true }).click()
  await page.getByRole('button', { name: label, exact: true }).click()

  const inspectorLauncher = page.getByRole('button', { name: 'Open Inspector', exact: true })
  if ((await inspectorLauncher.getAttribute('aria-pressed')) !== 'true') {
    await inspectorLauncher.click()
  }
}

async function selectLayer(page, label) {
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
  const page = await browser.newPage({ viewport: { height: 1000, width: 1600 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`http://127.0.0.1:${address.port}${HARNESS_PATH}`)
  await page.evaluate((storageKey) => window.sessionStorage.removeItem(storageKey), STORAGE_KEY)
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()
  await page.getByRole('button', { name: 'New page', exact: true }).click()

  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  await addBlock(page, 'Schedule / Timetable')
  await inspector.getByRole('button', { name: 'Add Column', exact: true }).click()
  const scheduleColumn = inspector.locator('details.block-inspector-list-item').first()
  const scheduleTimes = scheduleColumn.locator('section.block-inspector-list-field').filter({ hasText: 'Times' })
  const scheduleCanvas = page.locator('.block-schedule')

  await scheduleCanvas.getByRole('button', { name: 'Add time', exact: true }).click()
  assert.equal(await scheduleTimes.locator('input').count(), 1, `Canvas add time did not update the Inspector:\n${await scheduleColumn.innerText()}`)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectLayer(page, 'Schedule / Timetable')
  assert.equal(await scheduleTimes.locator('input').count(), 0, 'One undo must remove a canvas-added time and its stable id.')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectLayer(page, 'Schedule / Timetable')
  await scheduleTimes.locator('input').nth(0).fill('9:00 AM')

  await scheduleColumn.getByRole('button', { name: 'Add time', exact: true }).click()
  await scheduleTimes.locator('input').nth(1).fill('10:00 AM')
  const secondTimeRow = scheduleTimes.locator('.block-inspector-list-item-body').nth(1)
  await secondTimeRow.getByRole('button', { name: 'Up', exact: true }).click()
  assert.equal(await scheduleTimes.locator('input').nth(0).inputValue(), '10:00 AM')

  await inspector.getByRole('button', { name: 'Add note', exact: true }).click()
  const scheduleNotes = inspector.locator('section.block-inspector-list-field').filter({ hasText: 'Notes' })
  await scheduleNotes.locator('input').nth(0).fill('Weekdays only')

  await addBlock(page, 'Rate Table', { insertBelow: true })
  assert.equal(await scheduleCanvas.getByRole('button', { name: 'Add time', exact: true }).count(), 0, 'Unselected blocks must not retain inline command chrome.')
  await inspector.getByRole('button', { name: 'Add Row', exact: true }).click()
  const rateRow = inspector.locator('details.block-inspector-list-item').first()
  const rateValues = rateRow.locator('section.block-inspector-list-field').filter({ hasText: 'Values' })
  await rateRow.getByLabel('Label', { exact: true }).fill('Daily rate')
  await rateValues.locator('input').nth(0).fill('$100')

  const rateCanvas = page.locator('.block-rate-table')
  await rateCanvas.getByRole('button', { name: 'Add value', exact: true }).click()
  assert.equal(await rateValues.locator('input').count(), 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectLayer(page, 'Rate Table')
  assert.equal(await rateValues.locator('input').count(), 1, 'One undo must remove a canvas-added rate value and its stable id.')

  await inspector.getByRole('button', { name: 'Add footer line', exact: true }).click()
  const footerLines = inspector.locator('section.block-inspector-list-field').filter({ hasText: 'Footer lines' })
  await footerLines.locator('input').nth(0).fill('Taxes apply')

  await addBlock(page, 'Business / Contact List', { insertBelow: true })
  await inspector.getByRole('button', { name: 'Add Business', exact: true }).click()
  const business = inspector.locator('details.block-inspector-list-item').first()
  const phoneNumbers = business.locator('section.block-inspector-list-field').filter({ hasText: 'Phone numbers' })
  await business.getByLabel('Business name', { exact: true }).fill('Island Services')
  await business.getByLabel('Website URL', { exact: true }).fill('https://example.com')
  await phoneNumbers.locator('input').nth(0).fill('340-555-0100')

  const businessCanvas = page.locator('.block-business-list')
  await businessCanvas.getByRole('button', { name: 'Add phone', exact: true }).click()
  assert.equal(await phoneNumbers.locator('input').count(), 2)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectLayer(page, 'Business / Contact List')
  assert.equal(await phoneNumbers.locator('input').count(), 1, 'One undo must remove a canvas-added phone and its stable id.')

  await addBlock(page, 'Contact Details', { insertBelow: true })
  await inspector.getByRole('button', { name: 'Add Detail', exact: true }).click()
  const contactDetail = inspector.locator('details.block-inspector-list-item').first()
  const contactText = contactDetail.locator('label:has(> span:text-is("Text")) input')
  const contactPhone = contactDetail.locator('label:has(> span:text-is("Phone number")) input')
  const contactType = contactDetail.locator('label:has(> span:text-is("Type")) select')
  await contactDetail.waitFor()
  assert.equal(await contactText.count(), 1)
  assert.equal(await contactPhone.count(), 0)
  assert.equal(await contactDetail.getByLabel('Link URL', { exact: true }).count(), 0)
  await contactText.fill('Office')
  await contactType.selectOption('phone')
  await contactPhone.waitFor()
  assert.equal(await contactText.count(), 0)
  await contactPhone.fill('340-555-0110')
  await contactType.selectOption('link')
  await contactDetail.getByLabel('Link URL', { exact: true }).waitFor()
  assert.equal(await contactPhone.count(), 0)
  await contactDetail.getByLabel('Link text', { exact: true }).fill('Contact us')
  await contactDetail.getByLabel('Link URL', { exact: true }).fill('https://example.com/contact')

  await addBlock(page, 'Hero Banner', { insertBelow: true })
  await inspector.getByRole('button', { name: 'Brand Blue', exact: true }).click()

  await page.getByRole('button', { name: 'Save fixture', exact: true }).click()
  await page.reload()
  await page.getByRole('heading', { name: 'Page editor interaction harness' }).waitFor()

  const savedPage = await page.evaluate((storageKey) => JSON.parse(window.sessionStorage.getItem(storageKey)), STORAGE_KEY)
  const [schedule, rateTable, businessList, contactDetails, hero] = savedPage.blocks

  assert.deepEqual(schedule.columns[0].times, ['10:00 AM', '9:00 AM'])
  assert.equal(schedule.columns[0].timeIds.length, schedule.columns[0].times.length)
  assert.deepEqual(schedule.notes, ['Weekdays only'])
  assert.equal(schedule.noteIds.length, schedule.notes.length)
  assert.deepEqual(rateTable.rows[0].values, ['$100'])
  assert.equal(rateTable.rows[0].valueIds.length, rateTable.rows[0].values.length)
  assert.deepEqual(rateTable.footer, ['Taxes apply'])
  assert.equal(rateTable.footerIds.length, rateTable.footer.length)
  assert.deepEqual(businessList.items[0].phones, ['340-555-0100'])
  assert.equal(businessList.items[0].phoneIds.length, businessList.items[0].phones.length)
  assert.equal(businessList.items[0].website, 'https://example.com')
  assert.equal(contactDetails.items[0].type, 'link')
  assert.equal(contactDetails.items[0].value, 'Contact us')
  assert.equal(contactDetails.items[0].href, 'https://example.com/contact')
  assert.equal(hero.action.backgroundColor, '#2269ff')
  assert.deepEqual(pageErrors, [], `The Inspector workflow emitted browser errors: ${pageErrors.join('; ')}`)

  console.log('Block Inspector browser interaction tests passed.')
} finally {
  await browser?.close()
  await server.close()
}
