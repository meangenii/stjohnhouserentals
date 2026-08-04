import { MAX_ROW_COLUMNS, MAX_ROW_COLUMN_WIDTH } from './blockContract.js'

export { MAX_ROW_COLUMN_WIDTH }

export const ROW_LAYOUT_PRESETS = [
  { id: '1', label: '1 column', widths: [1] },
  { id: '2-equal', label: '2 columns (equal)', widths: [1, 1] },
  { id: '2-narrow-wide', label: '2 columns (1/3 + 2/3)', widths: [1, 2] },
  { id: '2-wide-narrow', label: '2 columns (2/3 + 1/3)', widths: [2, 1] },
  { id: '3-equal', label: '3 columns (equal)', widths: [1, 1, 1] },
  { id: '4-equal', label: '4 columns (equal)', widths: [1, 1, 1, 1] },
]

if (ROW_LAYOUT_PRESETS.some((preset) => preset.widths.length > MAX_ROW_COLUMNS)) {
  throw new Error(`Row layout presets cannot exceed the shared ${MAX_ROW_COLUMNS}-column limit.`)
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function makeRowColumnId() {
  return `column-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getColumnWidth(column) {
  const width = Number(column?.width)
  return Number.isFinite(width) && width > 0 ? width : 1
}

export function getRowLayoutPresetId(columns) {
  if (!Array.isArray(columns)) {
    return ''
  }

  const widths = columns.map(getColumnWidth)
  const preset = ROW_LAYOUT_PRESETS.find(
    (entry) => entry.widths.length === widths.length && entry.widths.every((width, index) => width === widths[index]),
  )

  return preset?.id ?? ''
}

export function applyRowLayoutPreset(columns, presetId, { makeId = makeRowColumnId } = {}) {
  const currentColumns = Array.isArray(columns) ? columns : []
  const preset = ROW_LAYOUT_PRESETS.find((entry) => entry.id === presetId)

  if (!preset) {
    return null
  }

  const nextColumns = preset.widths.map((width, index) => {
    const currentColumn = currentColumns[index]

    if (isPlainObject(currentColumn)) {
      return { ...currentColumn, blocks: Array.isArray(currentColumn.blocks) ? currentColumn.blocks : [], width }
    }

    return { blocks: [], id: String(makeId() ?? '').trim() || makeRowColumnId(), width }
  })

  const overflowColumns = currentColumns.slice(preset.widths.length).filter(isPlainObject)
  const overflowBlocks = overflowColumns.flatMap((column) => (Array.isArray(column.blocks) ? column.blocks : []))

  if (overflowBlocks.length > 0) {
    const lastColumnIndex = nextColumns.length - 1
    const lastColumn = nextColumns[lastColumnIndex]
    nextColumns[lastColumnIndex] = { ...lastColumn, blocks: [...lastColumn.blocks, ...overflowBlocks] }
  }

  return {
    columns: nextColumns,
    mergedBlockCount: overflowBlocks.length,
    removedColumnCount: overflowColumns.length,
  }
}

export function moveRowColumn(columns, index, direction) {
  if (!Array.isArray(columns) || !Number.isInteger(index)) {
    return null
  }

  const step = Math.sign(Number(direction))
  const nextIndex = index + step

  if (!step || index < 0 || index >= columns.length || nextIndex < 0 || nextIndex >= columns.length) {
    return null
  }

  const nextColumns = [...columns]
  const [column] = nextColumns.splice(index, 1)
  nextColumns.splice(nextIndex, 0, column)
  return nextColumns
}
