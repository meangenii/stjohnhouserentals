import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { blockInspectorSchemas, getBlockInspectorFields } from '../src/lib/blockInspectorSchema.js'

const require = createRequire(import.meta.url)
const { SUPPORTED_BLOCK_TYPES } = require('../functions/src/blockPageSchema.js')
const SUPPORTED_WIDGETS = new Set(['color', 'enum', 'image', 'link', 'objectList', 'richHtml', 'stringList', 'text'])

function formatPath(path) {
  return Array.isArray(path) ? path.join('.') : ''
}

function assertField(field, context) {
  assert.ok(field && typeof field === 'object', `${context} must be a field object.`)
  assert.ok(SUPPORTED_WIDGETS.has(field.widget), `${context} uses unsupported widget "${field.widget}".`)
  assert.equal(typeof field.label, 'string', `${context} requires a label.`)
  assert.ok(field.label.trim(), `${context} requires a non-empty label.`)

  if (field.visibleWhen) {
    assert.ok(Array.isArray(field.visibleWhen.path), `${context} visibleWhen requires a path.`)
    assert.ok(
      Object.prototype.hasOwnProperty.call(field.visibleWhen, 'equals') || Array.isArray(field.visibleWhen.oneOf),
      `${context} visibleWhen requires equals or oneOf.`,
    )
  }

  if (field.widget === 'link') {
    assert.ok(Array.isArray(field.linkPath), `${context} link field requires linkPath.`)
    assert.ok(Array.isArray(field.labelPath), `${context} link field requires labelPath.`)
    assert.ok(['href', 'path', 'website'].includes(field.destinationField), `${context} link field has invalid destinationField.`)
    return
  }

  if (field.widget === 'stringList') {
    assert.ok(Array.isArray(field.path), `${context} string list requires path.`)
    assert.ok(Array.isArray(field.idPath), `${context} string list requires idPath.`)
    assert.equal(typeof field.makeId, 'function', `${context} string list requires makeId.`)
    assert.ok(String(field.makeId()).trim(), `${context} string list ids must not be empty.`)
    return
  }

  assert.ok(Array.isArray(field.path), `${context} requires a path.`)
  assert.notEqual(formatPath(field.path), 'image.url', `${context} must not expose arbitrary image URL editing.`)

  if (field.widget === 'enum') {
    assert.ok(Array.isArray(field.options) && field.options.length > 0, `${context} enum requires options.`)
    field.options.forEach((option) => {
      assert.equal(typeof option.label, 'string', `${context} enum option requires a label.`)
      assert.equal(typeof option.value, 'string', `${context} enum option requires a value.`)
    })
  }

  if (field.widget === 'objectList') {
    assert.equal(typeof field.makeItem, 'function', `${context} object list requires makeItem.`)
    assert.ok(Array.isArray(field.fields), `${context} object list requires nested fields.`)
    field.fields.forEach((nestedField, index) => assertField(nestedField, `${context}.fields[${index}]`))

    const item = field.makeItem()
    assert.ok(item && typeof item === 'object' && !Array.isArray(item), `${context} makeItem must return an object.`)
    assert.equal(typeof item.id, 'string', `${context} makeItem must provide a stable id.`)
    assert.ok(item.id.trim(), `${context} makeItem must provide a non-empty id.`)
  }
}

assert.ok(SUPPORTED_BLOCK_TYPES.length > 0, 'Expected supported block types.')

SUPPORTED_BLOCK_TYPES.forEach((type) => {
  assert.ok(blockInspectorSchemas[type], `${type} is missing an inspector schema.`)

  const fields = getBlockInspectorFields(type)
  assert.ok(Array.isArray(fields), `${type} fields must be an array.`)
  fields.forEach((field, index) => assertField(field, `${type}.fields[${index}]`))
})

assert.deepEqual(getBlockInspectorFields('missing-block-type'), [])

console.log('Block inspector schema tests passed.')
