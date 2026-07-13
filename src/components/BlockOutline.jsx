import { getBlockDefinition } from '../lib/blockRegistry'

function collectOutlineEntries(blocks, depth = 0) {
  if (!Array.isArray(blocks)) {
    return []
  }

  return blocks.flatMap((block, index) => {
    const definition = getBlockDefinition(block?.type)

    if (!definition) {
      return []
    }

    const entryId = block.id ?? `block-${depth}-${index}`
    const entries = [{ depth, id: entryId, label: definition.label }]

    if (block.type === 'group' && Array.isArray(block.items)) {
      block.items.forEach((item, itemIndex) => {
        const cardId = item.id ?? `${entryId}-card-${itemIndex}`
        entries.push({ depth: depth + 1, id: cardId, label: item.title || `Card ${itemIndex + 1}` })
        entries.push(...collectOutlineEntries(item.blocks, depth + 2))
      })
    }

    if (block.type === 'row' && Array.isArray(block.columns)) {
      block.columns.forEach((column, columnIndex) => {
        const columnId = column.id ?? `${entryId}-column-${columnIndex}`
        entries.push({ depth: depth + 1, id: columnId, label: `Column ${columnIndex + 1}` })
        entries.push(...collectOutlineEntries(column.blocks, depth + 2))
      })
    }

    return entries
  })
}

export function BlockOutline({ blocks }) {
  const entries = collectOutlineEntries(blocks)

  if (entries.length === 0) {
    return null
  }

  return (
    <details className="block-outline" open>
      <summary className="block-outline-summary">Page outline ({entries.length} blocks)</summary>
      <ul className="block-outline-list">
        {entries.map((entry) => (
          <li className="block-outline-item" key={entry.id} style={{ paddingLeft: `${entry.depth}rem` }}>
            {entry.label}
          </li>
        ))}
      </ul>
    </details>
  )
}
