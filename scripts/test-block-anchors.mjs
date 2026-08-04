import assert from 'node:assert/strict'
import {
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_EDITOR_LABEL_LENGTH,
  getRenderableBlockAnchorId,
  normalizeBlockAnchorId,
  validateBlockAnchorSettings,
} from '../src/lib/blockAnchors.js'

assert.equal(normalizeBlockAnchorId('#Guest Services'), 'guest-services')
assert.equal(normalizeBlockAnchorId('123 Rates'), 'section-123-rates')
assert.equal(normalizeBlockAnchorId('  Caf\u00e9 & Beach  '), 'cafe-beach')
assert.equal(normalizeBlockAnchorId('site-navigation'), 'section-site-navigation')
assert.equal(normalizeBlockAnchorId(''), '')
assert.ok(normalizeBlockAnchorId('a'.repeat(100)).length <= MAX_BLOCK_ANCHOR_LENGTH)
assert.equal(getRenderableBlockAnchorId('guest-services'), 'guest-services')
assert.equal(getRenderableBlockAnchorId(' Guest Services '), '')
assert.equal(getRenderableBlockAnchorId('  guest-services  '), 'guest-services')
assert.equal(getRenderableBlockAnchorId('main-content'), '')

const validBlocks = [
  { anchorId: 'welcome', editorLabel: 'Welcome hero', id: 'hero', type: 'hero' },
  {
    columns: [
      {
        blocks: [{ anchorId: 'rates', id: 'rates', type: 'rate-table' }],
        id: 'column',
      },
    ],
    id: 'row',
    type: 'row',
  },
  {
    id: 'group',
    items: [{ blocks: [{ anchorId: 'contact', id: 'contact', type: 'contact-form' }], id: 'card' }],
    type: 'group',
  },
]

assert.deepEqual(validateBlockAnchorSettings(validBlocks), [])

const duplicateIssues = validateBlockAnchorSettings([
  { anchorId: 'rates', id: 'top-rates', type: 'rate-table' },
  {
    columns: [{ blocks: [{ anchorId: 'rates', id: 'nested-rates', type: 'rich-text' }], id: 'column' }],
    id: 'row',
    type: 'row',
  },
])

assert.equal(duplicateIssues.length, 1)
assert.equal(duplicateIssues[0].code, 'duplicate-block-anchor')
assert.deepEqual(duplicateIssues[0].path, ['blocks', 1, 'columns', 0, 'blocks', 0, 'anchorId'])

const invalidIssues = validateBlockAnchorSettings([
  { anchorId: 'Invalid Anchor', editorLabel: 12, id: 'invalid', type: 'rich-text' },
  {
    anchorId: `a${'b'.repeat(MAX_BLOCK_ANCHOR_LENGTH)}`,
    editorLabel: 'x'.repeat(MAX_BLOCK_EDITOR_LABEL_LENGTH + 1),
    id: 'too-long',
    type: 'rich-text',
  },
  { anchorId: 'site-navigation', id: 'reserved', type: 'rich-text' },
])

assert.deepEqual(
  invalidIssues.map((issue) => issue.code),
  ['invalid-editor-label', 'invalid-block-anchor', 'editor-label-too-long', 'block-anchor-too-long', 'reserved-block-anchor'],
)

console.log('Block anchor tests passed.')
