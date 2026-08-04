import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  BLOCK_COLLECTION_ITEM_KEYS,
  BLOCK_TYPES,
  createBlockCollectionItem,
  createBlockDefaultData,
  createBlockRecord,
} from '../src/lib/blockDefaults.js'
import { getBlockInspectorFields } from '../src/lib/blockInspectorSchema.js'
import { getBlockDefinitionVersion } from '../src/lib/blockContract.js'
import { validateBlockContentRecord } from '../src/lib/blockContentValidation.js'
import { validateEditorBlockPageDraft } from '../src/lib/blockPageValidation.js'

const require = createRequire(import.meta.url)
const { SUPPORTED_BLOCK_TYPES, validateBlockPageDraft } = require('../functions/src/blockPageSchema.js')

function makeIdFactory(prefix) {
  let sequence = 0
  return () => `${prefix}-${++sequence}`
}

assert.deepEqual([...BLOCK_TYPES].sort(), [...SUPPORTED_BLOCK_TYPES].sort(), 'Client block defaults and server schema must support the same block types.')
assert.equal(createBlockDefaultData('unknown-block'), null)
assert.equal(createBlockRecord('unknown-block'), null)

BLOCK_TYPES.forEach((type) => {
  const firstDefaults = createBlockDefaultData(type, { makeId: makeIdFactory(`${type}-first`) })
  const secondDefaults = createBlockDefaultData(type, { makeId: makeIdFactory(`${type}-second`) })

  assert.notStrictEqual(firstDefaults, secondDefaults, `${type} defaults must return a new object.`)

  const record = createBlockRecord(type, { makeId: makeIdFactory(type) })
  assert.equal(record.type, type)
  assert.equal(record.version, getBlockDefinitionVersion(type))
  assert.ok(record.id, `${type} must receive a stable block id.`)

  const page = {
    blocks: [record],
    contentModel: 'block-page',
    group: 'custom',
    metaDescription: `Default ${type} block fixture.`,
    navLabel: `Default ${type}`,
    path: `/default-${type}`,
    routeAliases: [],
    title: `Default ${type}`,
  }
  const clientValidation = validateEditorBlockPageDraft(page)
  const serverValidation = validateBlockPageDraft(page)

  assert.equal(clientValidation.valid, true, `${type} defaults must pass client structural validation.`)
  assert.equal(serverValidation.valid, true, `${type} defaults must pass server structural validation.`)
})

const row = createBlockRecord('row', { makeId: makeIdFactory('row-contract') })
const rowIds = [row.id, ...row.columns.map((column) => column.id)]
assert.equal(new Set(rowIds).size, rowIds.length, 'Default row block and column ids must be unique.')

const firstHero = createBlockDefaultData('hero')
const secondHero = createBlockDefaultData('hero')
firstHero.action.label = 'Changed'
assert.equal(secondHero.action.label, '', 'Nested defaults must not share mutable state.')

const expectedCollectionKeys = [
  'business-list.items',
  'contact-details.items',
  'feature-grid.items',
  'group.items',
  'image-gallery.images',
  'rate-table.rows',
  'schedule.columns',
  'testimonials.items',
]

assert.deepEqual([...BLOCK_COLLECTION_ITEM_KEYS].sort(), expectedCollectionKeys)

BLOCK_COLLECTION_ITEM_KEYS.forEach((key) => {
  const separatorIndex = key.lastIndexOf('.')
  const type = key.slice(0, separatorIndex)
  const collection = key.slice(separatorIndex + 1)
  const first = createBlockCollectionItem(type, collection, { makeId: makeIdFactory(`${key}-first`) })
  const second = createBlockCollectionItem(type, collection, { makeId: makeIdFactory(`${key}-second`) })
  const inspectorField = getBlockInspectorFields(type).find((field) => field.widget === 'objectList' && field.path.join('.') === collection)
  const canonicalForInspector = createBlockCollectionItem(type, collection, { makeId: makeIdFactory(`${key}-inspector`) })
  const inspectorItem = inspectorField?.makeItem({ makeId: makeIdFactory(`${key}-inspector`) })

  assert.ok(first && typeof first === 'object' && !Array.isArray(first), `${key} must create an object.`)
  assert.notStrictEqual(first, second, `${key} must create isolated objects.`)
  assert.ok(first.id && second.id, `${key} must create stable item ids.`)
  assert.deepEqual(inspectorItem, canonicalForInspector, `${key} Inspector additions must use the canonical factory.`)

  const block = createBlockRecord(type, { makeId: makeIdFactory(`${key}-block`) })
  block[collection] = [first]
  assert.deepEqual(validateBlockContentRecord(block, type).errors, [], `${key} factory output must satisfy the content contract.`)
})

assert.equal(createBlockCollectionItem('hero', 'missing'), null)

console.log(`Block default contract tests passed for ${BLOCK_TYPES.length} block types and ${BLOCK_COLLECTION_ITEM_KEYS.length} repeating item factories.`)
