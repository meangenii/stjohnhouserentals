import assert from 'node:assert/strict'
import { buildPageDiff } from '../src/lib/pageDiff.js'

const beforePage = {
  blocks: [
    {
      id: 'hero',
      title: 'Old Hero',
      type: 'hero',
    },
    {
      columns: [
        {
          blocks: [
            {
              html: '<p>Old body</p>',
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
      id: 'removed',
      title: 'Removed CTA',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
  group: 'custom',
  metaDescription: 'Old description',
  path: '/old-page',
  routeAliases: ['/older-page'],
  title: 'Old Page',
}

const afterPage = {
  blocks: [
    {
      columns: [
        {
          blocks: [
            {
              html: '<p>New body</p>',
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
      id: 'hero',
      title: 'New Hero',
      type: 'hero',
    },
    {
      id: 'added',
      title: 'Added CTA',
      type: 'cta-band',
    },
  ],
  contentModel: 'block-page',
  group: 'marketing',
  metaDescription: 'New description',
  path: '/new-page',
  routeAliases: ['/legacy-page'],
  title: 'New Page',
}

const diff = buildPageDiff(beforePage, afterPage)

assert.equal(diff.empty, false)
assert.equal(diff.summary.metadata, 5)
assert.equal(diff.summary.added, 1)
assert.equal(diff.summary.removed, 1)
assert.equal(diff.summary.moved, 3)
assert.equal(diff.summary.updated, 2)
assert.ok(diff.changes.some((change) => change.type === 'block-added' && change.blockId === 'added'))
assert.ok(diff.changes.some((change) => change.type === 'block-removed' && change.blockId === 'removed'))
assert.ok(diff.changes.some((change) => change.type === 'block-moved' && change.blockId === 'hero'))
assert.ok(diff.changes.some((change) => change.type === 'block-updated' && change.blockId === 'body'))

const emptyDiff = buildPageDiff(afterPage, JSON.parse(JSON.stringify(afterPage)))
assert.equal(emptyDiff.empty, true)
assert.equal(emptyDiff.totalChanges, 0)

const nonBlockDiff = buildPageDiff({ contentHtml: '<p>Old</p>', contentModel: 'rich-content-page' }, { contentHtml: '<p>New</p>', contentModel: 'rich-content-page' })
assert.equal(nonBlockDiff.summary.content, 1)

console.log('Page diff tests passed.')
