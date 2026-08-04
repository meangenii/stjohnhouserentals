import assert from 'node:assert/strict'
import {
  getPageEditorHistoryStatus,
  recordPageEditorHistory,
  redoPageEditorHistory,
  resetPageEditorHistory,
  undoPageEditorHistory,
} from '../src/lib/pageEditorHistory.js'

const draftA = { blocks: [{ id: 'hero-1', title: 'A', type: 'hero' }], contentModel: 'block-page' }
const draftB = { blocks: [{ id: 'hero-1', title: 'B', type: 'hero' }], contentModel: 'block-page' }
const draftC = { blocks: [{ id: 'hero-1', title: 'C', type: 'hero' }], contentModel: 'block-page' }

let history = resetPageEditorHistory('page-a')
assert.deepEqual(getPageEditorHistoryStatus(history, 'page-a'), { canRedo: false, canUndo: false })

history = recordPageEditorHistory(history, {
  activeKey: 'page-a',
  nextDraft: draftA,
  previousDraft: draftA,
})
assert.deepEqual(getPageEditorHistoryStatus(history, 'page-a'), { canRedo: false, canUndo: false })

history = recordPageEditorHistory(history, {
  activeKey: 'page-a',
  nextDraft: draftB,
  previousDraft: draftA,
})
assert.deepEqual(getPageEditorHistoryStatus(history, 'page-a'), { canRedo: false, canUndo: true })
assert.equal(history.past[0].draft.blocks[0].title, 'A')

const undoResult = undoPageEditorHistory(history, {
  activeKey: 'page-a',
  currentDraft: draftB,
})
assert.equal(undoResult.changed, true)
assert.equal(undoResult.draft.blocks[0].title, 'A')
assert.deepEqual(getPageEditorHistoryStatus(undoResult.history, 'page-a'), { canRedo: true, canUndo: false })

const redoResult = redoPageEditorHistory(undoResult.history, {
  activeKey: 'page-a',
  currentDraft: undoResult.draft,
})
assert.equal(redoResult.changed, true)
assert.equal(redoResult.draft.blocks[0].title, 'B')
assert.deepEqual(getPageEditorHistoryStatus(redoResult.history, 'page-a'), { canRedo: false, canUndo: true })

const undoBeforeBranch = undoPageEditorHistory(redoResult.history, {
  activeKey: 'page-a',
  currentDraft: redoResult.draft,
})
const branchedHistory = recordPageEditorHistory(undoBeforeBranch.history, {
  activeKey: 'page-a',
  nextDraft: draftC,
  previousDraft: undoBeforeBranch.draft,
})
assert.deepEqual(getPageEditorHistoryStatus(branchedHistory, 'page-a'), { canRedo: false, canUndo: true })

const changedPageStatus = getPageEditorHistoryStatus(branchedHistory, 'page-b')
assert.deepEqual(changedPageStatus, { canRedo: false, canUndo: false })

let limitedHistory = resetPageEditorHistory('limited')
for (let index = 0; index < 5; index += 1) {
  limitedHistory = recordPageEditorHistory(limitedHistory, {
    activeKey: 'limited',
    limit: 3,
    nextDraft: { value: index + 1 },
    previousDraft: { value: index },
  })
}
assert.equal(limitedHistory.past.length, 3)
assert.deepEqual(
  limitedHistory.past.map((entry) => entry.draft.value),
  [2, 3, 4],
)

let coalescedHistory = resetPageEditorHistory('coalesced')
coalescedHistory = recordPageEditorHistory(coalescedHistory, {
  activeKey: 'coalesced',
  coalesce: true,
  nextDraft: { title: 'A' },
  path: ['title'],
  previousDraft: { title: '' },
  timestamp: 1000,
})
coalescedHistory = recordPageEditorHistory(coalescedHistory, {
  activeKey: 'coalesced',
  coalesce: true,
  nextDraft: { title: 'AB' },
  path: ['title'],
  previousDraft: { title: 'A' },
  timestamp: 1200,
})
assert.equal(coalescedHistory.past.length, 1, 'Typing in one field should coalesce into one undo transaction.')
assert.equal(coalescedHistory.past[0].before, '')
assert.equal(coalescedHistory.past[0].after, 'AB')

const coalescedUndo = undoPageEditorHistory(coalescedHistory, {
  activeKey: 'coalesced',
  currentDraft: { title: 'AB' },
})
assert.equal(coalescedUndo.draft.title, '')
const coalescedRedo = redoPageEditorHistory(coalescedUndo.history, {
  activeKey: 'coalesced',
  currentDraft: coalescedUndo.draft,
})
assert.equal(coalescedRedo.draft.title, 'AB')

const separateFieldHistory = recordPageEditorHistory(coalescedHistory, {
  activeKey: 'coalesced',
  coalesce: true,
  nextDraft: { subtitle: 'B', title: 'AB' },
  path: ['subtitle'],
  previousDraft: { subtitle: '', title: 'AB' },
  timestamp: 1250,
})
assert.equal(separateFieldHistory.past.length, 2, 'Different fields must remain separate undo transactions.')

console.log('Page editor history tests passed.')
