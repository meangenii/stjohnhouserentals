import assert from 'node:assert/strict'
import { collectBlockOutlineEntries } from '../src/lib/blockTree.js'
import {
  findValidationIssueOwner,
  getPageLevelValidationIssues,
  getPageValidationIssues,
  getValidationIssueInspectorTab,
  getValidationIssuePath,
  getValidationIssuesForPath,
  mapValidationIssuesToEntries,
  parseValidationIssuePath,
} from '../src/lib/pageValidationIssues.js'

const blocks = [
  { id: 'hero', title: '', type: 'hero' },
  {
    columns: [
      {
        blocks: [{ html: '', id: 'copy', type: 'rich-text' }],
        id: 'column',
        width: 1,
      },
    ],
    id: 'row',
    type: 'row',
  },
]
const entries = collectBlockOutlineEntries(blocks)
const heroEntry = entries.find((entry) => entry.selectionId === 'hero')
const rowEntry = entries.find((entry) => entry.selectionId === 'row')
const columnEntry = entries.find((entry) => entry.selectionId === 'row-column:column')
const copyEntry = entries.find((entry) => entry.selectionId === 'copy')

const validation = {
  applies: true,
  errors: [
    {
      code: 'invalid-row-column-width',
      message: 'Column width is invalid.',
      path: 'page.blocks[1].columns[0].width',
      pathSegments: ['blocks', 1, 'columns', 0, 'width'],
    },
  ],
  warnings: [
    { code: 'missing-heading-text', message: 'Hero title is missing.', path: 'page.blocks[0].title' },
    { code: 'empty-block-content', message: 'Copy is empty.', path: 'page.blocks[1].columns[0].blocks[0].html' },
    { code: 'invalid-row-column-count', message: 'Row needs columns.', path: 'page.blocks[1].columns' },
    { code: 'missing-meta-description', message: 'Description is missing.', path: 'page.metaDescription' },
  ],
}

assert.deepEqual(parseValidationIssuePath('page.blocks[1].columns[0].width'), ['blocks', 1, 'columns', 0, 'width'])
assert.deepEqual(getValidationIssuePath(validation.errors[0]), ['blocks', 1, 'columns', 0, 'width'])
assert.equal(getPageValidationIssues(validation)[0].severity, 'error')
assert.equal(findValidationIssueOwner(validation.errors[0], entries), columnEntry)
assert.equal(findValidationIssueOwner(validation.warnings[0], entries), heroEntry)
assert.equal(findValidationIssueOwner(validation.warnings[1], entries), copyEntry)
assert.equal(findValidationIssueOwner(validation.warnings[2], entries), rowEntry)
assert.equal(findValidationIssueOwner(validation.warnings[3], entries), null)

const issueMap = mapValidationIssuesToEntries(validation, entries)
assert.equal(issueMap.get(columnEntry.selectionId).errors.length, 1)
assert.equal(issueMap.get(heroEntry.selectionId).warnings.length, 1)
assert.equal(issueMap.get(copyEntry.selectionId).warnings.length, 1)
assert.equal(getPageLevelValidationIssues(validation, entries).length, 1)

const normalizedIssues = getPageValidationIssues(validation)
assert.equal(getValidationIssuesForPath(normalizedIssues, ['blocks', 0, 'title']).length, 1)
assert.equal(getValidationIssuesForPath(normalizedIssues, ['blocks', 1, 'columns', 0]).length, 0)
assert.equal(
  getValidationIssuesForPath(normalizedIssues, ['blocks', 1, 'columns', 0], { includeDescendants: true }).length,
  2,
)

assert.equal(getValidationIssueInspectorTab(validation.errors[0], columnEntry), 'layout')
assert.equal(getValidationIssueInspectorTab(validation.warnings[0], heroEntry), 'content')
assert.equal(
  getValidationIssueInspectorTab({ pathSegments: ['blocks', 0, 'style', 'width'] }, heroEntry),
  'style',
)
assert.equal(
  getValidationIssueInspectorTab({ pathSegments: ['blocks', 0, 'anchorId'] }, heroEntry),
  'settings',
)

console.log('Page validation issue mapping tests passed.')
