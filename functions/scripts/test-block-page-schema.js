const assert = require('node:assert/strict')
const {
  MAX_ROW_COLUMN_WIDTH,
  MAX_STRUCTURAL_NESTING_DEPTH,
  formatBlockPageValidationErrors,
  validateBlockPageDraft,
} = require('../src/blockPageSchema')

function assertValid(page, message) {
  const validation = validateBlockPageDraft(page)

  assert.equal(validation.valid, true, `${message}: ${formatBlockPageValidationErrors(validation.errors)}`)
  return validation
}

function assertInvalid(page, expectedCode, message) {
  const validation = validateBlockPageDraft(page)

  assert.equal(validation.valid, false, message)
  assert.ok(validation.errors.some((error) => error.code === expectedCode), `Expected validation code "${expectedCode}".`)
  return validation
}

const emptyPageValidation = assertValid(
  {
    blocks: [],
    contentModel: 'block-page',
    group: 'custom',
    navLabel: 'Future Page',
    path: '/future-page',
    title: 'Future Page',
  },
  'empty future page drafts should be valid',
)

assert.deepEqual(emptyPageValidation.normalizedPage.blocks, [])

const validNestedPage = assertValid(
  {
    blocks: [
      {
        columns: [
          {
            blocks: [
              {
                id: 'block-rich-text',
                html: '<p>Body</p>',
                style: {
                  align: 'sideways',
                  background: { color: '#ffffff', type: 'color' },
                  spacing: 'large',
                  width: 'contained',
                },
                type: 'rich-text',
              },
            ],
            id: 'column-primary',
            width: '2',
          },
          {
            blocks: [
              {
                id: 'block-directory',
                source: 'charters',
                title: 'Charters',
                type: 'directory-embed',
              },
            ],
            id: 'column-secondary',
            width: 1,
          },
        ],
        id: 'block-row',
        responsive: { mobileColumns: 'preserve' },
        type: 'row',
      },
    ],
    contentModel: 'block-page',
  },
  'nested rows and content blocks should be valid',
)

assert.equal(validNestedPage.normalizedPage.blocks[0].version, 1)
assert.equal(validNestedPage.normalizedPage.blocks[0].responsive.mobileColumns, 'preserve')
assert.equal(validNestedPage.normalizedPage.blocks[0].columns[0].width, 2)
assert.equal(validNestedPage.normalizedPage.blocks[0].columns[0].blocks[0].style.align, 'left')
assert.equal(validNestedPage.warnings.length, 1)

const normalizedIdentityPage = assertValid(
  {
    blocks: [{ anchorId: '  guest-services  ', editorLabel: '  Guest services  ', id: 'identity', type: 'rich-text' }],
    contentModel: 'block-page',
  },
  'block editor labels and anchors should be trimmed on the server',
)

assert.equal(normalizedIdentityPage.normalizedPage.blocks[0].anchorId, 'guest-services')
assert.equal(normalizedIdentityPage.normalizedPage.blocks[0].editorLabel, 'Guest services')

assertInvalid(
  {
    blocks: [
      { anchorId: 'details', id: 'details-one', type: 'rich-text' },
      {
        columns: [{ blocks: [{ anchorId: 'details', id: 'details-two', type: 'rich-text' }], id: 'column', width: 1 }],
        id: 'row',
        type: 'row',
      },
    ],
    contentModel: 'block-page',
  },
  'duplicate-block-anchor',
  'section anchors must be unique across nested blocks',
)

const responsiveWarningPage = assertValid(
  {
    blocks: [
      {
        columns: [{ blocks: [], id: 'column', width: 1 }],
        id: 'block-responsive-warning',
        responsive: { mobileColumns: 'collapse' },
        type: 'row',
        visibility: { hideOnDesktop: true, hideOnTablet: true, hideOnMobile: true },
      },
    ],
    contentModel: 'block-page',
  },
  'unsupported responsive options should normalize without making the draft unsavable',
)

assert.equal(responsiveWarningPage.normalizedPage.blocks[0].responsive.mobileColumns, 'stack')
assert.ok(responsiveWarningPage.warnings.some((warning) => warning.code === 'unsupported-option'))
assert.ok(responsiveWarningPage.warnings.some((warning) => warning.code === 'hidden-on-all-devices'))

const backgroundWarningPage = assertValid(
  {
    blocks: [
      {
        html: '<p>Image-backed section.</p>',
        id: 'block-background-warning',
        style: {
          background: { focalPoint: 'middle', overlay: 'clear', type: 'image' },
        },
        type: 'rich-text',
      },
    ],
    contentModel: 'block-page',
  },
  'background image style options should normalize without making the draft unsavable',
)

assert.equal(backgroundWarningPage.normalizedPage.blocks[0].style.background.focalPoint, 'center')
assert.equal(backgroundWarningPage.normalizedPage.blocks[0].style.background.overlay, 'none')
assert.ok(backgroundWarningPage.warnings.some((warning) => warning.path === 'page.blocks[0].style.background.focalPoint'))
assert.ok(backgroundWarningPage.warnings.some((warning) => warning.path === 'page.blocks[0].style.background.overlay'))
assert.ok(backgroundWarningPage.warnings.some((warning) => warning.code === 'background-image-no-overlay'))

assertInvalid(
  {
    blocks: [{ id: 'block-unknown', type: 'unsupported-block' }],
    contentModel: 'block-page',
  },
  'unsupported-block-type',
  'unsupported block types should fail validation',
)

assertInvalid(
  {
    blocks: [{ html: '<p>Missing id</p>', type: 'rich-text' }],
    contentModel: 'block-page',
  },
  'missing-id',
  'blocks require stable ids',
)

assertInvalid(
  {
    blocks: [{ html: '<p>Bad visibility</p>', id: 'bad-visibility', type: 'rich-text', visibility: { hideOnDesktop: 'yes' } }],
    contentModel: 'block-page',
  },
  'invalid-boolean',
  'device visibility flags must be boolean values',
)

assertInvalid(
  {
    blocks: [
      {
        columns: [
          {
            blocks: [],
            id: 'column-too-wide',
            width: MAX_ROW_COLUMN_WIDTH + 1,
          },
        ],
        id: 'block-row',
        type: 'row',
      },
    ],
    contentModel: 'block-page',
  },
  'invalid-row-column-width',
  'row column width must stay inside the editor-supported range',
)

assertInvalid(
  {
    blocks: [
      {
        columns: [
          {
            blocks: [
              {
                columns: [
                  {
                    blocks: [
                      {
                        columns: [
                          {
                            blocks: [
                              {
                                columns: [{ blocks: [], id: 'column-depth-4', width: 1 }],
                                id: 'block-depth-4',
                                type: 'row',
                              },
                            ],
                            id: 'column-depth-3',
                            width: 1,
                          },
                        ],
                        id: 'block-depth-3',
                        type: 'row',
                      },
                    ],
                    id: 'column-depth-2',
                    width: 1,
                  },
                ],
                id: 'block-depth-2',
                type: 'row',
              },
            ],
            id: 'column-depth-1',
            width: 1,
          },
        ],
        id: 'block-depth-1',
        type: 'row',
      },
    ],
    contentModel: 'block-page',
  },
  'max-structural-depth',
  'structural blocks cannot exceed the configured nesting depth',
)

console.log('Block page schema tests passed.')
