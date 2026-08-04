const assert = require('node:assert/strict')
const {
  DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT,
  MAX_STRUCTURED_PAGE_REVISION_LIMIT,
  createStructuredPageRevisionRecord,
  normalizeRevisionLimit,
  selectStaleStructuredPageRevisions,
  summarizeStructuredPageRevision,
} = require('../src/siteContentRevisionHistory')

const sourcePage = {
  blocks: [
    {
      id: 'hero',
      title: 'Future Page',
      type: 'hero',
    },
    {
      columns: [
        {
          blocks: [
            {
              html: '<p>Body copy.</p>',
              id: 'body',
              type: 'rich-text',
            },
          ],
          id: 'column',
          width: 1,
        },
      ],
      id: 'row',
      type: 'row',
    },
    {
      id: 'group',
      items: [
        {
          blocks: [
            {
              id: 'card',
              type: 'image',
            },
          ],
          id: 'item',
        },
      ],
      type: 'group',
    },
  ],
  contentModel: 'block-page',
  key: 'future-page',
  path: '/future-page',
  title: 'Future Page',
}

const record = createStructuredPageRevisionRecord({
  action: 'publish',
  actor: 'editor@example.com',
  createdAt: 123,
  page: sourcePage,
})

sourcePage.title = 'Mutated Outside Record'

assert.equal(record.action, 'publish')
assert.equal(record.actor, 'editor@example.com')
assert.equal(record.blockCount, 5)
assert.equal(record.createdAt, 123)
assert.equal(record.page.title, 'Future Page')
assert.equal(record.pageKey, 'future-page')
assert.equal(record.pagePath, '/future-page')
assert.equal(record.pageTitle, 'Future Page')
assert.equal(Object.hasOwn(record, 'restoredFrom'), false)

const restoredRecord = createStructuredPageRevisionRecord({
  action: 'restore',
  actor: '',
  page: record.page,
  restoredFrom: 'abc123',
})

assert.equal(restoredRecord.action, 'restore')
assert.equal(restoredRecord.actor, 'admin')
assert.equal(restoredRecord.restoredFrom, 'abc123')

const fallbackRecord = createStructuredPageRevisionRecord({
  action: 'unsupported',
  page: {
    blocks: [],
    key: 'untitled',
  },
})

assert.equal(fallbackRecord.action, 'save')
assert.equal(fallbackRecord.pageTitle, 'untitled')

assert.equal(normalizeRevisionLimit(), DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT)
assert.equal(normalizeRevisionLimit('0'), DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT)
assert.equal(normalizeRevisionLimit('-10'), DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT)
assert.equal(normalizeRevisionLimit('12'), 12)
assert.equal(normalizeRevisionLimit(999), MAX_STRUCTURED_PAGE_REVISION_LIMIT)

const orderedRevisionIds = Array.from({ length: MAX_STRUCTURED_PAGE_REVISION_LIMIT + 5 }, (_, index) => `revision-${index}`)
assert.deepEqual(selectStaleStructuredPageRevisions(orderedRevisionIds), orderedRevisionIds.slice(MAX_STRUCTURED_PAGE_REVISION_LIMIT))
assert.deepEqual(selectStaleStructuredPageRevisions(orderedRevisionIds, 12), orderedRevisionIds.slice(12))
assert.deepEqual(selectStaleStructuredPageRevisions(null), [])

const summary = summarizeStructuredPageRevision('revision-id', {
  ...record,
  createdAt: {
    _nanoseconds: 500000000,
    _seconds: 2,
  },
})

assert.equal(summary.id, 'revision-id')
assert.equal(summary.action, 'publish')
assert.equal(summary.blockCount, 5)
assert.equal(summary.createdAt, 2500)
assert.equal(summary.pageKey, 'future-page')
assert.equal(summary.pagePath, '/future-page')
assert.equal(summary.pageTitle, 'Future Page')
assert.equal(Object.hasOwn(summary, 'page'), false)

assert.throws(
  () =>
    createStructuredPageRevisionRecord({
      page: null,
    }),
  /page snapshot/,
)

console.log('Site content revision history tests passed.')
