import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, closestCenter, KeyboardCode, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Columns2,
  Contact,
  FileText,
  FormInput,
  GalleryHorizontal,
  Image,
  LayoutGrid,
  List,
  MessageSquareQuote,
  Minus,
  MoreVertical,
  PanelTop,
  Rows3,
  SquareStack,
  Table2,
  Type,
  X,
} from 'lucide-react'
import { BlockInserter } from './BlockList'
import { blockCategories, createBlockRecord, getBlockDefinition, listBlockDefinitions, makeBlockId } from '../lib/blockRegistry'
import { collectBlockOutlineEntries, duplicateBlockAtPath, moveBlockAtPath, removeBlockAtPath } from '../lib/blockTree'
import { mapValidationIssuesToEntries } from '../lib/pageValidationIssues'

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

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

function getOutlineIcon(entry) {
  if (entry?.kind === 'group-item') {
    return SquareStack
  }

  if (entry?.kind === 'row-column') {
    return Columns2
  }

  switch (entry?.type) {
    case 'hero':
      return PanelTop
    case 'image-text-split':
    case 'two-column-text':
      return Columns2
    case 'feature-grid':
      return LayoutGrid
    case 'rich-text':
      return Type
    case 'image':
      return Image
    case 'cta-band':
      return PanelTop
    case 'testimonials':
      return MessageSquareQuote
    case 'image-gallery':
      return GalleryHorizontal
    case 'spacer':
      return Minus
    case 'directory-embed':
    case 'business-list':
      return List
    case 'contact-form':
      return FormInput
    case 'contact-details':
      return Contact
    case 'schedule':
      return CalendarDays
    case 'rate-table':
      return Table2
    case 'group':
      return SquareStack
    case 'row':
      return Rows3
    default:
      return FileText
  }
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

function getPathContainer(rootBlocks, blockPath) {
  if (!Array.isArray(rootBlocks) || !Array.isArray(blockPath) || blockPath[0] !== 'blocks') {
    return null
  }

  const index = blockPath[blockPath.length - 1]
  const containerPath = blockPath.slice(1, -1)
  const container = containerPath.reduce((current, segment) => current?.[segment], rootBlocks)

  if (!Array.isArray(container) || !Number.isInteger(index)) {
    return null
  }

  return { container, index }
}

function getInsertDefinitionsByCategory() {
  return blockCategories
    .map((category) => ({
      ...category,
      definitions: listBlockDefinitions().filter((definition) => definition.category === category.key),
    }))
    .filter((category) => category.definitions.length > 0)
}

function OutlineRow({ children, entry, sortable }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    disabled: !sortable,
    id: entry.selectionId,
  })

  if (!sortable) {
    return (
      <li className={`block-outline-item block-outline-item--${entry.kind}`} style={{ '--block-outline-depth': entry.depth }}>
        {children({})}
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
      {children({ dragAttributes: attributes, dragListeners: listeners })}
    </li>
  )
}

function PageOutlineButton({ disabled, onSelectPage, pageSelected }) {
  if (!onSelectPage) {
    return null
  }

  return (
    <button
      aria-pressed={pageSelected}
      className={`block-outline-page-button block-outline-button${pageSelected ? ' block-outline-button--selected block-outline-page-button--selected' : ''}`}
      disabled={disabled}
      type="button"
      onClick={onSelectPage}
    >
      <PanelTop aria-hidden="true" className="block-outline-item-icon" size={18} strokeWidth={2} />
      <span className="block-outline-item-main">
        <span className="block-outline-item-label">Page</span>
      </span>
    </button>
  )
}

export function BlockOutline({
  blocks,
  disabled = false,
  headingLevel = 3,
  onBlocksChange,
  onSelectBlock,
  onSelectPage,
  pageSelected = false,
  selectedBlockId,
  validation,
}) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())
  const [openMenuId, setOpenMenuId] = useState('')
  const [insertMenu, setInsertMenu] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const insertFlyoutRef = useRef(null)
  const topLevelBlocks = useMemo(() => (Array.isArray(blocks) ? blocks : []), [blocks])
  const entries = useMemo(() => collectBlockOutlineEntries(topLevelBlocks, { resolveBlockLabel }), [topLevelBlocks])
  const visibleEntries = useMemo(() => getVisibleEntries(entries, collapsedIds), [collapsedIds, entries])
  const issueMap = mapValidationIssuesToEntries(validation, entries)
  const blockCount = entries.filter((entry) => entry.kind === 'block').length
  const topLevelIds = topLevelBlocks.map((block, index) => getTopLevelBlockId(block, index))
  const insertDefinitionsByCategory = useMemo(() => getInsertDefinitionsByCategory(), [])
  const sensors = useSensors(
    // A distance threshold keeps a plain click on the row (select the block) from being
    // swallowed as a zero-movement drag -- dnd-kit suppresses the click that follows any
    // drag-candidate pointerdown, and the row button doubles as both the click target and
    // the drag handle here.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Enter must stay reserved for selecting the row; only Space starts a keyboard-driven
    // reorder, matching the drag handle convention used elsewhere in the editor.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { cancel: [KeyboardCode.Esc], end: [KeyboardCode.Space], start: [KeyboardCode.Space] },
    }),
  )

  useLayoutEffect(() => {
    if (!insertMenu || !insertFlyoutRef.current || typeof window === 'undefined') {
      return
    }

    const viewportPadding = 8
    const rect = insertFlyoutRef.current.getBoundingClientRect()
    const maxLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding)
    const maxTop = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding)
    const nextLeft = Math.min(Math.max(viewportPadding, insertMenu.left), maxLeft)
    const nextTop = Math.min(Math.max(viewportPadding, insertMenu.top), maxTop)

    if (Math.abs(nextLeft - insertMenu.left) > 0.5 || Math.abs(nextTop - insertMenu.top) > 0.5) {
      setInsertMenu((current) => (current ? { ...current, left: nextLeft, top: nextTop } : current))
    }
  }, [insertMenu])

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

  function handleSelectEntry(selectionId) {
    setOpenMenuId('')
    setInsertMenu(null)
    onSelectBlock?.(selectionId)
  }

  function handleMoveTopLevelBlock(selectionId, direction) {
    const oldIndex = topLevelIds.indexOf(selectionId)

    if (oldIndex === -1) {
      return
    }

    const newIndex = direction === 'top' ? 0 : topLevelBlocks.length - 1

    if (oldIndex === newIndex) {
      return
    }

    setOpenMenuId('')
    setInsertMenu(null)
    onBlocksChange?.(arrayMove(topLevelBlocks, oldIndex, newIndex))
  }

  function handleDuplicateEntry(entry) {
    const result = duplicateBlockAtPath({ blocks: topLevelBlocks }, entry.path, { makeId: makeBlockId })

    if (!result?.page?.blocks) {
      return
    }

    setOpenMenuId('')
    setInsertMenu(null)
    onBlocksChange?.(result.page.blocks)
    onSelectBlock?.(result.selectedBlockId)
  }

  function handleRemoveEntry(entry) {
    const result = removeBlockAtPath({ blocks: topLevelBlocks }, entry.path)

    if (!result?.page?.blocks) {
      return
    }

    setOpenMenuId('')
    setInsertMenu(null)
    onBlocksChange?.(result.page.blocks)
    onSelectBlock?.(result.selectedBlockId)
  }

  function handleMoveEntry(entry, direction) {
    const result = moveBlockAtPath({ blocks: topLevelBlocks }, entry.path, direction)

    if (!result?.page?.blocks) {
      return
    }

    setOpenMenuId('')
    setInsertMenu(null)
    onBlocksChange?.(result.page.blocks)
    onSelectBlock?.(result.selectedBlockId)
  }

  function openInsertFlyout(entry, placement, event) {
    const trigger = event?.currentTarget
    const rect = trigger?.getBoundingClientRect?.()
    const flyoutWidth = 288
    const flyoutHeight = 320
    const viewportPadding = 8
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
    const preferredRightLeft = rect ? rect.right - 1 : viewportPadding
    const preferredLeftLeft = rect ? rect.left - flyoutWidth + 1 : viewportPadding
    const rightFits = viewportWidth ? preferredRightLeft + flyoutWidth <= viewportWidth - viewportPadding : true
    const leftFits = preferredLeftLeft >= viewportPadding
    const rawLeft = rightFits || !leftFits ? preferredRightLeft : preferredLeftLeft
    const maxLeft = viewportWidth ? Math.max(viewportPadding, viewportWidth - flyoutWidth - viewportPadding) : rawLeft
    const left = Math.min(Math.max(viewportPadding, rawLeft), maxLeft)
    const maxTop = viewportHeight ? Math.max(viewportPadding, viewportHeight - flyoutHeight - viewportPadding) : rect?.top ?? viewportPadding
    const top = rect ? Math.min(Math.max(viewportPadding, rect.top), maxTop) : viewportPadding

    setInsertMenu({
      entryId: entry.selectionId,
      left,
      placement,
      top,
    })
  }

  async function handleCopyEntry(entry) {
    const context = getPathContainer(topLevelBlocks, entry.path)
    const block = context?.container?.[context.index]

    if (!block || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return
    }

    await navigator.clipboard.writeText(JSON.stringify(block, null, 2))
    setOpenMenuId('')
    setInsertMenu(null)
  }

  function handleInsertEntryBlock(entry, placement, type) {
    const newBlock = createBlockRecord(type)

    if (!newBlock) {
      return
    }

    const nextBlocks = cloneValue(topLevelBlocks)
    const context = getPathContainer(nextBlocks, entry.path)

    if (!context) {
      return
    }

    context.container.splice(placement === 'before' ? context.index : context.index + 1, 0, newBlock)
    setOpenMenuId('')
    setInsertMenu(null)
    onBlocksChange?.(nextBlocks)
    onSelectBlock?.(newBlock.id)
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

  function renderInsertFlyout(entry, placement) {
    if (
      insertMenu?.entryId !== entry.selectionId ||
      insertMenu.placement !== placement ||
      typeof document === 'undefined'
    ) {
      return null
    }

    return createPortal(
      <div
        className="block-outline-insert-picker"
        ref={insertFlyoutRef}
        role="menu"
        style={{ '--block-outline-flyout-left': `${insertMenu.left}px`, '--block-outline-flyout-top': `${insertMenu.top}px` }}
        aria-label={`Choose block to insert ${placement} ${entry.label}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {insertDefinitionsByCategory.map((category) => (
          <div className="block-outline-insert-category" key={category.key}>
            <span>{category.label}</span>
            {category.definitions.map((definition) => (
              <button
                key={definition.type}
                type="button"
                role="menuitem"
                onClick={() => handleInsertEntryBlock(entry, placement, definition.type)}
              >
                {definition.label}
              </button>
            ))}
          </div>
        ))}
      </div>,
      document.body,
    )
  }

  const addBlockAction = onBlocksChange ? (
    <BlockInserter label="Add block" onAddBlock={handleAddBlock} />
  ) : null

  if (!panelOpen) {
    return (
      <section className="block-outline block-outline--closed" aria-label="Page layers">
        <button className="block-outline-reopen" type="button" onClick={() => setPanelOpen(true)}>
          <List aria-hidden="true" size={18} strokeWidth={2} />
          <span>List view</span>
        </button>
      </section>
    )
  }

  if (entries.length === 0) {
    return (
      <section className="block-outline block-outline--empty" aria-label="Page layers">
        <div className="block-outline-header">
          <HeadingTag>List view</HeadingTag>
          <button className="block-outline-close" type="button" aria-label="Close list view" onClick={() => setPanelOpen(false)}>
            <X aria-hidden="true" size={20} strokeWidth={2.25} />
          </button>
        </div>
        <PageOutlineButton disabled={disabled} pageSelected={pageSelected} onSelectPage={onSelectPage} />
        <p>No blocks yet.</p>
        {addBlockAction}
      </section>
    )
  }

  return (
    <section className="block-outline" aria-label="Page layers">
      <div className="block-outline-header">
        <HeadingTag>List view</HeadingTag>
        <div className="block-outline-header-actions">
          <span>{formatChildCount(blockCount)}</span>
          <button className="block-outline-close" type="button" aria-label="Close list view" onClick={() => setPanelOpen(false)}>
            <X aria-hidden="true" size={20} strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <PageOutlineButton disabled={disabled} pageSelected={pageSelected} onSelectPage={onSelectPage} />
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          <ul className="block-outline-list">
            {visibleEntries.map((entry) => {
              const selected = entry.selectionId === selectedBlockId
              const nextEntry = entries[entries.indexOf(entry) + 1]
              const collapsible = Boolean(nextEntry && nextEntry.depth > entry.depth)
              const collapsed = collapsedIds.has(entry.selectionId)
              const sortable = entry.depth === 0 && entry.kind === 'block' && Boolean(onBlocksChange)
              const EntryIcon = getOutlineIcon(entry)

              return (
                <OutlineRow entry={entry} key={entry.id} sortable={sortable}>
                  {({ dragAttributes, dragListeners }) => (
                    <div className={`block-outline-row${selected ? ' block-outline-row--selected' : ''}${sortable ? ' block-outline-row--sortable' : ''}`}>
                      {collapsible ? (
                        <button
                          aria-expanded={!collapsed}
                          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${entry.label}`}
                          className="block-outline-collapse"
                          disabled={disabled}
                          type="button"
                          onClick={() => {
                            setOpenMenuId('')
                            toggleCollapsed(entry.selectionId)
                          }}
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
                        {...(dragAttributes ?? {})}
                        {...(dragListeners ?? {})}
                        onClick={() => handleSelectEntry(entry.selectionId)}
                      >
                        <EntryIcon aria-hidden="true" className="block-outline-item-icon" size={18} strokeWidth={2} />
                        <span className="block-outline-item-main">
                          <span className="block-outline-item-label">{entry.label}</span>
                          {entry.hidden ? <span className="block-outline-hidden-badge">Hidden</span> : null}
                          <OutlineIssueBadge issues={issueMap.get(entry.selectionId)} />
                        </span>
                        {entry.kind !== 'block' ? (
                          <span className="block-outline-item-summary">{formatChildCount(entry.childCount ?? 0)}</span>
                        ) : null}
                      </button>
                      <button
                        aria-label={`More options for ${entry.label}`}
                        className="block-outline-more"
                        disabled={disabled || !entry.selectionId}
                        title="More options"
                        type="button"
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectBlock?.(entry.selectionId)
                          setInsertMenu(null)
                          setOpenMenuId((current) => (current === entry.selectionId ? '' : entry.selectionId))
                        }}
                      >
                        <MoreVertical aria-hidden="true" size={17} strokeWidth={2.4} />
                      </button>
                      {openMenuId === entry.selectionId ? (
                        <div
                          className="block-outline-menu"
                          role="menu"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <button type="button" role="menuitem" onClick={() => handleSelectEntry(entry.selectionId)}>
                            Show more settings
                          </button>
                          {entry.kind === 'block' ? (
                            <>
                              <button type="button" role="menuitem" onClick={() => handleCopyEntry(entry)}>
                                Copy
                              </button>
                              <button type="button" role="menuitem" onClick={() => handleDuplicateEntry(entry)}>
                                Duplicate
                              </button>
                              <div className="block-outline-menu-flyout-row">
                                <button
                                  aria-expanded={insertMenu?.entryId === entry.selectionId && insertMenu.placement === 'before'}
                                  className={`block-outline-menu-flyout-trigger${
                                    insertMenu?.entryId === entry.selectionId && insertMenu.placement === 'before'
                                      ? ' block-outline-menu-flyout-trigger--open'
                                      : ''
                                  }`}
                                  type="button"
                                  role="menuitem"
                                  onFocus={(event) => openInsertFlyout(entry, 'before', event)}
                                  onMouseEnter={(event) => openInsertFlyout(entry, 'before', event)}
                                  onClick={(event) => openInsertFlyout(entry, 'before', event)}
                                >
                                  <span>Insert before</span>
                                  <ChevronRight aria-hidden="true" size={15} strokeWidth={2.25} />
                                </button>
                                {renderInsertFlyout(entry, 'before')}
                              </div>
                              <div className="block-outline-menu-flyout-row">
                                <button
                                  aria-expanded={insertMenu?.entryId === entry.selectionId && insertMenu.placement === 'after'}
                                  className={`block-outline-menu-flyout-trigger${
                                    insertMenu?.entryId === entry.selectionId && insertMenu.placement === 'after'
                                      ? ' block-outline-menu-flyout-trigger--open'
                                      : ''
                                  }`}
                                  type="button"
                                  role="menuitem"
                                  onFocus={(event) => openInsertFlyout(entry, 'after', event)}
                                  onMouseEnter={(event) => openInsertFlyout(entry, 'after', event)}
                                  onClick={(event) => openInsertFlyout(entry, 'after', event)}
                                >
                                  <span>Insert after</span>
                                  <ChevronRight aria-hidden="true" size={15} strokeWidth={2.25} />
                                </button>
                                {renderInsertFlyout(entry, 'after')}
                              </div>
                              <button type="button" role="menuitem" onClick={() => handleMoveEntry(entry, -1)}>
                                Move up
                              </button>
                              <button type="button" role="menuitem" onClick={() => handleMoveEntry(entry, 1)}>
                                Move down
                              </button>
                            </>
                          ) : null}
                          {collapsible ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuId('')
                                toggleCollapsed(entry.selectionId)
                              }}
                            >
                              {collapsed ? 'Expand' : 'Collapse'}
                            </button>
                          ) : null}
                          {sortable ? (
                            <>
                              <button type="button" role="menuitem" onClick={() => handleMoveTopLevelBlock(entry.selectionId, 'top')}>
                                Move to top
                              </button>
                              <button type="button" role="menuitem" onClick={() => handleMoveTopLevelBlock(entry.selectionId, 'bottom')}>
                                Move to bottom
                              </button>
                            </>
                          ) : null}
                          {entry.kind === 'block' ? (
                            <button className="block-outline-menu-danger" type="button" role="menuitem" onClick={() => handleRemoveEntry(entry)}>
                              Remove block
                            </button>
                          ) : null}
                        </div>
                      ) : null}
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
