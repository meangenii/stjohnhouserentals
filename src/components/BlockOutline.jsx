import { useMemo, useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { BlockInserter } from './BlockList'
import { EditorIconButton } from './EditorIconButton'
import { createBlockRecord, getBlockDefinition } from '../lib/blockRegistry'
import { collectBlockOutlineEntries } from '../lib/blockTree'
import { mapValidationIssuesToEntries } from '../lib/pageValidationIssues'

function resolveBlockLabel(type) {
  return getBlockDefinition(type)?.label ?? ''
}

function formatChildCount(count) {
  return `${count} block${count === 1 ? '' : 's'}`
}

function formatPixels(value) {
  return Number.isFinite(value) ? `${Math.round(value)}px` : 'n/a'
}

function formatMetricBox(metric) {
  if (!metric) {
    return 'Not rendered'
  }

  return `${formatPixels(metric.width)} x ${formatPixels(metric.height)} at ${formatPixels(metric.x)}, ${formatPixels(metric.y)}`
}

function formatElementName(metric) {
  if (!metric) {
    return ''
  }

  const className = String(metric.className ?? '').trim()

  if (!className) {
    return metric.tagName
  }

  return `${metric.tagName}.${className.split(/\s+/).slice(0, 2).join('.')}`
}

function formatDisplayDetails(metric) {
  if (!metric) {
    return ''
  }

  const details = [metric.display, metric.position && metric.position !== 'static' ? metric.position : '']

  if (metric.display?.includes('grid') && metric.gridTemplateColumns && metric.gridTemplateColumns !== 'none') {
    details.push(`grid ${metric.gridTemplateColumns}`)
  }

  if (metric.display?.includes('flex') && metric.flexDirection) {
    details.push(`flex ${metric.flexDirection}`)
  }

  return details.filter(Boolean).join(' | ')
}

function OutlineIssueBadge({ issues }) {
  const errorCount = issues?.errors?.length ?? 0
  const warningCount = issues?.warnings?.length ?? 0
  const count = errorCount + warningCount

  if (count === 0) {
    return null
  }

  const tone = errorCount > 0 ? 'error' : 'warning'
  const label = `${errorCount} error${errorCount === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`

  return (
    <span aria-label={label} className={`block-outline-issue-badge block-outline-issue-badge--${tone}`} title={label}>
      {count}
    </span>
  )
}

export function BlockLayoutOutline({ blocks, headingLevel = 3, layoutMetrics, onSelectBlock, selectedBlockId }) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'
  const topLevelBlocks = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks])
  const entries = useMemo(() => collectBlockOutlineEntries(topLevelBlocks, { resolveBlockLabel }), [topLevelBlocks])
  const metricMap = layoutMetrics?.bySelectionId ?? {}
  const measuredCount = entries.filter((entry) => metricMap[entry.selectionId]).length

  if (entries.length === 0) {
    return (
      <section className="block-layout-outline block-layout-outline--empty" aria-label="Layout layers">
        <div className="block-outline-header">
          <HeadingTag>Layout</HeadingTag>
        </div>
        <p>No rendered blocks yet.</p>
      </section>
    )
  }

  return (
    <section className="block-layout-outline" aria-label="Layout layers">
      <div className="block-outline-header">
        <HeadingTag>Layout</HeadingTag>
        <span>{measuredCount}/{entries.length} measured</span>
      </div>
      <ul className="block-layout-outline-list">
        {entries.map((entry) => {
          const selected = entry.selectionId === selectedBlockId
          const metric = metricMap[entry.selectionId]
          const elements = Array.isArray(metric?.elements) ? metric.elements : []

          return (
            <li className={`block-layout-outline-item block-layout-outline-item--${entry.kind}`} key={entry.id} style={{ '--block-outline-depth': entry.depth }}>
              <button
                aria-pressed={selected}
                className={`block-layout-outline-button${selected ? ' block-layout-outline-button--selected' : ''}`}
                disabled={!entry.selectionId}
                type="button"
                onClick={() => onSelectBlock?.(entry.selectionId)}
              >
                <span className="block-layout-outline-main">
                  <span className="block-layout-outline-label">{entry.label}</span>
                  <code>{entry.kind}</code>
                </span>
                <span className="block-layout-outline-box">{formatMetricBox(metric)}</span>
                {metric ? (
                  <span className="block-layout-outline-style">
                    {formatElementName(metric)} | {formatDisplayDetails(metric)}
                  </span>
                ) : null}
              </button>
              {elements.length > 0 ? (
                <ul className="block-layout-outline-elements">
                  {elements.map((element) => (
                    <li key={element.id}>
                      <code>{formatElementName(element)}</code>
                      <span>{formatMetricBox(element)}</span>
                      <span>{formatDisplayDetails(element)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function getVisibleEntries(entries, collapsedIds) {
  const visibleEntries = []
  let collapsedDepth = null

  entries.forEach((entry) => {
    if (collapsedDepth !== null && entry.depth > collapsedDepth) {
      return
    }

    if (collapsedDepth !== null && entry.depth <= collapsedDepth) {
      collapsedDepth = null
    }

    visibleEntries.push(entry)

    if (collapsedIds.has(entry.selectionId)) {
      collapsedDepth = entry.depth
    }
  })

  return visibleEntries
}

function getTopLevelBlockId(block, index) {
  const blockId = String(block?.id ?? '').trim()
  return blockId || `invalid-block-${index}`
}

function OutlineRow({ children, disabled, entry, sortable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    disabled: !sortable,
    id: entry.selectionId,
  })

  if (!sortable) {
    return (
      <li className={`block-outline-item block-outline-item--${entry.kind}`} style={{ '--block-outline-depth': entry.depth }}>
        {children(null)}
      </li>
    )
  }

  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      className={`block-outline-item block-outline-item--${entry.kind}${isDragging ? ' block-outline-item--dragging' : ''}`}
      ref={setNodeRef}
      style={{ ...style, '--block-outline-depth': entry.depth }}
    >
      {children(
        <EditorIconButton
          className="block-outline-drag-handle"
          disabled={disabled}
          icon={GripVertical}
          label={`Drag ${entry.label} to reorder`}
          {...attributes}
          {...listeners}
        />,
      )}
    </li>
  )
}

export function BlockOutline({
  blocks,
  disabled = false,
  headingLevel = 3,
  onBlocksChange,
  onSelectBlock,
  selectedBlockId,
  validation,
}) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const topLevelBlocks = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks])
  const entries = useMemo(() => collectBlockOutlineEntries(topLevelBlocks, { resolveBlockLabel }), [topLevelBlocks])
  const visibleEntries = useMemo(() => getVisibleEntries(entries, collapsedIds), [collapsedIds, entries])
  const issueMap = mapValidationIssuesToEntries(validation, entries)
  const blockCount = entries.filter((entry) => entry.kind === 'block').length
  const topLevelIds = topLevelBlocks.map((block, index) => getTopLevelBlockId(block, index))
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function toggleCollapsed(selectionId) {
    setCollapsedIds((current) => {
      const next = new Set(current)

      if (next.has(selectionId)) {
        next.delete(selectionId)
      } else {
        next.add(selectionId)
      }

      return next
    })
  }

  function handleAddBlock(type) {
    const newBlock = createBlockRecord(type)

    if (!newBlock) {
      return
    }

    onBlocksChange?.([...topLevelBlocks, newBlock])
    onSelectBlock?.(newBlock.id)
  }

  function handleDragEnd(event) {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = topLevelIds.indexOf(active.id)
    const newIndex = topLevelIds.indexOf(over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    onBlocksChange?.(arrayMove(topLevelBlocks, oldIndex, newIndex))
  }

  const addBlockAction = onBlocksChange ? (
    <BlockInserter label="Add block" onAddBlock={handleAddBlock} />
  ) : null

  if (entries.length === 0) {
    return (
      <section className="block-outline block-outline--empty" aria-label="Page layers">
        <div className="block-outline-header">
          <HeadingTag>Layers</HeadingTag>
        </div>
        <p>No blocks yet.</p>
        {addBlockAction}
      </section>
    )
  }

  return (
    <section className="block-outline" aria-label="Page layers">
      <div className="block-outline-header">
        <HeadingTag>Layers</HeadingTag>
        <span>{formatChildCount(blockCount)}</span>
      </div>
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          <ul className="block-outline-list">
            {visibleEntries.map((entry) => {
              const selected = entry.selectionId === selectedBlockId
              const nextEntry = entries[entries.indexOf(entry) + 1]
              const collapsible = Boolean(nextEntry && nextEntry.depth > entry.depth)
              const collapsed = collapsedIds.has(entry.selectionId)
              const sortable = entry.depth === 0 && entry.kind === 'block' && Boolean(onBlocksChange)

              return (
                <OutlineRow disabled={disabled} entry={entry} key={entry.id} sortable={sortable}>
                  {(dragHandle) => (
                    <div className="block-outline-row">
                      {dragHandle}

                      {collapsible ? (
                        <button
                          aria-expanded={!collapsed}
                          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${entry.label}`}
                          className="block-outline-collapse"
                          disabled={disabled}
                          type="button"
                          onClick={() => toggleCollapsed(entry.selectionId)}
                        >
                          {collapsed ? <ChevronRight aria-hidden="true" size={15} /> : <ChevronDown aria-hidden="true" size={15} />}
                        </button>
                      ) : (
                        <span className="block-outline-collapse-placeholder" />
                      )}

                      <button
                        aria-pressed={selected}
                        className={`${entry.kind === 'block' ? 'block-outline-button' : 'block-outline-container'}${
                          selected ? ` ${entry.kind === 'block' ? 'block-outline-button' : 'block-outline-container'}--selected` : ''
                        }`}
                        disabled={disabled || !entry.selectionId}
                        type="button"
                        onClick={() => onSelectBlock?.(entry.selectionId)}
                      >
                        <span className="block-outline-item-main">
                          <span className="block-outline-item-label">{entry.label}</span>
                          {entry.hidden ? <span className="block-outline-hidden-badge">Hidden</span> : null}
                          <OutlineIssueBadge issues={issueMap.get(entry.selectionId)} />
                        </span>
                        {entry.summary ? <span className="block-outline-item-summary">{entry.summary}</span> : null}
                        {entry.kind !== 'block' ? (
                          <span className="block-outline-item-summary">{formatChildCount(entry.childCount ?? 0)}</span>
                        ) : null}
                      </button>
                    </div>
                  )}
                </OutlineRow>
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {addBlockAction}
    </section>
  )
}
