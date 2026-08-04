import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { BLOCK_CONTENT_SCHEMAS, BLOCK_TYPES } from '../src/lib/blockContract.js'
import { validateBlockContentRecord } from '../src/lib/blockContentValidation.js'
import { createBlockRecord } from '../src/lib/blockDefaults.js'
import { validateEditorBlockPageDraft } from '../src/lib/blockPageValidation.js'

const require = createRequire(import.meta.url)
const { validateBlockContentRecord: validateServerBlockContentRecord } = require('../functions/src/blockContentValidation.js')
const { validateBlockPageDraft } = require('../functions/src/blockPageSchema.js')

const SUPPORTED_SCHEMA_TYPES = new Set([
  'array',
  'blocks',
  'boolean',
  'color',
  'enum',
  'id',
  'idArray',
  'image',
  'link',
  'nullableNumber',
  'number',
  'numeric',
  'object',
  'string',
])

function makeIdFactory(prefix) {
  let sequence = 0
  return () => `${prefix}-${++sequence}`
}

function validateDescriptor(descriptor, context) {
  assert.ok(descriptor && typeof descriptor === 'object' && !Array.isArray(descriptor), `${context} must be an object.`)
  assert.ok(SUPPORTED_SCHEMA_TYPES.has(descriptor.type), `${context} uses unsupported type "${descriptor.type}".`)

  if (descriptor.type === 'enum') {
    assert.ok(Array.isArray(descriptor.options) && descriptor.options.length > 0, `${context} enum options are required.`)
    assert.equal(new Set(descriptor.options).size, descriptor.options.length, `${context} enum options must be unique.`)
  }

  if (descriptor.type === 'array') {
    validateDescriptor(descriptor.items, `${context}.items`)
  }

  if (['link', 'object'].includes(descriptor.type)) {
    Object.entries(descriptor.fields ?? {}).forEach(([fieldName, fieldDescriptor]) => {
      validateDescriptor(fieldDescriptor, `${context}.fields.${fieldName}`)
    })
  }

  if (descriptor.type === 'idArray' && descriptor.alignedWith != null) {
    assert.equal(typeof descriptor.alignedWith, 'string', `${context}.alignedWith must be a field name.`)
    assert.ok(descriptor.alignedWith.trim(), `${context}.alignedWith must not be empty.`)
  }
}

function assertParity(block, message) {
  const client = validateBlockContentRecord(block, block.type)
  const server = validateServerBlockContentRecord(block, block.type)

  assert.deepEqual(server, client, `${message}: client and server content validation must agree.`)
  return client
}

Object.entries(BLOCK_CONTENT_SCHEMAS).forEach(([type, fields]) => {
  assert.ok(BLOCK_TYPES.includes(type), `${type} must be a supported block type.`)
  Object.entries(fields).forEach(([fieldName, descriptor]) => validateDescriptor(descriptor, `${type}.${fieldName}`))

  const defaults = createBlockRecord(type, { makeId: makeIdFactory(`default-${type}`) })
  const defaultValidation = assertParity(defaults, `${type} defaults`)
  assert.deepEqual(defaultValidation.errors, [], `${type} defaults must satisfy the content contract.`)
  assert.deepEqual(defaultValidation.warnings, [], `${type} defaults must not contain unsupported fields.`)

  Object.keys(defaults)
    .filter((fieldName) => !['id', 'type', 'version'].includes(fieldName))
    .forEach((fieldName) => {
      assert.ok(fields[fieldName], `${type}.${fieldName} defaults must be declared in the content contract.`)
    })
})

const validNestedBlocks = [
  {
    id: 'feature-grid',
    items: [{ body: 'Body', id: 'feature-1', kind: 'check', title: 'Feature' }],
    title: 'Features',
    type: 'feature-grid',
  },
  {
    id: 'gallery',
    images: [{ alt: 'Beach', decorative: false, height: null, id: 'gallery-1', kind: 'image', originalWidth: 1200, title: '', url: '/media/beach.jpg' }],
    type: 'image-gallery',
  },
  {
    id: 'details',
    items: [{ href: 'https://example.com', id: 'detail-1', label: 'Website', linkType: 'external', openInNewTab: true, type: 'link', value: 'Visit' }],
    type: 'contact-details',
  },
  {
    columns: [{ heading: 'Morning', id: 'column-1', timeIds: ['time-1'], times: ['9:00'] }],
    id: 'schedule',
    noteIds: ['note-1'],
    notes: ['Weekdays'],
    title: 'Schedule',
    type: 'schedule',
  },
  {
    footer: ['Taxes apply'],
    footerIds: ['footer-1'],
    heading: 'Rates',
    id: 'rates',
    link: { label: 'Details', linkType: 'external', path: 'https://example.com' },
    rows: [{ id: 'row-1', label: 'Daily', valueIds: ['value-1'], values: ['$100'] }],
    type: 'rate-table',
  },
  {
    id: 'group',
    items: [{ blocks: [], id: 'card-1', image: { kind: 'image' }, style: { spacing: 'small' }, title: 'Card' }],
    type: 'group',
  },
  {
    columns: [{ blocks: [], id: 'column-1', style: { spacing: 'small' }, width: '2' }],
    id: 'row',
    type: 'row',
  },
  {
    id: 'businesses',
    items: [{ id: 'business-1', name: 'Business', phoneIds: ['phone-1'], phones: ['340-555-0100'], website: 'https://example.com' }],
    title: 'Businesses',
    type: 'business-list',
  },
]

validNestedBlocks.forEach((block) => {
  const validation = assertParity(block, `${block.type} nested fixture`)
  assert.deepEqual(validation, { errors: [], warnings: [] }, `${block.type} nested fixture must be valid.`)
})

const malformedBlocks = [
  { block: { id: 'hero', title: { unsafe: true }, type: 'hero' }, code: 'invalid-content-type' },
  { block: { body: 42, id: 'split', type: 'image-text-split' }, code: 'invalid-content-type' },
  { block: { id: 'features', items: [{ body: '', kind: 'star', title: '' }], type: 'feature-grid' }, code: 'missing-content-field' },
  { block: { html: [], id: 'rich', type: 'rich-text' }, code: 'invalid-content-type' },
  { block: { caption: {}, id: 'image', type: 'image' }, code: 'invalid-content-type' },
  { block: { action: 'bad', id: 'cta', type: 'cta-band' }, code: 'invalid-content-type' },
  { block: { id: 'quotes', items: [{ author: '', id: 'quote-1', quote: null }], type: 'testimonials' }, code: 'invalid-content-type' },
  { block: { id: 'gallery', images: [{ kind: 'image' }], type: 'image-gallery' }, code: 'missing-content-field' },
  { block: { id: 'space', size: 'huge', type: 'spacer' }, code: 'invalid-content-option' },
  { block: { id: 'directory', source: 'all', type: 'directory-embed' }, code: 'invalid-content-option' },
  { block: { id: 'form', intro: {}, type: 'contact-form' }, code: 'invalid-content-type' },
  { block: { id: 'details', items: [{ id: 'detail-1', label: '', type: 'other', value: '' }], type: 'contact-details' }, code: 'invalid-content-option' },
  { block: { columns: [null], id: 'schedule', type: 'schedule' }, code: 'invalid-content-type' },
  { block: { id: 'rates', rows: [{ id: 'rate-1', values: 'bad' }], type: 'rate-table' }, code: 'invalid-content-type' },
  { block: { id: 'group', items: [{ blocks: [], id: 'card-1', title: 3 }], type: 'group' }, code: 'invalid-content-type' },
  { block: { columns: [{ blocks: [], id: 'column-1', width: 'wide' }], id: 'row', type: 'row' }, code: 'invalid-content-type' },
  { block: { id: 'columns', left: {}, type: 'two-column-text' }, code: 'invalid-content-type' },
  { block: { id: 'businesses', items: [{ id: 'business-1', phones: [123] }], type: 'business-list' }, code: 'invalid-content-type' },
]

malformedBlocks.forEach(({ block, code }) => {
  const validation = assertParity(block, `${block.type} malformed fixture`)
  assert.ok(validation.errors.some((issue) => issue.code === code), `${block.type} must report ${code}.`)
})

const misaligned = assertParity(
  { columns: [{ heading: '', id: 'column-1', timeIds: [], times: ['9:00'] }], id: 'schedule', type: 'schedule' },
  'misaligned schedule ids',
)
assert.ok(misaligned.errors.some((issue) => issue.code === 'misaligned-content-ids'))

const duplicateIds = assertParity(
  { id: 'businesses', items: [{ id: 'duplicate' }, { id: 'duplicate' }], type: 'business-list' },
  'duplicate business ids',
)
assert.ok(duplicateIds.errors.some((issue) => issue.code === 'duplicate-content-id'))

const extraFieldBlock = { id: 'hero', title: 'Title', type: 'hero', unsupportedPayload: { preserved: true } }
const extraFieldSnapshot = JSON.stringify(extraFieldBlock)
const extraFieldValidation = assertParity(extraFieldBlock, 'unsupported field fixture')
assert.ok(extraFieldValidation.warnings.some((issue) => issue.code === 'unsupported-content-field'))
assert.equal(JSON.stringify(extraFieldBlock), extraFieldSnapshot, 'Content validation must never mutate authored content.')

const invalidColor = assertParity(
  { action: { backgroundColor: 'url(javascript:alert(1))', label: 'Contact', path: '/contact' }, id: 'hero', type: 'hero' },
  'invalid button color',
)
assert.ok(invalidColor.errors.some((issue) => issue.code === 'invalid-content-color'))

const malformedPage = {
  blocks: [{ action: 'bad', id: 'hero', title: { unsafe: true }, type: 'hero' }],
  contentModel: 'block-page',
  group: 'custom',
  metaDescription: 'Malformed content fixture.',
  navLabel: 'Malformed',
  path: '/malformed',
  routeAliases: [],
  title: 'Malformed',
}
const clientPageValidation = validateEditorBlockPageDraft(malformedPage)
const serverPageValidation = validateBlockPageDraft(malformedPage)

assert.equal(clientPageValidation.valid, false)
assert.equal(serverPageValidation.valid, false)
assert.ok(clientPageValidation.errors.some((issue) => issue.code === 'invalid-content-type' && issue.path === 'page.blocks[0].title'))
assert.ok(serverPageValidation.errors.some((issue) => issue.code === 'invalid-content-type' && issue.path === 'page.blocks[0].title'))

console.log(`Block content contract tests passed for ${BLOCK_TYPES.length} block types.`)
