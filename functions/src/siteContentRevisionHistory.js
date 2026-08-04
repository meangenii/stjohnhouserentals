const STRUCTURED_PAGE_REVISION_ACTIONS = ['delete', 'publish', 'reset', 'restore', 'save', 'undelete']
const DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT = 30
const MAX_STRUCTURED_PAGE_REVISION_LIMIT = 80

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeRevisionAction(action) {
  const candidate = String(action ?? '').trim()
  return STRUCTURED_PAGE_REVISION_ACTIONS.includes(candidate) ? candidate : 'save'
}

function normalizeRevisionLimit(limit) {
  const candidate = Number.parseInt(String(limit ?? ''), 10)

  if (!Number.isInteger(candidate) || candidate <= 0) {
    return DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT
  }

  return Math.min(candidate, MAX_STRUCTURED_PAGE_REVISION_LIMIT)
}

function normalizeRevisionTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value?.toMillis === 'function') {
    return value.toMillis()
  }

  if (typeof value?._seconds === 'number') {
    return value._seconds * 1000 + Math.round((value._nanoseconds ?? 0) / 1000000)
  }

  return null
}

function selectStaleStructuredPageRevisions(revisions, limit = MAX_STRUCTURED_PAGE_REVISION_LIMIT) {
  if (!Array.isArray(revisions)) {
    return []
  }

  return revisions.slice(normalizeRevisionLimit(limit))
}

function countBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return 0
  }

  return blocks.reduce((total, block) => {
    const rowColumnBlocks = Array.isArray(block?.columns)
      ? block.columns.reduce((columnTotal, column) => columnTotal + countBlocks(column?.blocks), 0)
      : 0
    const groupItemBlocks = Array.isArray(block?.items)
      ? block.items.reduce((itemTotal, item) => itemTotal + countBlocks(item?.blocks), 0)
      : 0
    const nestedBlocks = countBlocks(block?.blocks)

    return total + 1 + rowColumnBlocks + groupItemBlocks + nestedBlocks
  }, 0)
}

function resolvePageTitle(page = {}) {
  return String(page.title ?? page.navLabel ?? page.key ?? '').trim()
}

function createStructuredPageRevisionRecord({ action = 'save', actor = 'admin', createdAt = null, page, restoredFrom = '' } = {}) {
  if (!isPlainObject(page)) {
    throw new Error('Structured page revisions require a page snapshot.')
  }

  const normalizedPage = cloneData(page)
  const normalizedRestoredFrom = String(restoredFrom ?? '').trim()

  return {
    action: normalizeRevisionAction(action),
    actor: String(actor ?? '').trim() || 'admin',
    blockCount: countBlocks(normalizedPage.blocks),
    createdAt,
    page: normalizedPage,
    pageKey: String(normalizedPage.key ?? '').trim(),
    pagePath: String(normalizedPage.path ?? '').trim(),
    pageTitle: resolvePageTitle(normalizedPage),
    ...(normalizedRestoredFrom ? { restoredFrom: normalizedRestoredFrom } : {}),
  }
}

function summarizeStructuredPageRevision(id, record = {}) {
  return {
    action: normalizeRevisionAction(record.action),
    actor: String(record.actor ?? '').trim(),
    blockCount: Number(record.blockCount) || countBlocks(record.page?.blocks),
    createdAt: normalizeRevisionTimestamp(record.createdAt),
    id: String(id ?? '').trim(),
    pageKey: String(record.pageKey ?? record.page?.key ?? '').trim(),
    pagePath: String(record.pagePath ?? record.page?.path ?? '').trim(),
    pageTitle: String(record.pageTitle ?? resolvePageTitle(record.page)).trim(),
    restoredFrom: String(record.restoredFrom ?? '').trim(),
  }
}

module.exports = {
  DEFAULT_STRUCTURED_PAGE_REVISION_LIMIT,
  MAX_STRUCTURED_PAGE_REVISION_LIMIT,
  STRUCTURED_PAGE_REVISION_ACTIONS,
  createStructuredPageRevisionRecord,
  normalizeRevisionLimit,
  selectStaleStructuredPageRevisions,
  summarizeStructuredPageRevision,
}
