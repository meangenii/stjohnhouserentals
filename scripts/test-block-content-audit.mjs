import assert from 'node:assert/strict'
import { auditBlockPageContent } from '../src/lib/blockPageContentAudit.js'

function assertIssue(warnings, code, path = '') {
  assert.ok(
    warnings.some((warning) => warning.code === code && (!path || warning.path.join('.') === path)),
    `Expected warning "${code}"${path ? ` at ${path}` : ''}.`,
  )
}

const readyWarnings = auditBlockPageContent({
  blocks: [
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'hero',
      title: 'Ready Page',
      type: 'hero',
    },
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'cta',
      title: 'Contact',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
})

assert.deepEqual(readyWarnings, [])

const nonLinkContactWarnings = auditBlockPageContent({
  blocks: [
    {
      id: 'contact-details',
      items: [
        { href: '', id: 'text-detail', label: 'Office', linkType: 'external', type: 'text', value: 'Cruz Bay' },
        { href: '', id: 'phone-detail', label: 'Phone', linkType: 'external', type: 'phone', value: '340-555-0100' },
      ],
      type: 'contact-details',
    },
  ],
  contentModel: 'block-page',
})

assert.deepEqual(nonLinkContactWarnings, [], 'Text and phone contact details must not be audited as incomplete links.')

const warningPage = {
  blocks: [
    {
      action: { label: 'Read more', path: '' },
      id: 'hero',
      image: { kind: 'image', url: 'https://example.com/hero.jpg' },
      title: 'New hero banner',
      type: 'hero',
    },
    {
      html: '<p>Add your text here...</p>',
      id: 'body',
      type: 'rich-text',
    },
    {
      columns: [
        {
          blocks: [],
          id: 'column',
          width: 1,
        },
      ],
      id: 'row',
      type: 'row',
    },
    {
      id: 'gallery',
      images: [
        { id: 'image', kind: 'image', src: '/uploaded/photo.jpg', title: 'View' },
        { decorative: true, id: 'decorative-image', kind: 'image', src: '/uploaded/pattern.jpg' },
      ],
      type: 'image-gallery',
    },
    {
      action: { label: '', path: '/contact-us' },
      id: 'cta',
      title: 'Call now',
      type: 'cta-band',
    },
    {
      action: { label: 'Unsafe', path: 'javascript:alert(1)' },
      id: 'unsafe-link',
      title: 'Unsafe link',
      type: 'cta-band',
    },
    {
      action: { label: 'Learn More', path: '/details' },
      id: 'vague-link',
      title: 'Vague link',
      type: 'cta-band',
    },
    {
      id: 'business-list',
      items: [{ id: 'business', name: 'Business', website: 'data:text/html,unsafe' }],
      title: 'Businesses',
      type: 'business-list',
    },
  ],
  contentModel: 'block-page',
}

const warnings = auditBlockPageContent(warningPage)

assertIssue(warnings, 'missing-heading-text', 'blocks.0.title')
assertIssue(warnings, 'missing-image-alt', 'blocks.0.image.alt')
assertIssue(warnings, 'link-missing-destination', 'blocks.0.action')
assertIssue(warnings, 'empty-block-content', 'blocks.1.html')
assertIssue(warnings, 'empty-container', 'blocks.2.columns.0.blocks')
assertIssue(warnings, 'missing-image-alt', 'blocks.3.images.0.alt')
assert.ok(!warnings.some((warning) => warning.path.join('.') === 'blocks.3.images.1.alt'))
assertIssue(warnings, 'link-missing-label', 'blocks.4.action')
assertIssue(warnings, 'link-unsafe-destination', 'blocks.5.action')
assertIssue(warnings, 'non-descriptive-link-label', 'blocks.6.action')
assertIssue(warnings, 'link-unsafe-destination', 'blocks.7.items.0')

assert.deepEqual(auditBlockPageContent({ contentModel: 'rich-content-page' }), [])

console.log('Block content audit tests passed.')
