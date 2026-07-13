import { useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { EditableImage } from './AdminInlinePageEdit'
import { BlockStyleFrame } from './BlockStyleFrame'
import {
  blockCategories,
  getBlockDefinition,
  listBlockDefinitions,
  makeBlockId,
  MAX_STRUCTURAL_NESTING_DEPTH,
  STRUCTURAL_BLOCK_TYPES,
} from '../lib/blockRegistry'
import { BLOCK_COLOR_SWATCHES, resolveBlockStyle } from '../lib/blockStyle'
import { getContentImageSrc } from '../lib/contentAssets'
import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { usePageEditor } from '../lib/usePageEditor'
import { useSiteShellContent } from '../lib/useSiteContent'

const SITE_COLOR_SWATCHES = [
  { label: 'Site Surface', value: 'var(--surface)' },
  { label: 'Soft Surface', value: 'var(--surface-soft)' },
  { label: 'Pale Surface', value: 'var(--surface-pale)' },
  { label: 'Card Surface', value: 'var(--card-background)' },
  { label: 'Body Text', value: 'var(--text)' },
  { label: 'Muted Text', value: 'var(--muted)' },
  { label: 'Heading', value: 'var(--brand-navy)' },
  { label: 'Link Blue', value: 'var(--brand-blue)' },
  { label: 'CTA Band', value: 'var(--home-band)' },
  { label: 'Hero Text', value: 'var(--hero-text)' },
]

function cloneBlockWithFreshIds(block) {
  const cloned = { ...block, id: makeBlockId() }

  if (Array.isArray(cloned.items)) {
    cloned.items = cloned.items.map((item) => ({
      ...item,
      id: makeBlockId(),
      blocks: Array.isArray(item.blocks) ? item.blocks.map(cloneBlockWithFreshIds) : item.blocks,
    }))
  }

  if (Array.isArray(cloned.columns)) {
    cloned.columns = cloned.columns.map((column) => ({
      ...column,
      id: makeBlockId(),
      blocks: Array.isArray(column.blocks) ? column.blocks.map(cloneBlockWithFreshIds) : column.blocks,
    }))
  }

  return cloned
}

function BlockPicker({ excludeTypes, onCancel, onPick }) {
  const definitionsByCategory = blockCategories
    .map((category) => ({
      ...category,
      definitions: listBlockDefinitions().filter(
        (definition) => definition.category === category.key && !excludeTypes.includes(definition.type),
      ),
    }))
    .filter((category) => category.definitions.length > 0)

  return (
    <div className="block-picker" onClick={(event) => event.stopPropagation()}>
      <div className="block-picker-header">
        <strong>Add a block</strong>
        <button className="button-link button-link--ghost" data-admin-inline-editable="true" type="button" onClick={onCancel}>
          Cancel
        </button>
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

function BlockInserter({ excludeTypes, label = '+ Add block', onAddBlock }) {
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
      <button className="block-inserter-button" data-admin-inline-editable="true" type="button" onClick={() => setPickerOpen(true)}>
        {label}
      </button>
    </div>
  )
}

function getColorInputValue(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '').trim()) ? value : '#ffffff'
}

function getColorSwatches() {
  const seenValues = new Set()

  return [...SITE_COLOR_SWATCHES, ...BLOCK_COLOR_SWATCHES].filter((swatch) => {
    if (seenValues.has(swatch.value)) {
      return false
    }

    seenValues.add(swatch.value)
    return true
  })
}

function ColorSwatchPicker({ onChange, value }) {
  const swatches = getColorSwatches()

  return (
    <div className="block-color-swatches">
      {swatches.map((swatch) => (
        <button
          aria-label={swatch.label}
          aria-pressed={value === swatch.value}
          className={`block-color-swatch${value === swatch.value ? ' block-color-swatch--active' : ''}`}
          data-admin-inline-editable="true"
          key={swatch.value}
          style={{ backgroundColor: swatch.value }}
          title={swatch.label}
          type="button"
          onClick={() => onChange(swatch.value)}
        />
      ))}
      <label className="block-color-swatch block-color-swatch--custom" data-admin-inline-editable="true" title="Choose a custom color">
        <input data-admin-inline-editable="true" type="color" value={getColorInputValue(value)} onChange={(event) => onChange(event.target.value)} />
      </label>
    </div>
  )
}

export function BlockStyleSettings({ block, path }) {
  const pageEditor = usePageEditor()
  const siteShell = useSiteShellContent()
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme).filter((preset) => preset.enabled !== false)
  const rawStyle = block.style && typeof block.style === 'object' && !Array.isArray(block.style) ? block.style : {}
  const selectedPresetId = String(rawStyle.presetId ?? '').trim()
  const style = resolveBlockStyle(rawStyle, stylePresets)

  function update(patch) {
    pageEditor?.updatePath([...path, 'style'], { ...rawStyle, ...patch })
  }

  function updateBackground(patch) {
    update({ background: { ...(rawStyle.background ?? {}), ...patch } })
  }

  function handlePresetChange(nextPresetId) {
    if (!nextPresetId) {
      const nextStyle = { ...rawStyle }
      delete nextStyle.presetId
      pageEditor?.updatePath([...path, 'style'], nextStyle)
      return
    }

    pageEditor?.updatePath([...path, 'style'], { presetId: nextPresetId })
  }

  return (
    <div className="block-toolbar-style-settings">
      <label className="block-toolbar-setting block-toolbar-setting--preset">
        <span>Site style</span>
        <select data-admin-inline-editable="true" value={selectedPresetId} onChange={(event) => handlePresetChange(event.target.value)}>
          <option value="">Custom</option>
          {stylePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block-toolbar-setting">
        <span>Width</span>
        <select data-admin-inline-editable="true" value={style.width} onChange={(event) => update({ width: event.target.value })}>
          <option value="full">Full</option>
          <option value="contained">Contained</option>
          <option value="narrow">Narrow</option>
        </select>
      </label>
      <label className="block-toolbar-setting">
        <span>Spacing</span>
        <select data-admin-inline-editable="true" value={style.spacing} onChange={(event) => update({ spacing: event.target.value })}>
          <option value="none">None</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </label>
      <label className="block-toolbar-setting">
        <span>Background</span>
        <select
          data-admin-inline-editable="true"
          value={style.background.type}
          onChange={(event) => {
            const nextType = event.target.value
            const nextColor = nextType === 'color' && !style.background.color ? '#f4f8fc' : style.background.color
            updateBackground({ color: nextColor, type: nextType })
          }}
        >
          <option value="none">None</option>
          <option value="color">Color</option>
          <option value="image">Image</option>
        </select>
      </label>
      {style.background.type === 'color' ? (
        <div className="block-toolbar-setting block-toolbar-setting--color">
          <span>Background color</span>
          <ColorSwatchPicker value={style.background.color} onChange={(color) => updateBackground({ color, type: 'color' })} />
        </div>
      ) : null}
      {style.background.type === 'image' ? (
        <div className="block-toolbar-setting block-toolbar-setting--image">
          <span>Background image</span>
          <EditableImage
            alt={style.background.image?.alt || ''}
            className="block-toolbar-image-picker"
            image={style.background.image ?? { kind: 'image' }}
            path={[...path, 'style', 'background', 'image']}
            src={getContentImageSrc(style.background.image, { width: 200 })}
          />
        </div>
      ) : null}
      <div className="block-toolbar-setting block-toolbar-setting--color">
        <span>Text color</span>
        <ColorSwatchPicker value={style.color} onChange={(color) => update({ color })} />
        {style.color ? (
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" type="button" onClick={() => update({ color: '' })}>
            Reset
          </button>
        ) : null}
      </div>
      <label className="block-toolbar-setting">
        <span>Align</span>
        <select data-admin-inline-editable="true" value={style.align} onChange={(event) => update({ align: event.target.value })}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label className="block-toolbar-setting">
        <span>Border</span>
        <select data-admin-inline-editable="true" value={style.border} onChange={(event) => update({ border: event.target.value })}>
          <option value="none">None</option>
          <option value="thin">Thin</option>
          <option value="thick">Thick</option>
        </select>
      </label>
      <label className="block-toolbar-setting">
        <span>Corners</span>
        <select data-admin-inline-editable="true" value={style.borderRadius} onChange={(event) => update({ borderRadius: event.target.value })}>
          <option value="none">Square</option>
          <option value="small">Rounded</option>
          <option value="large">Very rounded</option>
        </select>
      </label>
    </div>
  )
}

function BlockToolbar({ block, dragHandleProps, disableDown, disableUp, hidden, label, onDelete, onDuplicate, onMoveDown, onMoveUp, onToggleVisibility, path, settings }) {
  function handleDelete(event) {
    event.stopPropagation()

    if (window.confirm(`Remove the "${label}" block?`)) {
      onDelete()
    }
  }

  return (
    <div className="block-toolbar" onClick={(event) => event.stopPropagation()}>
      <div className="block-toolbar-row">
        <span className="block-toolbar-drag-handle" data-admin-inline-editable="true" title="Drag to reorder" {...dragHandleProps}>
          ⠿
        </span>
        <span className="block-toolbar-label">
          {label}
          {hidden ? <span className="block-toolbar-hidden-badge">Hidden</span> : null}
        </span>
        {settings ? <div className="block-toolbar-settings">{settings}</div> : null}
        <div className="block-toolbar-actions">
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" disabled={disableUp} type="button" onClick={onMoveUp}>
            Move up
          </button>
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" disabled={disableDown} type="button" onClick={onMoveDown}>
            Move down
          </button>
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" type="button" onClick={onToggleVisibility}>
            {hidden ? 'Show' : 'Hide'}
          </button>
          <button className="button-link button-link--ghost" data-admin-inline-editable="true" type="button" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>
      <div className="block-toolbar-row block-toolbar-row--style">
        <span className="block-toolbar-style-label">Style</span>
        <BlockStyleSettings block={block} path={path} />
      </div>
    </div>
  )
}

function SortableBlock({ children, id }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div className={`block-page-block${isDragging ? ' block-page-block--dragging' : ''}`} ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  )
}

export function BlockList({ blocks, context = {}, emptyMessage = 'No blocks yet. Use "Add block" below to get started.', excludeTypes = [], path }) {
  const pageEditor = usePageEditor()
  const editable = Boolean(pageEditor) && !pageEditor.disabled
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const depth = context.depth ?? 0
  const effectiveExcludeTypes =
    depth >= MAX_STRUCTURAL_NESTING_DEPTH ? Array.from(new Set([...excludeTypes, ...STRUCTURAL_BLOCK_TYPES])) : excludeTypes

  function replaceBlocks(nextBlocks) {
    pageEditor?.updatePath(path, nextBlocks)
  }

  function handleAddBlock(type, atIndex) {
    const definition = getBlockDefinition(type)

    if (!definition) {
      return
    }

    const newBlock = { id: makeBlockId(), type, ...definition.defaultData() }
    const nextBlocks = [...blocks]
    nextBlocks.splice(atIndex, 0, newBlock)
    replaceBlocks(nextBlocks)
    setSelectedBlockId(newBlock.id)
  }

  function handleRemoveBlock(index) {
    replaceBlocks(blocks.filter((_, entryIndex) => entryIndex !== index))
    setSelectedBlockId('')
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

    const clonedBlock = cloneBlockWithFreshIds(JSON.parse(JSON.stringify(sourceBlock)))
    const nextBlocks = [...blocks]
    nextBlocks.splice(index + 1, 0, clonedBlock)
    replaceBlocks(nextBlocks)
    setSelectedBlockId(clonedBlock.id)
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
    setSelectedBlockId('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setSelectedBlockId('')
    }
  }

  const renderedBlocks = blocks.map((block, index) => {
    const definition = getBlockDefinition(block.type)

    if (!definition) {
      return null
    }

    const Renderer = definition.Renderer
    const blockPath = [...path, index]

    if (block.hidden && !editable) {
      return null
    }

    if (!editable) {
      return (
        <div className="block-page-block" key={block.id ?? index}>
          <BlockStyleFrame block={block}>
            <Renderer block={block} context={context} path={blockPath} />
          </BlockStyleFrame>
        </div>
      )
    }

    const isSelected = selectedBlockId === block.id
    const SettingsComponent = definition.Settings

    return (
      <SortableBlock id={block.id} key={block.id}>
        {({ attributes, listeners }) => (
          <div
            className={`block-page-block-surface${isSelected ? ' block-page-block-surface--selected' : ''}${block.hidden ? ' block-page-block-surface--hidden' : ''}`}
            onClick={(event) => event.stopPropagation()}
            onClickCapture={(event) => {
              const target = event.target instanceof Element ? event.target : null
              const nearestSurface = target?.closest('.block-page-block-surface')

              if (nearestSurface === event.currentTarget) {
                setSelectedBlockId(block.id)
              }
            }}
          >
            {isSelected ? (
              <BlockInserter excludeTypes={effectiveExcludeTypes} label="+ Insert above" onAddBlock={(type) => handleAddBlock(type, index)} />
            ) : null}

            {isSelected ? (
              <BlockToolbar
                block={block}
                dragHandleProps={{ ...attributes, ...listeners }}
                disableDown={index === blocks.length - 1}
                disableUp={index === 0}
                hidden={Boolean(block.hidden)}
                label={definition.label}
                onDelete={() => handleRemoveBlock(index)}
                onDuplicate={() => handleDuplicateBlock(index)}
                onMoveDown={() => handleMoveBlock(index, 1)}
                onMoveUp={() => handleMoveBlock(index, -1)}
                onToggleVisibility={() => handleToggleVisibility(index)}
                path={blockPath}
                settings={SettingsComponent ? <SettingsComponent block={block} path={blockPath} /> : null}
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
          <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
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
