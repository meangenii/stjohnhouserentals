function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function copyPath(path) {
  return Array.isArray(path) ? [...path] : []
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function makeFallbackBlockId() {
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function makeNextBlockId(makeId) {
  const nextId = typeof makeId === 'function' ? makeId() : makeFallbackBlockId()
  return String(nextId ?? '').trim() || makeFallbackBlockId()
}

function refreshNestedBlockIds(block, makeId) {
  if (!isPlainObject(block)) {
    return block
  }

  block.id = makeNextBlockId(makeId)
  delete block.anchorId

  if (Array.isArray(block.blocks)) {
    block.blocks = block.blocks.map((childBlock) => refreshNestedBlockIds(childBlock, makeId))
  }

  if (Array.isArray(block.items)) {
    block.items = block.items.map((item) => {
      if (!isPlainObject(item)) {
        return item
      }

      item.id = makeNextBlockId(makeId)
      item.blocks = Array.isArray(item.blocks) ? item.blocks.map((childBlock) => refreshNestedBlockIds(childBlock, makeId)) : item.blocks
      return item
    })
  }

  if (Array.isArray(block.columns)) {
    block.columns = block.columns.map((column) => {
      if (!isPlainObject(column)) {
        return column
      }

      column.id = makeNextBlockId(makeId)
      column.blocks = Array.isArray(column.blocks) ? column.blocks.map((childBlock) => refreshNestedBlockIds(childBlock, makeId)) : column.blocks
      return column
    })
  }

  return block
}

function getTextSummary(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getBlockContentSummary(block) {
  const candidates = [
    block?.title,
    block?.heading,
    block?.kicker,
    block?.caption,
    block?.label,
    block?.source,
    block?.html,
    block?.body,
    block?.left,
    block?.right,
  ]

  for (const candidate of candidates) {
    const summary = getTextSummary(candidate)

    if (summary) {
      return summary.length > 72 ? `${summary.slice(0, 69)}...` : summary
    }
  }

  return ''
}

function getBlockLabel(block, resolveBlockLabel) {
  const editorLabel = getTextSummary(block?.editorLabel)

  if (editorLabel) {
    return editorLabel.length > 80 ? `${editorLabel.slice(0, 77)}...` : editorLabel
  }

  const type = String(block?.type ?? '').trim()
  const fallbackLabel = type || 'Unknown block'

  if (typeof resolveBlockLabel !== 'function') {
    return fallbackLabel
  }

  return resolveBlockLabel(type, block) || fallbackLabel
}

function getEntryKey(kind, path, fallbackId) {
  const pathKey = copyPath(path).join('.')
  return `${kind}:${pathKey || fallbackId || 'root'}`
}

export function makeBlockTreeSelectionId(kind, nodeId) {
  const normalizedKind = String(kind ?? '').trim()
  const normalizedNodeId = String(nodeId ?? '').trim()

  if (!normalizedNodeId) {
    return ''
  }

  return normalizedKind && normalizedKind !== 'block' ? `${normalizedKind}:${normalizedNodeId}` : normalizedNodeId
}

function collectFromBlockArray(blocks, options, path, depth, entries) {
  if (!Array.isArray(blocks)) {
    return entries
  }

  blocks.forEach((block, index) => {
    if (!isPlainObject(block)) {
      return
    }

    const blockPath = [...path, index]
    const blockId = typeof block.id === 'string' && block.id.trim() ? block.id.trim() : ''
    const label = getBlockLabel(block, options.resolveBlockLabel)
    const summary = getBlockContentSummary(block)

    entries.push({
      block,
      blockId,
      depth,
      hidden: block.hidden === true,
      id: getEntryKey('block', blockPath, blockId),
      kind: 'block',
      label,
      nodeId: blockId,
      path: blockPath,
      selectionId: makeBlockTreeSelectionId('block', blockId),
      summary,
      type: String(block.type ?? '').trim(),
    })

    if (block.type === 'group' && Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => {
        const itemPath = [...blockPath, 'items', itemIndex]
        const itemId = typeof item?.id === 'string' ? item.id.trim() : ''
        const itemLabel = getTextSummary(item?.title) || `Card ${itemIndex + 1}`
        const childBlocks = Array.isArray(item?.blocks) ? item.blocks : []

        entries.push({
          childCount: childBlocks.length,
          depth: depth + 1,
          id: getEntryKey('group-item', itemPath, item?.id),
          kind: 'group-item',
          label: itemLabel,
          nodeId: itemId,
          path: itemPath,
          selectionId: makeBlockTreeSelectionId('group-item', itemId),
        })
        collectFromBlockArray(childBlocks, options, [...itemPath, 'blocks'], depth + 2, entries)
      })
    }

    if (block.type === 'row' && Array.isArray(block.columns)) {
      block.columns.forEach((column, columnIndex) => {
        const columnPath = [...blockPath, 'columns', columnIndex]
        const columnId = typeof column?.id === 'string' ? column.id.trim() : ''
        const childBlocks = Array.isArray(column?.blocks) ? column.blocks : []

        entries.push({
          childCount: childBlocks.length,
          depth: depth + 1,
          id: getEntryKey('row-column', columnPath, column?.id),
          kind: 'row-column',
          label: `Column ${columnIndex + 1}`,
          nodeId: columnId,
          path: columnPath,
          selectionId: makeBlockTreeSelectionId('row-column', columnId),
        })
        collectFromBlockArray(childBlocks, options, [...columnPath, 'blocks'], depth + 2, entries)
      })
    }

    if (block.type === 'tabs' && Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => {
        const itemPath = [...blockPath, 'items', itemIndex]
        const itemId = typeof item?.id === 'string' ? item.id.trim() : ''
        const itemLabel = getTextSummary(item?.title) || `Tab ${itemIndex + 1}`
        const childBlocks = Array.isArray(item?.blocks) ? item.blocks : []

        entries.push({
          childCount: childBlocks.length,
          depth: depth + 1,
          id: getEntryKey('tab-item', itemPath, item?.id),
          kind: 'tab-item',
          label: itemLabel,
          nodeId: itemId,
          path: itemPath,
          selectionId: makeBlockTreeSelectionId('tab-item', itemId),
        })
        collectFromBlockArray(childBlocks, options, [...itemPath, 'blocks'], depth + 2, entries)
      })
    }
  })

  return entries
}

export function collectBlockOutlineEntries(blocks, options = {}) {
  return collectFromBlockArray(blocks, options, options.path ?? ['blocks'], options.depth ?? 0, [])
}

export function findBlockOutlineEntry(entries, selectionId) {
  const targetId = String(selectionId ?? '').trim()

  if (!targetId || !Array.isArray(entries)) {
    return null
  }

  return entries.find((entry) => entry.selectionId === targetId) ?? null
}

export function getBlockValueAtPath(page, path) {
  return copyPath(path).reduce((current, segment) => current?.[segment], page)
}

function getBlockPathContext(page, blockPath) {
  const path = copyPath(blockPath)
  const index = path[path.length - 1]

  if (path.length < 2 || !Number.isInteger(index) || index < 0) {
    return null
  }

  const containerPath = path.slice(0, -1)
  const container = getBlockValueAtPath(page, containerPath)

  if (!Array.isArray(container) || index >= container.length || !isPlainObject(container[index])) {
    return null
  }

  return {
    block: container[index],
    container,
    containerPath,
    index,
    path,
  }
}

export function cloneBlockWithFreshIds(block, makeId) {
  return refreshNestedBlockIds(cloneValue(block), makeId)
}

export function getBlockCommandState(page, blockPath) {
  const context = getBlockPathContext(page, blockPath)

  if (!context) {
    return {
      canDelete: false,
      canDuplicate: false,
      canMoveDown: false,
      canMoveUp: false,
    }
  }

  return {
    canDelete: true,
    canDuplicate: true,
    canMoveDown: context.index < context.container.length - 1,
    canMoveUp: context.index > 0,
  }
}

export function duplicateBlockAtPath(page, blockPath, { makeId } = {}) {
  if (!isPlainObject(page)) {
    return null
  }

  const nextPage = cloneValue(page)
  const context = getBlockPathContext(nextPage, blockPath)

  if (!context) {
    return null
  }

  const clonedBlock = cloneBlockWithFreshIds(context.block, makeId)
  context.container.splice(context.index + 1, 0, clonedBlock)

  return {
    page: nextPage,
    selectedBlockId: clonedBlock.id ?? '',
  }
}

export function moveBlockAtPath(page, blockPath, direction) {
  if (!isPlainObject(page)) {
    return null
  }

  const step = Math.sign(Number(direction))

  if (!step) {
    return null
  }

  const nextPage = cloneValue(page)
  const context = getBlockPathContext(nextPage, blockPath)

  if (!context) {
    return null
  }

  const nextIndex = context.index + step

  if (nextIndex < 0 || nextIndex >= context.container.length) {
    return null
  }

  const [movedBlock] = context.container.splice(context.index, 1)
  context.container.splice(nextIndex, 0, movedBlock)

  return {
    page: nextPage,
    selectedBlockId: movedBlock.id ?? '',
  }
}

export function removeBlockAtPath(page, blockPath) {
  if (!isPlainObject(page)) {
    return null
  }

  const nextPage = cloneValue(page)
  const context = getBlockPathContext(nextPage, blockPath)

  if (!context) {
    return null
  }

  context.container.splice(context.index, 1)

  const nextSelectedBlock = context.container[context.index] ?? context.container[context.index - 1] ?? null

  return {
    page: nextPage,
    selectedBlockId: nextSelectedBlock?.id ?? '',
  }
}
