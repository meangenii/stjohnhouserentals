import assert from 'node:assert/strict'
import { summarizeBlockPageQuality, validateEditorBlockPageDraft } from '../src/lib/blockPageValidation.js'

function assertIssue(validation, code) {
  assert.ok(
    [...validation.errors, ...validation.warnings].some((issue) => issue.code === code),
    `Expected issue code "${code}".`,
  )
}

const VALID_PAGE_ROUTE = {
  group: 'custom',
  navLabel: 'Fixture Page',
  path: '/fixture-page',
  routeAliases: [],
}

const ignoredLegacyModel = validateEditorBlockPageDraft({
  contentModel: 'home',
  hero: {},
})

assert.equal(ignoredLegacyModel.applies, false)
assert.equal(ignoredLegacyModel.valid, true)

const readyPage = validateEditorBlockPageDraft({
  blocks: [
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'hero',
      title: 'Ready Page',
      type: 'hero',
      visibility: { hideOnMobile: false },
    },
    {
      columns: [
        {
          blocks: [
            {
              action: { label: 'Contact', path: '/contact-us' },
              id: 'cta',
              title: 'Contact',
              type: 'cta-band',
            },
          ],
          id: 'column',
          width: 1,
        },
      ],
      id: 'row',
      responsive: { mobileColumns: 'preserve' },
      type: 'row',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'A complete page draft with a hero and nested call to action.',
  title: 'Ready Page',
})

assert.equal(readyPage.applies, true)
assert.equal(readyPage.valid, true)
assert.equal(readyPage.warnings.length, 0)
assert.equal(summarizeBlockPageQuality(readyPage).tone, 'ready')

const warningPage = validateEditorBlockPageDraft({
  blocks: [],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  title: 'Needs CTA',
})

assert.equal(warningPage.valid, true)
assertIssue(warningPage, 'missing-meta-description')
assertIssue(warningPage, 'missing-hero')
assertIssue(warningPage, 'missing-primary-action')
assert.equal(summarizeBlockPageQuality(warningPage).tone, 'warning')

const invalidPage = validateEditorBlockPageDraft({
  blocks: [
    {
      columns: [
        {
          blocks: [{ html: '<p>Missing id.</p>', type: 'rich-text' }],
          id: 'too-wide-column',
          style: 'bad-style',
          width: 11,
        },
      ],
      id: '',
      type: 'row',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'Invalid page draft.',
  title: 'Invalid Page',
})

assert.equal(invalidPage.valid, false)
assertIssue(invalidPage, 'missing-id')
assertIssue(invalidPage, 'invalid-row-column-width')
assertIssue(invalidPage, 'invalid-style')
assert.equal(summarizeBlockPageQuality(invalidPage).tone, 'error')

const responsiveWarningPage = validateEditorBlockPageDraft({
  blocks: [
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'hero-hidden-all',
      title: 'Hidden Hero',
      type: 'hero',
      visibility: { hideOnDesktop: true, hideOnTablet: true, hideOnMobile: true },
    },
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'cta',
      title: 'Contact',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'A page with a device visibility warning.',
  title: 'Visibility Warning Page',
})

assert.equal(responsiveWarningPage.valid, true)
assertIssue(responsiveWarningPage, 'hidden-on-all-devices')

const backgroundWarningPage = validateEditorBlockPageDraft({
  blocks: [
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'hero',
      title: 'Background Warning',
      type: 'hero',
    },
    {
      html: '<p>Image-backed section.</p>',
      id: 'image-background-block',
      style: {
        background: { focalPoint: 'middle', overlay: 'clear', type: 'image' },
      },
      type: 'rich-text',
    },
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'cta',
      title: 'Contact',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'A page with background image warnings.',
  title: 'Background Warning Page',
})

assert.equal(backgroundWarningPage.valid, true)
assertIssue(backgroundWarningPage, 'unsupported-option')
assertIssue(backgroundWarningPage, 'background-image-no-overlay')

const contentAuditWarningPage = validateEditorBlockPageDraft({
  blocks: [
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'hero',
      title: 'Ready Page',
      type: 'hero',
    },
    {
      html: '<p>Add your text here...</p>',
      id: 'placeholder-rich-text',
      type: 'rich-text',
    },
    {
      action: { label: 'Contact', path: '/contact-us' },
      id: 'cta',
      title: 'Contact',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'A page with placeholder content.',
  title: 'Content Warning Page',
})

assert.equal(contentAuditWarningPage.valid, true)
assertIssue(contentAuditWarningPage, 'empty-block-content')

const invalidResponsivePage = validateEditorBlockPageDraft({
  blocks: [
    {
      columns: [{ blocks: [], id: 'column', width: 1 }],
      id: 'responsive-row',
      responsive: { mobileColumns: 'collapse' },
      type: 'row',
      visibility: { hideOnMobile: 'yes' },
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'Invalid responsive settings.',
  title: 'Invalid Responsive Page',
})

assert.equal(invalidResponsivePage.valid, false)
assertIssue(invalidResponsivePage, 'invalid-boolean')
assertIssue(invalidResponsivePage, 'unsupported-option')

const duplicateAnchorPage = validateEditorBlockPageDraft({
  blocks: [
    { anchorId: 'contact', id: 'contact-one', type: 'contact-form' },
    {
      id: 'group',
      items: [{ blocks: [{ anchorId: 'contact', id: 'contact-two', type: 'contact-form' }], id: 'card' }],
      type: 'group',
    },
  ],
  contentModel: 'block-page',
  ...VALID_PAGE_ROUTE,
  metaDescription: 'A page with duplicate section anchors.',
  title: 'Duplicate Anchor Page',
})

assert.equal(duplicateAnchorPage.valid, false)
assertIssue(duplicateAnchorPage, 'duplicate-block-anchor')

console.log('Page editor validation tests passed.')
