import assert from 'node:assert/strict'
import { auditBlockPageAccessibility } from '../src/lib/blockPageAccessibilityAudit.js'

function assertIssue(warnings, code, path = '') {
  assert.ok(
    warnings.some((warning) => warning.code === code && (!path || warning.path.join('.') === path)),
    `Expected accessibility warning "${code}"${path ? ` at ${path}` : ''}.`,
  )
}

const accessiblePage = {
  blocks: [
    { id: 'hero', title: 'Accessible Page', type: 'hero' },
    { html: '<h2>Overview</h2><p>Page content.</p><h3>Details</h3><p>More detail.</p>', id: 'copy', type: 'rich-text' },
    {
      columns: [{ heading: 'Morning', id: 'morning', times: ['9:00'], width: 1 }],
      id: 'schedule',
      title: 'Schedule',
      type: 'schedule',
    },
    { heading: 'Rates', id: 'rates', rows: [], type: 'rate-table' },
  ],
  contentModel: 'block-page',
}

assert.deepEqual(auditBlockPageAccessibility(accessiblePage), [])

const invalidOutline = {
  blocks: [
    { id: 'hero-one', title: 'First Page Heading', type: 'hero' },
    { id: 'hero-two', title: 'Second Page Heading', type: 'hero' },
    {
      html: '<h4>Skipped heading</h4><h2></h2><p><a href="/details">Click here</a> or <a href="/contact"></a>.</p>',
      id: 'copy',
      type: 'rich-text',
    },
  ],
  contentModel: 'block-page',
}

const outlineWarnings = auditBlockPageAccessibility(invalidOutline)
assertIssue(outlineWarnings, 'multiple-page-headings', 'blocks.1.title')
assertIssue(outlineWarnings, 'heading-level-skip', 'blocks.2.html')
assertIssue(outlineWarnings, 'empty-rich-text-heading', 'blocks.2.html')
assertIssue(outlineWarnings, 'non-descriptive-link-label', 'blocks.2.html')
assertIssue(outlineWarnings, 'empty-rich-text-link', 'blocks.2.html')
assert.equal(outlineWarnings.filter((warning) => warning.code === 'empty-rich-text-heading').length, 1)

const deviceWarnings = auditBlockPageAccessibility({
  blocks: [
    { id: 'desktop-hero', title: 'Desktop Heading', type: 'hero', visibility: { hideOnMobile: true } },
    { id: 'cta', title: 'Contact', type: 'cta-band' },
  ],
  contentModel: 'block-page',
})

assert.equal(deviceWarnings.filter((warning) => warning.code === 'missing-page-heading').length, 1)
assert.match(deviceWarnings.find((warning) => warning.code === 'missing-page-heading').message, /Mobile/)
assert.deepEqual(auditBlockPageAccessibility({ contentModel: 'rich-content-page' }), [])

console.log('Block accessibility audit tests passed.')
