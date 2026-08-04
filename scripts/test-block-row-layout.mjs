import assert from 'node:assert/strict'
import {
  applyRowLayoutPreset,
  getRowLayoutPresetId,
  MAX_ROW_COLUMN_WIDTH,
  moveRowColumn,
  ROW_LAYOUT_PRESETS,
} from '../src/lib/blockRowLayout.js'

assert.equal(ROW_LAYOUT_PRESETS.length, 6)
assert.equal(MAX_ROW_COLUMN_WIDTH, 10)
assert.equal(getRowLayoutPresetId([{ width: 1 }, { width: 2 }]), '2-narrow-wide')
assert.equal(getRowLayoutPresetId([{ width: 1.5 }, { width: 1 }]), '')
assert.equal(getRowLayoutPresetId(null), '')

const sourceColumns = [
  { blocks: [{ id: 'one', type: 'rich-text' }], id: 'column-one', width: 1 },
  { blocks: [{ id: 'two', type: 'rich-text' }], id: 'column-two', width: 1 },
  { blocks: [{ id: 'three', type: 'rich-text' }], id: 'column-three', width: 1 },
  { blocks: [{ id: 'four', type: 'rich-text' }], id: 'column-four', width: 1 },
]

const reduced = applyRowLayoutPreset(sourceColumns, '2-wide-narrow')
assert.equal(reduced.columns.length, 2)
assert.deepEqual(
  reduced.columns[1].blocks.map((block) => block.id),
  ['two', 'three', 'four'],
)
assert.equal(reduced.columns[0].id, 'column-one')
assert.equal(reduced.columns[1].id, 'column-two')
assert.equal(reduced.columns[0].width, 2)
assert.equal(reduced.columns[1].width, 1)
assert.equal(reduced.mergedBlockCount, 2)
assert.equal(reduced.removedColumnCount, 2)
assert.equal(sourceColumns.length, 4)
assert.deepEqual(sourceColumns[1].blocks.map((block) => block.id), ['two'])

let idCounter = 0
const expanded = applyRowLayoutPreset(sourceColumns.slice(0, 1), '3-equal', { makeId: () => `new-column-${(idCounter += 1)}` })
assert.deepEqual(
  expanded.columns.map((column) => column.id),
  ['column-one', 'new-column-1', 'new-column-2'],
)
assert.deepEqual(expanded.columns.map((column) => column.width), [1, 1, 1])
assert.deepEqual(expanded.columns[1].blocks, [])

assert.equal(applyRowLayoutPreset(sourceColumns, 'missing'), null)
assert.deepEqual(
  moveRowColumn(sourceColumns, 2, -1).map((column) => column.id),
  ['column-one', 'column-three', 'column-two', 'column-four'],
)
assert.equal(moveRowColumn(sourceColumns, 0, -1), null)
assert.equal(moveRowColumn(sourceColumns, 3, 1), null)

console.log('Block row layout tests passed.')
