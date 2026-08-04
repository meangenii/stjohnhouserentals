import assert from 'node:assert/strict'
import {
  collectBlockOutlineEntries,
  duplicateBlockAtPath,
  findBlockOutlineEntry,
  getBlockCommandState,
  getBlockValueAtPath,
  makeBlockTreeSelectionId,
  moveBlockAtPath,
  removeBlockAtPath,
} from '../src/lib/blockTree.js'

const page = {
  blocks: [
    { anchorId: 'welcome', editorLabel: 'Opening section', hidden: true, id: 'hero-1', title: 'Landing Hero', type: 'hero' },
    {
      columns: [
        {
          blocks: [{ anchorId: 'column-copy', html: '<p>Column copy</p>', id: 'rich-1', type: 'rich-text' }],
          id: 'column-1',
          width: 1,
        },
        {
          blocks: [],
          id: 'column-2',
          width: 1,
        },
      ],
      id: 'row-1',
      type: 'row',
    },
    {
      id: 'group-1',
      items: [
        {
            blocks: [{ anchorId: 'book-now', id: 'cta-1', title: 'Book now', type: 'cta-band' }],
          id: 'card-1',
          title: 'Primary Card',
        },
      ],
      type: 'group',
    },
  ],
}

const labels = {
  'cta-band': 'Call-to-Action Band',
  group: 'Repeating Cards',
  hero: 'Hero Banner',
  'rich-text': 'Rich Text',
  row: 'Columns',
}

const entries = collectBlockOutlineEntries(page.blocks, {
  resolveBlockLabel: (type) => labels[type],
})

assert.equal(entries.length, 8)
assert.deepEqual(
  entries.map((entry) => entry.kind),
  ['block', 'block', 'row-column', 'block', 'row-column', 'block', 'group-item', 'block'],
)

const heroEntry = findBlockOutlineEntry(entries, 'hero-1')
assert.equal(heroEntry.label, 'Opening section')
assert.equal(heroEntry.summary, 'Landing Hero')
assert.equal(heroEntry.hidden, true)
assert.deepEqual(heroEntry.path, ['blocks', 0])

const nestedRichTextEntry = findBlockOutlineEntry(entries, 'rich-1')
assert.equal(nestedRichTextEntry.depth, 2)
assert.deepEqual(nestedRichTextEntry.path, ['blocks', 1, 'columns', 0, 'blocks', 0])
assert.equal(getBlockValueAtPath(page, nestedRichTextEntry.path).html, '<p>Column copy</p>')

const groupItem = entries.find((entry) => entry.kind === 'group-item')
assert.equal(groupItem.label, 'Primary Card')
assert.equal(groupItem.childCount, 1)
assert.equal(groupItem.nodeId, 'card-1')
assert.equal(groupItem.selectionId, 'group-item:card-1')

const rowColumn = entries.find((entry) => entry.kind === 'row-column')
assert.equal(rowColumn.nodeId, 'column-1')
assert.equal(rowColumn.selectionId, 'row-column:column-1')
assert.equal(findBlockOutlineEntry(entries, rowColumn.selectionId), rowColumn)
assert.equal(findBlockOutlineEntry(entries, groupItem.selectionId), groupItem)

assert.equal(makeBlockTreeSelectionId('block', 'hero-1'), 'hero-1')
assert.equal(makeBlockTreeSelectionId('row-column', 'column-1'), 'row-column:column-1')
assert.equal(makeBlockTreeSelectionId('group-item', ''), '')

assert.equal(findBlockOutlineEntry(entries, 'missing-block'), null)

const firstBlockCommands = getBlockCommandState(page, ['blocks', 0])
assert.equal(firstBlockCommands.canDelete, true)
assert.equal(firstBlockCommands.canDuplicate, true)
assert.equal(firstBlockCommands.canMoveUp, false)
assert.equal(firstBlockCommands.canMoveDown, true)

const onlyNestedBlockCommands = getBlockCommandState(page, ['blocks', 1, 'columns', 0, 'blocks', 0])
assert.equal(onlyNestedBlockCommands.canMoveUp, false)
assert.equal(onlyNestedBlockCommands.canMoveDown, false)

assert.equal(getBlockCommandState(page, ['blocks', 99]).canDelete, false)

let idCounter = 0
const makeDeterministicId = () => `fresh-${(idCounter += 1)}`

const duplicateNestedResult = duplicateBlockAtPath(page, ['blocks', 1, 'columns', 0, 'blocks', 0], { makeId: makeDeterministicId })
assert.equal(duplicateNestedResult.page.blocks[1].columns[0].blocks.length, 2)
assert.equal(duplicateNestedResult.page.blocks[1].columns[0].blocks[1].id, 'fresh-1')
assert.equal(duplicateNestedResult.page.blocks[1].columns[0].blocks[1].anchorId, undefined)
assert.equal(duplicateNestedResult.selectedBlockId, 'fresh-1')

const duplicateRowResult = duplicateBlockAtPath(page, ['blocks', 1], { makeId: makeDeterministicId })
assert.equal(duplicateRowResult.page.blocks.length, 4)
assert.equal(duplicateRowResult.page.blocks[2].id, 'fresh-2')
assert.equal(duplicateRowResult.page.blocks[2].columns[0].id, 'fresh-3')
assert.equal(duplicateRowResult.page.blocks[2].columns[0].blocks[0].id, 'fresh-4')
assert.equal(duplicateRowResult.page.blocks[2].columns[0].blocks[0].anchorId, undefined)
assert.notEqual(duplicateRowResult.page.blocks[2].columns[0].blocks[0].id, 'rich-1')

const moveResult = moveBlockAtPath(page, ['blocks', 2], -1)
assert.deepEqual(
  moveResult.page.blocks.map((block) => block.id),
  ['hero-1', 'group-1', 'row-1'],
)
assert.equal(moveResult.selectedBlockId, 'group-1')

const removeResult = removeBlockAtPath(page, ['blocks', 1])
assert.deepEqual(
  removeResult.page.blocks.map((block) => block.id),
  ['hero-1', 'group-1'],
)
assert.equal(removeResult.selectedBlockId, 'group-1')

assert.equal(page.blocks.length, 3)
assert.equal(page.blocks[1].id, 'row-1')
assert.equal(moveBlockAtPath(page, ['blocks', 0], -1), null)
assert.equal(removeBlockAtPath(page, ['blocks', 99]), null)

console.log('Block tree tests passed.')
