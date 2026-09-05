const { HttpError } = require('./firebaseAdmin')

const ALLOWED_ITEM_TYPES = new Set(['property', 'charter'])
const ITEM_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/

function normalizeItemType(value, { message } = {}) {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!ALLOWED_ITEM_TYPES.has(normalized)) {
    throw new HttpError(400, message || `Unsupported item type: ${normalized || 'unknown'}`)
  }

  return normalized
}

function normalizeItemId(value, { message = 'A valid item id is required.' } = {}) {
  const normalized = String(value ?? '').trim()

  if (!ITEM_ID_PATTERN.test(normalized)) {
    throw new HttpError(400, message)
  }

  return normalized
}

exports.ALLOWED_ITEM_TYPES = ALLOWED_ITEM_TYPES
exports.ITEM_ID_PATTERN = ITEM_ID_PATTERN
exports.normalizeItemType = normalizeItemType
exports.normalizeItemId = normalizeItemId
