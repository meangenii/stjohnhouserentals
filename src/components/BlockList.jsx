import { useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Plus, Trash2, X } from 'lucide-react'
import { BlockStyleFrame } from './BlockStyleFrame'
import { EditorIconButton } from './EditorIconButton'
import {
  blockCategories,
  createBlockRecord,
  getBlockDefinition,
  listBlockDefinitions,
  makeBlockId,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} from '../lib/blockRegistry'
import { getBlockVisibilityClassNames, isBlockVisibleOnDevice } from '../lib/blockResponsive'
import { getRenderableBlockAnchorId } from '../lib/blockAnchors'
import { cloneBlockWithFreshIds } from '../lib/blockTree'
import { BLOCK_WIDTH_OPTIONS } from '../lib/blockStyle'
import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { usePageEditor } from '../lib/usePageEditor'
import { useSiteShellContent } from '../lib/useSiteContent'

function BlockPicker({ excludeTypes = [], onCancel, onPick }) {
  const excludedTypes = Array.isArray(excludeTypes) ? excludeTypes : []
  const definitionsByCategory = blockCategories
    .map((category) => ({
      ...category,
      definitions: listBlockDefinitions().filter(
        (definition) => definition.category === category.key && !excludedTypes.includes(definition.type),
      ),
    }))
    .filter((category) => category.definitions.length > 0)

  return (
    <div className="block-picker" onClick={(event) => event.stopPropagation()}>
      <div className="block-picker-header">
        <strong>Add a block</strong>
        <EditorIconButton data-admin-inline-editable="true" icon={X} label="Cancel" onClick={onCancel} />
      </div>
      {definitionsByCategory.map((category) => (
        <div className="block-picker-category" key={category.key}>
          <span className="block-picker-category-label">{category.label}</span>
          <div className="block-picker-list">
            {category.definitions.map((definition) => (
              <button
                className="block-picker-option"
                data-admin-inline-editable="true"
                key={definition.type}
                type="button"
                onClick={() => onPick(definition.type)}
              >
                {definition.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function BlockInserter({ excludeTypes = [], label = '+ Add block', onAddBlock }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  if (pickerOpen) {
    return (
      <BlockPicker
        excludeTypes={excludeTypes}
        onCancel={() => setPickerOpen(false)}
        onPick={(type) => {
          setPickerOpen(false)
          onAddBlock(type)
        }}
      />
    )
  }

  return (
    <div className="block-inserter" onClick={(event) => event.stopPropagation()}>
      <EditorIconButton
        className="block-inserter-button"
        data-admin-inline-editable="true"
        icon={Plus}
        label={label}
        onClick={() => setPickerOpen(true)}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      />
    </div>
  )
}

export function UnsupportedBlockFallback({ editable = false, type = '' }) {
  const blockType = String(type ?? '').trim() || 'missing type'

  if (!editable) {
    return (
      <section className="block-unsupported block-unsupported--public" aria-label="Unavailable page section">
        <p>This section is currently unavailable.</p>
      </section>
    )
  }

  return (
    <section className="block-unsupported block-unsupported--editor" role="alert">
      <strong>Unsupported block type</strong>
      <p>
        <code>{blockType}</code> is not registered. Its stored content is preserved, but this block cannot be edited or published.
      </p>
    </section>
  )
}

function BlockToolbar({
  deviceHidden,
  dragHandleProps,
  disableDown,
  disableUp,
  hidden,
  label,
  onDelete,
  onDuplicate,
  onMoveDown,
  onMoveUp,
  onToggleVisibility,
}) {
  function handleDelete(event) {
    event.stopPropagation()

    if (window.confirm(`Remove the "${label}" block?`)) {
      onDelete()
    }
  }

  return (
    <div className="block-toolbar" onClick={(event) => event.stopPropagation()}>
      <div className="block-toolbar-row">
        <div className="block-toolbar-identity">
          <EditorIconButton
            className="block-toolbar-drag-handle"
            data-admin-inline-editable="true"
            icon={GripVertical}
            label={`Drag ${label} to reorder`}
            {...dragHandleProps}
          />
          <span className="block-toolbar-label">
            {label}
            {hidden ? <span className="block-toolbar-hidden-badge">Hidden</span> : null}
            {deviceHidden ? <span className="block-toolbar-hidden-badge">Hidden on preview</span> : null}
          </span>
        </div>
        <div className="block-toolbar-actions">
          <EditorIconButton data-admin-inline-editable="true" disabled={disableUp} icon={ArrowUp} label="Move up" onClick={onMoveUp} />
          <EditorIconButton data-admin-inline-editable="true" disabled={disableDown} icon={ArrowDown} label="Move down" onClick={onMoveDown} />
          <EditorIconButton data-admin-inline-editable="true" icon={Copy} label="Duplicate" onClick={onDuplicate} />
          <EditorIconButton
            data-admin-inline-editable="true"
            icon={hidden ? Eye : EyeOff}
            label={hidden ? 'Show' : 'Hide'}
            onClick={onToggleVisibility}
          />
          <EditorIconButton data-admin-inline-editable="true" icon={Trash2} label="Delete" tone="danger" onClick={handleDelete} />
        </div>
      </div>
    </div>
  )
}

function getConfiguredBlockWidth(block, stylePresets = []) {
  const explicitWidth = String(block?.style?.width ?? '').trim()

  if (BLOCK_WIDTH_OPTIONS.includes(explicitWidth)) {
    return explicitWidth
  }

  const presetId = String(block?.style?.presetId ?? '').trim()
  const preset = presetId ? stylePresets.find((entry) => entry?.enabled !== false && String(entry?.id ?? '').trim() === presetId) : null
  const presetWidth = String(preset?.style?.width ?? '').trim()

  return BLOCK_WIDTH_OPTIONS.includes(presetWidth) ? presetWidth : ''
}

function getBlockLayoutClassName(block, definition, stylePresets = []) {
  const configuredWidth = getConfiguredBlockWidth(block, stylePresets)

  if (configuredWidth === 'full') {
    return 'block-page-block--layout-bleed'
  }

  if (configuredWidth === 'narrow') {
    return 'block-page-block--layout-narrow'
  }

  if (configuredWidth === 'contained') {
    return 'block-page-block--layout-contained'
  }

  return `block-page-block--layout-${definition?.layout === 'bleed' ? 'bleed' : 'contained'}`
}

function SortableBlock({ anchorId, children, id, layoutClassName = 'block-page-block--layout-contained' }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      className={`block-page-block ${layoutClassName}${isDragging ? ' block-page-block--dragging' : ''}`}
      id={anchorId || undefined}
      ref={setNodeRef}
      style={style}
    >
      {children({ attributes, listeners })}
    </div>
  )
}

function getSortableBlockId(block, path, index) {
  const blockId = String(block?.id ?? '').trim()

  if (blockId) {
    return blockId
  }

  const pathLabel = Array.isArray(path) ? path.join('-') : 'blocks'
  return `invalid-block-${pathLabel}-${index}`
}

export function BlockList({ blocks, context = {}, emptyMessage = 'No blocks yet. Use "Add block" below to get started.', excludeTypes = [], path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const [localSelectedBlockId, setLocalSelectedBlockId] = useState('')
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const depth = context.depth ?? 0
  const effectiveExcludeTypes =
    depth >= MAX_STRUCTURAL_NESTING_DEPTH ? Array.from(new Set([...excludeTypes, ...STRUCTURAL_BLOCK_TYPES])) : excludeTypes
  const hasSharedSelection = typeof pageEditor?.setSelectedBlockId === 'function'
  const selectedBlockId = hasSharedSelection ? pageEditor.selectedBlockId : localSelectedBlockId
  const previewDevice = pageEditor?.device ?? context.device ?? 'desktop'
  const siteShell = useSiteShellContent()
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme)

  function selectBlock(blockId) {
    if (hasSharedSelection) {
      pageEditor.setSelectedBlockId(blockId)
      return
    }

    setLocalSelectedBlockId(blockId)
  }

  function replaceBlocks(nextBlocks) {
    pageEditor?.updatePath(path, nextBlocks)
  }

  function handleAddBlock(type, atIndex) {
    const definition = getBlockDefinition(type)

    if (!definition) {
      return
    }

    const newBlock = createBlockRecord(type)

    if (!newBlock) {
      return
    }
    const nextBlocks = [...blocks]
    nextBlocks.splice(atIndex, 0, newBlock)
    replaceBlocks(nextBlocks)
    selectBlock(newBlock.id)
  }

  function handleRemoveBlock(index) {
    replaceBlocks(blocks.filter((_, entryIndex) => entryIndex !== index))
    selectBlock('')
  }

  function handleMoveBlock(index, direction) {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= blocks.length) {
      return
    }

    replaceBlocks(arrayMove(blocks, index, nextIndex))
  }

  function handleDuplicateBlock(index) {
    const sourceBlock = blocks[index]

    if (!sourceBlock) {
      return
    }

    const clonedBlock = cloneBlockWithFreshIds(sourceBlock, makeBlockId)
    const nextBlocks = [...blocks]
    nextBlocks.splice(index + 1, 0, clonedBlock)
    replaceBlocks(nextBlocks)
    selectBlock(clonedBlock.id)
  }

  function handleToggleVisibility(index) {
    pageEditor?.updatePath([...path, index, 'hidden'], !blocks[index]?.hidden)
  }

  function handleDragEnd(event) {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = blocks.findIndex((block) => block.id === active.id)
    const newIndex = blocks.findIndex((block) => block.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    replaceBlocks(arrayMove(blocks, oldIndex, newIndex))
  }

  function handleBackgroundClick() {
    selectBlock('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      selectBlock('')
    }
  }

  const renderedBlocks = blocks.map((block, index) => {
    const definition = getBlockDefinition(block.type)
    const blockPath = [...path, index]
    const anchorId = getRenderableBlockAnchorId(block.anchorId)
    const sortableId = getSortableBlockId(block, path, index)
    const selectionId = String(block.id ?? '').trim() || sortableId

    if (block.hidden && !editable) {
      return null
    }

    if (!definition) {
      const layoutClassName = getBlockLayoutClassName(block, definition, stylePresets)

      if (!editable) {
        const visibilityClassNames = getBlockVisibilityClassNames(block).join(' ')

        return (
          <div
            className={`block-page-block ${layoutClassName}${visibilityClassNames ? ` ${visibilityClassNames}` : ''}`}
            id={anchorId || undefined}
            key={sortableId}
            tabIndex={anchorId ? -1 : undefined}
          >
            <UnsupportedBlockFallback type={block.type} />
          </div>
        )
      }

      const isSelected = selectedBlockId === selectionId
      const deviceHidden = block.hidden !== true && !isBlockVisibleOnDevice(block, previewDevice)
      const editorLabel = String(block.editorLabel ?? '').trim() || `Unsupported: ${String(block.type ?? '').trim() || 'Missing type'}`

      return (
        <SortableBlock anchorId={anchorId} id={sortableId} key={sortableId} layoutClassName={layoutClassName}>
          {({ attributes, listeners }) => (
            <div
              className={`block-page-block-surface${isSelected ? ' block-page-block-surface--selected' : ''}${block.hidden ? ' block-page-block-surface--hidden' : ''}${deviceHidden ? ' block-page-block-surface--device-hidden' : ''}`}
              data-block-page-block-id={block.id ?? ''}
              data-editor-selection-id={selectionId}
              onClick={(event) => event.stopPropagation()}
              onClickCapture={(event) => {
                const target = event.target instanceof Element ? event.target : null
                const nearestSurface = target?.closest('.block-page-block-surface')

                if (nearestSurface === event.currentTarget) {
                  selectBlock(selectionId)
                }
              }}
            >
              {isSelected ? (
                <BlockInserter excludeTypes={effectiveExcludeTypes} label="+ Insert above" onAddBlock={(type) => handleAddBlock(type, index)} />
              ) : null}

              {isSelected ? (
                <BlockToolbar
                  deviceHidden={deviceHidden}
                  dragHandleProps={{ ...attributes, ...listeners }}
                  disableDown={index === blocks.length - 1}
                  disableUp={index === 0}
                  hidden={Boolean(block.hidden)}
                  label={editorLabel}
                  onDelete={() => handleRemoveBlock(index)}
                  onDuplicate={() => handleDuplicateBlock(index)}
                  onMoveDown={() => handleMoveBlock(index, 1)}
                  onMoveUp={() => handleMoveBlock(index, -1)}
                  onToggleVisibility={() => handleToggleVisibility(index)}
                />
              ) : null}

              <UnsupportedBlockFallback editable type={block.type} />

              {isSelected ? (
                <BlockInserter excludeTypes={effectiveExcludeTypes} label="+ Insert below" onAddBlock={(type) => handleAddBlock(type, index + 1)} />
              ) : null}
            </div>
          )}
        </SortableBlock>
      )
    }

    const Renderer = definition.Renderer
    const editorLabel = String(block.editorLabel ?? '').trim() || definition.label
    const layoutClassName = getBlockLayoutClassName(block, definition, stylePresets)

    if (!editable) {
      const visibilityClassNames = getBlockVisibilityClassNames(block).join(' ')

      return (
        <div
          className={`block-page-block ${layoutClassName}${visibilityClassNames ? ` ${visibilityClassNames}` : ''}`}
          id={anchorId || undefined}
          key={block.id ?? index}
          tabIndex={anchorId ? -1 : undefined}
        >
          <BlockStyleFrame block={block}>
            <Renderer block={block} context={context} path={blockPath} />
          </BlockStyleFrame>
        </div>
      )
    }

    const isSelected = selectedBlockId === block.id
    const deviceHidden = block.hidden !== true && !isBlockVisibleOnDevice(block, previewDevice)

    return (
      <SortableBlock anchorId={anchorId} id={sortableId} key={sortableId} layoutClassName={layoutClassName}>
        {({ attributes, listeners }) => (
          <div
            className={`block-page-block-surface${isSelected ? ' block-page-block-surface--selected' : ''}${block.hidden ? ' block-page-block-surface--hidden' : ''}${deviceHidden ? ' block-page-block-surface--device-hidden' : ''}`}
            data-block-page-block-id={block.id ?? ''}
            data-editor-selection-id={block.id ?? ''}
            onClick={(event) => event.stopPropagation()}
            onClickCapture={(event) => {
              const target = event.target instanceof Element ? event.target : null
              const nearestSurface = target?.closest('.block-page-block-surface')

              if (nearestSurface === event.currentTarget) {
                selectBlock(block.id)
              }
            }}
          >
            {isSelected ? (
              <BlockInserter excludeTypes={effectiveExcludeTypes} label="+ Insert above" onAddBlock={(type) => handleAddBlock(type, index)} />
            ) : null}

            {isSelected ? (
              <BlockToolbar
                deviceHidden={deviceHidden}
                dragHandleProps={{ ...attributes, ...listeners }}
                disableDown={index === blocks.length - 1}
                disableUp={index === 0}
                hidden={Boolean(block.hidden)}
                label={editorLabel}
                onDelete={() => handleRemoveBlock(index)}
                onDuplicate={() => handleDuplicateBlock(index)}
                onMoveDown={() => handleMoveBlock(index, 1)}
                onMoveUp={() => handleMoveBlock(index, -1)}
                onToggleVisibility={() => handleToggleVisibility(index)}
              />
            ) : null}

            <BlockStyleFrame block={block}>
              <Renderer block={block} context={context} path={blockPath} />
            </BlockStyleFrame>

            {isSelected ? (
              <BlockInserter excludeTypes={effectiveExcludeTypes} label="+ Insert below" onAddBlock={(type) => handleAddBlock(type, index + 1)} />
            ) : null}
          </div>
        )}
      </SortableBlock>
    )
  })

  return (
    <div className="block-list" role="presentation" onClick={editable ? handleBackgroundClick : undefined} onKeyDown={editable ? handleKeyDown : undefined}>
      {editable ? (
        <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((block, index) => getSortableBlockId(block, path, index))} strategy={verticalListSortingStrategy}>
            {renderedBlocks}
          </SortableContext>
        </DndContext>
      ) : (
        renderedBlocks
      )}

      {editable && blocks.length === 0 ? (
        <>
          <p className="admin-empty">{emptyMessage}</p>
          <BlockInserter excludeTypes={effectiveExcludeTypes} onAddBlock={(type) => handleAddBlock(type, 0)} />
        </>
      ) : null}
    </div>
  )
}
