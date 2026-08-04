import { updateValueAtPath } from './inlinePageEditor.js'

export const PAGE_EDITOR_HISTORY_LIMIT = 80
export const PAGE_EDITOR_HISTORY_MAX_BYTES = 4 * 1024 * 1024
export const PAGE_EDITOR_HISTORY_COALESCE_MS = 650

function cloneHistoryValue(value) {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value))
}

function snapshot(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}

function getValueAtPath(root, path = []) {
  return path.reduce((value, segment) => value?.[segment], root)
}

function pathKey(path = []) {
  return path.map((segment) => `${typeof segment}:${String(segment)}`).join('|')
}

function entrySize(entry) {
  return snapshot(entry).length
}

function trimNewest(values, limit, maxBytes = PAGE_EDITOR_HISTORY_MAX_BYTES) {
  const retained = []
  let retainedBytes = 0

  for (let index = values.length - 1; index >= 0 && retained.length < limit; index -= 1) {
    const size = entrySize(values[index])

    if (retained.length > 0 && retainedBytes + size > maxBytes) {
      break
    }

    retained.unshift(values[index])
    retainedBytes += size
  }

  return retained
}

function trimOldest(values, limit, maxBytes = PAGE_EDITOR_HISTORY_MAX_BYTES) {
  const retained = []
  let retainedBytes = 0

  for (const entry of values) {
    const size = entrySize(entry)

    if (retained.length >= limit || (retained.length > 0 && retainedBytes + size > maxBytes)) {
      break
    }

    retained.push(entry)
    retainedBytes += size
  }

  return retained
}

function normalizeHistoryForKey(history, activeKey) {
  const key = String(activeKey ?? '')

  if (history?.activeKey === key) {
    return {
      activeKey: key,
      future: Array.isArray(history.future) ? history.future : [],
      past: Array.isArray(history.past) ? history.past : [],
    }
  }

  return resetPageEditorHistory(key)
}

function makeHistoryEntry({ coalesceKey = '', nextDraft, path, previousDraft, timestamp }) {
  if (Array.isArray(path)) {
    return {
      after: cloneHistoryValue(getValueAtPath(nextDraft, path)),
      before: cloneHistoryValue(getValueAtPath(previousDraft, path)),
      coalesceKey: String(coalesceKey || pathKey(path)),
      kind: 'path',
      path: [...path],
      timestamp,
    }
  }

  return {
    draft: cloneHistoryValue(previousDraft),
    kind: 'snapshot',
    timestamp,
  }
}

function applyUndoEntry(entry, currentDraft) {
  if (entry?.kind === 'path') {
    return updateValueAtPath(currentDraft, entry.path, cloneHistoryValue(entry.before))
  }

  return cloneHistoryValue(entry?.draft)
}

function applyRedoEntry(entry, currentDraft) {
  if (entry?.kind === 'path') {
    return updateValueAtPath(currentDraft, entry.path, cloneHistoryValue(entry.after))
  }

  return cloneHistoryValue(entry?.draft)
}

export function resetPageEditorHistory(activeKey = '') {
  return {
    activeKey: String(activeKey ?? ''),
    future: [],
    past: [],
  }
}

export function getPageEditorHistoryStatus(history, activeKey = '') {
  const normalizedHistory = normalizeHistoryForKey(history, activeKey)

  return {
    canRedo: normalizedHistory.future.length > 0,
    canUndo: normalizedHistory.past.length > 0,
  }
}

export function recordPageEditorHistory(
  history,
  {
    activeKey = '',
    coalesce = false,
    coalesceKey = '',
    coalesceWindowMs = PAGE_EDITOR_HISTORY_COALESCE_MS,
    limit = PAGE_EDITOR_HISTORY_LIMIT,
    maxBytes = PAGE_EDITOR_HISTORY_MAX_BYTES,
    nextDraft,
    path,
    previousDraft,
    timestamp = Date.now(),
  } = {},
) {
  const previousValue = Array.isArray(path) ? getValueAtPath(previousDraft, path) : previousDraft
  const nextValue = Array.isArray(path) ? getValueAtPath(nextDraft, path) : nextDraft

  if (snapshot(previousValue) === snapshot(nextValue)) {
    return normalizeHistoryForKey(history, activeKey)
  }

  const normalizedHistory = normalizeHistoryForKey(history, activeKey)
  const nextEntry = makeHistoryEntry({ coalesceKey, nextDraft, path, previousDraft, timestamp })
  const latestEntry = normalizedHistory.past[normalizedHistory.past.length - 1]
  const canCoalesce =
    coalesce &&
    nextEntry.kind === 'path' &&
    latestEntry?.kind === 'path' &&
    latestEntry.coalesceKey === nextEntry.coalesceKey &&
    timestamp - Number(latestEntry.timestamp ?? 0) <= coalesceWindowMs

  const nextPast = canCoalesce
    ? [...normalizedHistory.past.slice(0, -1), { ...latestEntry, after: nextEntry.after, timestamp }]
    : [...normalizedHistory.past, nextEntry]

  return {
    activeKey: normalizedHistory.activeKey,
    future: [],
    past: trimNewest(nextPast, limit, maxBytes),
  }
}

export function undoPageEditorHistory(
  history,
  { activeKey = '', currentDraft, limit = PAGE_EDITOR_HISTORY_LIMIT, maxBytes = PAGE_EDITOR_HISTORY_MAX_BYTES } = {},
) {
  const normalizedHistory = normalizeHistoryForKey(history, activeKey)

  if (normalizedHistory.past.length === 0) {
    return { draft: currentDraft, history: normalizedHistory, changed: false }
  }

  const entry = normalizedHistory.past[normalizedHistory.past.length - 1]
  const nextPast = normalizedHistory.past.slice(0, -1)
  const futureEntry =
    entry.kind === 'snapshot'
      ? { draft: cloneHistoryValue(currentDraft), kind: 'snapshot', timestamp: Date.now() }
      : entry

  return {
    changed: true,
    draft: applyUndoEntry(entry, currentDraft),
    history: {
      activeKey: normalizedHistory.activeKey,
      future: trimOldest([futureEntry, ...normalizedHistory.future], limit, maxBytes),
      past: nextPast,
    },
  }
}

export function redoPageEditorHistory(
  history,
  { activeKey = '', currentDraft, limit = PAGE_EDITOR_HISTORY_LIMIT, maxBytes = PAGE_EDITOR_HISTORY_MAX_BYTES } = {},
) {
  const normalizedHistory = normalizeHistoryForKey(history, activeKey)

  if (normalizedHistory.future.length === 0) {
    return { draft: currentDraft, history: normalizedHistory, changed: false }
  }

  const entry = normalizedHistory.future[0]
  const nextFuture = normalizedHistory.future.slice(1)
  const pastEntry =
    entry.kind === 'snapshot'
      ? { draft: cloneHistoryValue(currentDraft), kind: 'snapshot', timestamp: Date.now() }
      : entry

  return {
    changed: true,
    draft: applyRedoEntry(entry, currentDraft),
    history: {
      activeKey: normalizedHistory.activeKey,
      future: nextFuture,
      past: trimNewest([...normalizedHistory.past, pastEntry], limit, maxBytes),
    },
  }
}
