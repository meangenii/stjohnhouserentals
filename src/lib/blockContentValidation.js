import { BLOCK_CONTENT_SCHEMAS } from './blockContract.js'

const COMMON_BLOCK_FIELDS = new Set([
  'anchorId',
  'elementStyles',
  'editorLabel',
  'hidden',
  'id',
  'responsive',
  'style',
  'type',
  'version',
  'visibility',
])

const IMAGE_FIELDS = {
  alt: { type: 'string' },
  assetId: { type: 'string' },
  backgroundColor: { type: 'string' },
  decorative: { type: 'boolean' },
  fileName: { type: 'string' },
  height: { type: 'nullableNumber' },
  id: { type: 'id' },
  kind: { type: 'enum', options: ['image'] },
  naturalHeight: { type: 'nullableNumber' },
  naturalWidth: { type: 'nullableNumber' },
  originalFileName: { type: 'string' },
  originalHeight: { type: 'nullableNumber' },
  originalWidth: { type: 'nullableNumber' },
  src: { type: 'string' },
  storagePath: { type: 'string' },
  title: { type: 'string' },
  url: { type: 'string' },
  width: { type: 'nullableNumber' },
}

const LINK_FIELDS = {
  emailAddress: { type: 'string' },
  emailBcc: { type: 'string' },
  emailBccEnabled: { type: 'boolean' },
  emailBody: { type: 'string' },
  emailCc: { type: 'string' },
  emailCcEnabled: { type: 'boolean' },
  emailSubject: { type: 'string' },
  href: { type: 'string' },
  linkType: { type: 'enum', options: ['email', 'external', 'internal', 'phone'] },
  openInNewTab: { type: 'boolean' },
  path: { type: 'string' },
  phoneNumber: { type: 'string' },
  rel: { type: 'string' },
  target: { type: 'string' },
  website: { type: 'string' },
}

const CONTROLLED_COLOR_PATTERN = /^(?:#[0-9a-f]{3}(?:[0-9a-f](?:[0-9a-f]{2}(?:[0-9a-f]{2})?)?)?|rgba?\([\d\s.,%/+-]+\)|hsla?\([\d\s.,%/+-]+\)|var\(--[a-z0-9-]+\))$/i

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function makeIssue(code, message, path) {
  return { code, message, pathSegments: [...path] }
}

function describeValue(value) {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'an array'
  }

  return typeof value === 'object' ? 'an object' : `a ${typeof value}`
}

function validateUnknownFields(value, fields, path, warnings, allowUnknown = false) {
  if (allowUnknown) {
    return
  }

  Object.keys(value).forEach((fieldName) => {
    if (!Object.prototype.hasOwnProperty.call(fields, fieldName)) {
      warnings.push(
        makeIssue(
          'unsupported-content-field',
          `Field "${fieldName}" is not part of this block content contract and will be preserved unchanged.`,
          [...path, fieldName],
        ),
      )
    }
  })
}

function validateObject(value, descriptor, path, errors, warnings, inheritedFields = {}) {
  if (!isPlainObject(value)) {
    errors.push(makeIssue('invalid-content-type', `Expected an object but received ${describeValue(value)}.`, path))
    return
  }

  const fields = { ...inheritedFields, ...(descriptor.fields ?? {}) }
  validateUnknownFields(value, fields, path, warnings, descriptor.allowUnknown === true)

  Object.entries(fields).forEach(([fieldName, fieldDescriptor]) => {
    const fieldPath = [...path, fieldName]

    if (!Object.prototype.hasOwnProperty.call(value, fieldName)) {
      if (fieldDescriptor.required === true) {
        errors.push(makeIssue('missing-content-field', `Field "${fieldName}" is required.`, fieldPath))
      }
      return
    }

    validateValue(value[fieldName], fieldDescriptor, fieldPath, errors, warnings, value)
  })
}

function validateIdArray(value, descriptor, path, errors, parent) {
  if (!Array.isArray(value)) {
    errors.push(makeIssue('invalid-content-type', `Expected an array but received ${describeValue(value)}.`, path))
    return
  }

  const seenIds = new Set()

  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      errors.push(makeIssue('invalid-content-id', 'Stable list ids must be non-empty strings.', [...path, index]))
      return
    }

    if (seenIds.has(entry)) {
      errors.push(makeIssue('duplicate-content-id', `Stable list id "${entry}" is duplicated.`, [...path, index]))
    }

    seenIds.add(entry)
  })

  if (descriptor.alignedWith && Array.isArray(parent?.[descriptor.alignedWith]) && value.length !== parent[descriptor.alignedWith].length) {
    errors.push(
      makeIssue(
        'misaligned-content-ids',
        `Stable ids must contain one entry for every item in "${descriptor.alignedWith}".`,
        path,
      ),
    )
  }
}

function validateValue(value, descriptor, path, errors, warnings, parent) {
  if (descriptor.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(makeIssue('invalid-content-type', `Expected text but received ${describeValue(value)}.`, path))
    }
    return
  }

  if (descriptor.type === 'boolean') {
    if (typeof value !== 'boolean') {
      errors.push(makeIssue('invalid-content-type', `Expected true or false but received ${describeValue(value)}.`, path))
    }
    return
  }

  if (descriptor.type === 'color') {
    if (typeof value !== 'string' || (value.trim() && !CONTROLLED_COLOR_PATTERN.test(value.trim()))) {
      errors.push(makeIssue('invalid-content-color', 'Color must use a hexadecimal, RGB, HSL, or supported CSS variable value.', path))
    }
    return
  }

  if (descriptor.type === 'number' || descriptor.type === 'nullableNumber' || descriptor.type === 'numeric') {
    if (descriptor.type === 'nullableNumber' && value === null) {
      return
    }

    const number = descriptor.type === 'numeric' ? Number(value) : value

    if (typeof number !== 'number' || !Number.isFinite(number)) {
      errors.push(makeIssue('invalid-content-type', `Expected a finite number but received ${describeValue(value)}.`, path))
    }
    return
  }

  if (descriptor.type === 'id') {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(makeIssue('invalid-content-id', 'Stable ids must be non-empty strings.', path))
    }
    return
  }

  if (descriptor.type === 'enum') {
    if (typeof value !== 'string' || !descriptor.options?.includes(value)) {
      errors.push(makeIssue('invalid-content-option', `Value must be one of: ${(descriptor.options ?? []).join(', ')}.`, path))
    }
    return
  }

  if (descriptor.type === 'idArray') {
    validateIdArray(value, descriptor, path, errors, parent)
    return
  }

  if (descriptor.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(makeIssue('invalid-content-type', `Expected an array but received ${describeValue(value)}.`, path))
      return
    }

    value.forEach((entry, index) => validateValue(entry, descriptor.items ?? {}, [...path, index], errors, warnings, value))

    const itemRequiresId = descriptor.items?.requiredId === true || descriptor.items?.fields?.id?.required === true

    if (itemRequiresId) {
      const seenIds = new Set()

      value.forEach((entry, index) => {
        const id = typeof entry?.id === 'string' ? entry.id.trim() : ''

        if (id && seenIds.has(id)) {
          errors.push(makeIssue('duplicate-content-id', `Stable item id "${id}" is duplicated.`, [...path, index, 'id']))
        }

        if (id) {
          seenIds.add(id)
        }
      })
    }
    return
  }

  if (descriptor.type === 'blocks') {
    if (!Array.isArray(value)) {
      errors.push(makeIssue('invalid-content-type', `Expected a block array but received ${describeValue(value)}.`, path))
    }
    return
  }

  if (descriptor.type === 'image') {
    validateObject(value, { fields: IMAGE_FIELDS }, path, errors, warnings)

    if (descriptor.requiredId === true && isPlainObject(value) && (typeof value.id !== 'string' || !value.id.trim())) {
      errors.push(makeIssue('missing-content-field', 'Gallery images require a stable id.', [...path, 'id']))
    }
    return
  }

  if (descriptor.type === 'link') {
    validateObject(value, descriptor, path, errors, warnings, LINK_FIELDS)
    return
  }

  if (descriptor.type === 'object') {
    validateObject(value, descriptor, path, errors, warnings)
    return
  }

  errors.push(makeIssue('invalid-content-schema', `Unsupported content schema type "${descriptor.type ?? ''}".`, path))
}

export function validateBlockContentRecord(block, type) {
  const errors = []
  const warnings = []
  const fields = BLOCK_CONTENT_SCHEMAS[type]

  if (!fields || !isPlainObject(block)) {
    return { errors, warnings }
  }

  validateUnknownFields(block, { ...Object.fromEntries([...COMMON_BLOCK_FIELDS].map((field) => [field, true])), ...fields }, [], warnings)

  Object.entries(fields).forEach(([fieldName, descriptor]) => {
    if (Object.prototype.hasOwnProperty.call(block, fieldName)) {
      validateValue(block[fieldName], descriptor, [fieldName], errors, warnings, block)
    } else if (descriptor.required === true) {
      errors.push(makeIssue('missing-content-field', `Field "${fieldName}" is required.`, [fieldName]))
    }
  })

  return { errors, warnings }
}
