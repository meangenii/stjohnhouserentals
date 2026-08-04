const assert = require('node:assert/strict')
const {
  MAX_BLOCK_ANCHOR_LENGTH,
  MAX_BLOCK_EDITOR_LABEL_LENGTH,
  validateBlockAnchorSettings,
} = require('../src/blockAnchors')

const validBlocks = [
  { anchorId: 'welcome', editorLabel: 'Welcome hero', id: 'hero', type: 'hero' },
  {
    id: 'group',
    items: [{ blocks: [{ anchorId: 'contact', id: 'contact', type: 'contact-form' }], id: 'card' }],
    type: 'group',
  },
]

assert.deepEqual(validateBlockAnchorSettings(validBlocks), [])

const issues = validateBlockAnchorSettings([
  { anchorId: 'rates', id: 'rates', type: 'rate-table' },
  {
    columns: [{ blocks: [{ anchorId: 'rates', id: 'duplicate', type: 'rich-text' }], id: 'column' }],
    id: 'row',
    type: 'row',
  },
  {
    anchorId: `a${'b'.repeat(MAX_BLOCK_ANCHOR_LENGTH)}`,
    editorLabel: 'x'.repeat(MAX_BLOCK_EDITOR_LABEL_LENGTH + 1),
    id: 'invalid',
    type: 'rich-text',
  },
  { anchorId: 'main-content', id: 'reserved', type: 'rich-text' },
])

assert.deepEqual(
  issues.map((issue) => issue.code),
  ['duplicate-block-anchor', 'editor-label-too-long', 'block-anchor-too-long', 'reserved-block-anchor'],
)
assert.deepEqual(issues[0].path, ['blocks', 1, 'columns', 0, 'blocks', 0, 'anchorId'])

console.log('Server block anchor tests passed.')
