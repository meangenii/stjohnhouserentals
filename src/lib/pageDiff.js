const PAGE_METADATA_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'navLabel', label: 'Navigation label' },
  { key: 'group', label: 'Navigation group' },
  { key: 'path', label: 'URL path' },
  { key: 'routeAliases', label: 'URL aliases' },
  { key: 'metaDescription', label: 'Search description' },
]

const CHILD_CONTAINER_KEYS = new Set(['blocks', 'columns', 'items'])

function jsonSnapshot(value) {
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return ''
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function trimDisplayValue(value) {
  const candidate = (Array.isArray(value) ? value.join(', ') : String(value ?? '')).trim()
  return candidate.length > 96 ? `${candidate.slice(0, 93)}...` : candidate
}

function normalizeBlockLabel(block, fallback = 'Block') {
  return (
    String(block?.title ?? block?.heading ?? block?.name ?? block?.label ?? block?.caption ?? '').trim() ||
    String(block?.type ?? '').trim() ||
    fallback
  )
}

function getPathLabel(path = []) {
  if (!Array.isArray(path) || path.length === 0) {
    return 'page'
  }

  return path
    .map((segment) => (typeof segment === 'number' ? segment + 1 : segment))
    .join(' > ')
}

function getComparableBlock(block) {
  if (Array.isArray(block)) {
    return block.map((entry) => getComparableBlock(entry))
  }

  if (!isPlainObject(block)) {
    return block
  }

  return Object.fromEntries(
    Object.entries(block)
      .filter(([key]) => !CHILD_CONTAINER_KEYS.has(key))
      .map(([key, value]) => [key, getComparableBlock(value)]),
  )
}

function collectBlockEntries(blocks, path = ['blocks'], entries = []) {
  if (!Array.isArray(blocks)) {
    return entries
  }

  blocks.forEach((block, index) => {
    if (!isPlainObject(block)) {
      return
    }

    const blockPath = [...path, index]
    const id = String(block.id ?? '').trim()

    if (id) {
      entries.push({
        comparableSnapshot: jsonSnapshot(getComparableBlock(block)),
        id,
        label: normalizeBlockLabel(block),
        path: blockPath,
        pathLabel: getPathLabel(blockPath),
        type: String(block.type ?? '').trim(),
      })
    }

    if (Array.isArray(block.blocks)) {
      collectBlockEntries(block.blocks, [...blockPath, 'blocks'], entries)
    }

    if (Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => {
        collectBlockEntries(item?.blocks, [...blockPath, 'items', itemIndex, 'blocks'], entries)
      })
    }

    if (Array.isArray(block.columns)) {
      block.columns.forEach((column, columnIndex) => {
        collectBlockEntries(column?.blocks, [...blockPath, 'columns', columnIndex, 'blocks'], entries)
      })
    }
  })

  return entries
}

function toEntryMap(entries) {
  return new Map(entries.map((entry) => [entry.id, entry]))
}

function pushMetadataChanges(changes, beforePage, afterPage) {
  PAGE_METADATA_FIELDS.forEach((field) => {
    const beforeValue = trimDisplayValue(beforePage?.[field.key])
    const afterValue = trimDisplayValue(afterPage?.[field.key])

    if (beforeValue === afterValue) {
      return
    }

    changes.push({
      after: afterValue,
      before: beforeValue,
      field: field.key,
      label: field.label,
      type: 'metadata',
    })
  })
}

function pushBlockChanges(changes, beforePage, afterPage) {
  if (beforePage?.contentModel !== 'block-page' && afterPage?.contentModel !== 'block-page') {
    if (jsonSnapshot(beforePage) !== jsonSnapshot(afterPage)) {
      changes.push({
        label: 'Page content',
        type: 'content',
      })
    }

    return
  }

  const beforeEntries = collectBlockEntries(beforePage?.blocks)
  const afterEntries = collectBlockEntries(afterPage?.blocks)
  const beforeEntryMap = toEntryMap(beforeEntries)
  const afterEntryMap = toEntryMap(afterEntries)

  afterEntries.forEach((entry) => {
    if (!beforeEntryMap.has(entry.id)) {
      changes.push({
        afterPath: entry.pathLabel,
        blockId: entry.id,
        label: entry.label,
        type: 'block-added',
      })
    }
  })

  beforeEntries.forEach((entry) => {
    if (!afterEntryMap.has(entry.id)) {
      changes.push({
        beforePath: entry.pathLabel,
        blockId: entry.id,
        label: entry.label,
        type: 'block-removed',
      })
    }
  })

  afterEntries.forEach((afterEntry) => {
    const beforeEntry = beforeEntryMap.get(afterEntry.id)

    if (!beforeEntry) {
      return
    }

    if (beforeEntry.pathLabel !== afterEntry.pathLabel) {
      changes.push({
        afterPath: afterEntry.pathLabel,
        beforePath: beforeEntry.pathLabel,
        blockId: afterEntry.id,
        label: afterEntry.label,
        type: 'block-moved',
      })
    }

    if (beforeEntry.type !== afterEntry.type) {
      changes.push({
        after: afterEntry.type,
        before: beforeEntry.type,
        blockId: afterEntry.id,
        label: afterEntry.label,
        type: 'block-type-changed',
      })
      return
    }

    if (beforeEntry.comparableSnapshot !== afterEntry.comparableSnapshot) {
      changes.push({
        blockId: afterEntry.id,
        label: afterEntry.label,
        path: afterEntry.pathLabel,
        type: 'block-updated',
      })
    }
  })
}

function summarizeChanges(changes) {
  const counts = changes.reduce((summary, change) => {
    summary[change.type] = (summary[change.type] ?? 0) + 1
    return summary
  }, {})

  return {
    added: counts['block-added'] ?? 0,
    content: counts.content ?? 0,
    metadata: counts.metadata ?? 0,
    moved: counts['block-moved'] ?? 0,
    removed: counts['block-removed'] ?? 0,
    typeChanged: counts['block-type-changed'] ?? 0,
    updated: counts['block-updated'] ?? 0,
  }
}

export function buildPageDiff(beforePage, afterPage) {
  const changes = []

  pushMetadataChanges(changes, beforePage, afterPage)
  pushBlockChanges(changes, beforePage, afterPage)

  return {
    changes,
    empty: changes.length === 0,
    summary: summarizeChanges(changes),
    totalChanges: changes.length,
  }
}
