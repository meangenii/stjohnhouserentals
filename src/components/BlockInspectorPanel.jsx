import { useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Trash2 } from 'lucide-react'
import { AdminMediaManager } from './AdminMediaManager'
import { MAX_BLOCK_ANCHOR_LENGTH, MAX_BLOCK_EDITOR_LABEL_LENGTH, normalizeBlockAnchorId } from '../lib/blockAnchors'
import { getBlockDefinition } from '../lib/blockRegistry'
import {
  BLOCK_VISIBILITY_FLAGS,
  ROW_MOBILE_COLUMN_OPTIONS,
  getRowMobileColumnOrder,
  normalizeBlockVisibility,
  normalizeRowResponsive,
  setBlockDeviceVisibility,
  setRowMobileColumnOrder,
  setRowMobileColumns,
} from '../lib/blockResponsive'
import {
  BLOCK_ALIGN_OPTIONS,
  BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS,
  BLOCK_BACKGROUND_OVERLAY_OPTIONS,
  BLOCK_BACKGROUND_TYPES,
  BLOCK_BORDER_OPTIONS,
  BLOCK_BORDER_RADIUS_OPTIONS,
  BLOCK_COLOR_SWATCHES,
  BLOCK_SPACING_OPTIONS,
  BLOCK_WIDTH_OPTIONS,
  isDefaultBlockStyle,
  resolveBlockStyle,
} from '../lib/blockStyle'
import { collectBlockOutlineEntries, findBlockOutlineEntry, getBlockValueAtPath } from '../lib/blockTree'
import { getBlockElementStyleTargets } from '../lib/blockElementStyleTargets'
import { clearBlockImageSource, selectManagedBlockImage } from '../lib/blockImageValue'
import { getContentImageSrc } from '../lib/contentAssets'
import { updateValueAtPath } from '../lib/inlinePageEditor'
import { buildRouteOptions } from '../lib/linkRecords'
import { MAX_PAGE_ROUTE_ALIASES, normalizePageRoutePath } from '../lib/pageRouteSettings'
import { applyRowLayoutPreset, getRowLayoutPresetId, MAX_ROW_COLUMN_WIDTH, moveRowColumn, ROW_LAYOUT_PRESETS } from '../lib/blockRowLayout'
import {
  getPageLevelValidationIssues,
  getValidationIssueInspectorTab,
  getValidationIssuesForPath,
  mapValidationIssuesToEntries,
} from '../lib/pageValidationIssues'
import { getSiteThemeElementStylePresets } from '../lib/siteThemeSettings'
import { AdminLinkFields } from './AdminLinkFields'
import { AdminRichTextEditor } from './AdminRichTextEditor'
import { EditorIconButton } from './EditorIconButton'

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

const BLOCK_INSPECTOR_TABS = [
  { id: 'content', label: 'Content' },
  { id: 'layout', label: 'Layout', types: ['row'] },
  { id: 'style', label: 'Style' },
  { id: 'responsive', label: 'Responsive' },
  { id: 'settings', label: 'Settings' },
]

const GROUP_ITEM_INSPECTOR_TABS = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
]

const ROW_COLUMN_INSPECTOR_TABS = [
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
]

const PAGE_INSPECTOR_TABS = [
  { id: 'style', label: 'Style' },
  { id: 'settings', label: 'Settings' },
]

const STYLE_OPTION_LABELS = {
  align: {
    center: 'Center',
    left: 'Left',
    right: 'Right',
  },
  background: {
    color: 'Color',
    image: 'Image',
    none: 'None',
  },
  backgroundFocalPoint: {
    bottom: 'Bottom',
    'bottom-left': 'Bottom left',
    'bottom-right': 'Bottom right',
    center: 'Center',
    left: 'Left',
    right: 'Right',
    top: 'Top',
    'top-left': 'Top left',
    'top-right': 'Top right',
  },
  backgroundOverlay: {
    brand: 'Brand',
    dark: 'Dark',
    light: 'Light',
    none: 'None',
  },
  border: {
    none: 'None',
    thick: 'Thick',
    thin: 'Thin',
  },
  borderRadius: {
    large: 'Very rounded',
    none: 'Square',
    small: 'Rounded',
  },
  spacing: {
    large: 'Large',
    medium: 'Medium',
    none: 'None',
    small: 'Small',
  },
  width: {
    contained: 'Contained',
    full: 'Full',
    narrow: 'Narrow',
  },
}

const RESPONSIVE_OPTION_LABELS = {
  preserve: 'Preserve',
  stack: 'Stack',
}

function resolveBlockLabel(type) {
  return getBlockDefinition(type)?.label ?? ''
}

function formatPath(path) {
  return Array.isArray(path) && path.length > 0 ? path.join('.') : 'page'
}

function pathKey(path) {
  return Array.isArray(path) ? path.join('.') : ''
}

function appendPath(basePath, relativePath) {
  return [...(Array.isArray(basePath) ? basePath : []), ...(Array.isArray(relativePath) ? relativePath : [])]
}

function getValueAtPath(value, path) {
  return (Array.isArray(path) ? path : []).reduce((current, segment) => current?.[segment], value)
}

function formatListItemTitle(singularLabel, index, item) {
  const title = String(item?.title ?? item?.name ?? item?.label ?? item?.author ?? '').trim()
  return title || `${singularLabel || 'Item'} ${index + 1}`
}

function getPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

function getColorInputValue(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? '').trim()) ? value : '#ffffff'
}

function formatStyleOption(group, value) {
  return STYLE_OPTION_LABELS[group]?.[value] ?? value
}

function InspectorHeader({ eyebrow, headingTag: HeadingTag = 'h3', title }) {
  return (
    <div className="block-inspector-header">
      <span>{eyebrow}</span>
      <HeadingTag>{title}</HeadingTag>
    </div>
  )
}

function InspectorIssueSummary({ issues = [], onActivateIssue }) {
  if (issues.length === 0) {
    return null
  }

  return (
    <section className="block-inspector-issues" aria-label="Selection checks">
      <strong>Checks</strong>
      <ul>
        {issues.slice(0, 6).map((issue) => (
          <li key={`${issue.severity}:${issue.code}:${issue.path}:${issue.message}`}>
            <button
              className={`block-inspector-issue block-inspector-issue--${issue.severity}`}
              disabled={!onActivateIssue}
              type="button"
              onClick={() => onActivateIssue?.(issue)}
            >
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function InspectorFieldIssues({ issues = [] }) {
  if (issues.length === 0) {
    return null
  }

  return (
    <div className="block-inspector-field-issues">
      {issues.map((issue) => (
        <p className={`block-inspector-field-issue block-inspector-field-issue--${issue.severity}`} key={`${issue.severity}:${issue.code}:${issue.path}`}>
          {issue.message}
        </p>
      ))}
    </div>
  )
}

function getInspectorFieldState(issues, path, options) {
  const fieldIssues = getValidationIssuesForPath(issues, path, options)
  const hasError = fieldIssues.some((issue) => issue.severity === 'error')
  const hasWarning = fieldIssues.some((issue) => issue.severity === 'warning')
  const className = hasError ? ' block-inspector-field--error' : hasWarning ? ' block-inspector-field--warning' : ''

  return { className, fieldIssues, hasError }
}

function InspectorTabs({ activeTab, blockType, onChange, tabs = BLOCK_INSPECTOR_TABS }) {
  const visibleTabs = tabs.filter((tab) => !tab.types || tab.types.includes(blockType))

  function handleKeyDown(event, index) {
    let nextIndex

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % visibleTabs.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = visibleTabs.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextTab = visibleTabs[nextIndex]
    onChange(nextTab.id)
    event.currentTarget.parentElement?.querySelector(`[data-inspector-tab="${nextTab.id}"]`)?.focus()
  }

  return (
    <div className="block-inspector-tabs" aria-label="Inspector section" role="tablist">
      {visibleTabs.map((tab, index) => (
        <button
          aria-selected={activeTab === tab.id}
          className={`block-inspector-tab${activeTab === tab.id ? ' block-inspector-tab--active' : ''}`}
          data-inspector-tab={tab.id}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function StyleSelectField({ disabled, group, label, onChange, options, value }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatStyleOption(group, option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function ColorSwatchPicker({ disabled = false, label, onChange, onReset, value }) {
  const swatches = getColorSwatches()

  return (
    <div className="block-inspector-color-field">
      <span>{label}</span>
      <div className="block-inspector-color-swatches">
        {swatches.map((swatch) => (
          <button
            aria-label={swatch.label}
            aria-pressed={value === swatch.value}
            className={`block-color-swatch${value === swatch.value ? ' block-color-swatch--active' : ''}`}
            disabled={disabled}
            key={swatch.value}
            style={{ backgroundColor: swatch.value }}
            title={swatch.label}
            type="button"
            onClick={() => onChange(swatch.value)}
          />
        ))}
        <label className="block-color-swatch block-color-swatch--custom" title="Choose a custom color">
          <input aria-label={`Custom ${label.toLowerCase()}`} disabled={disabled} type="color" value={getColorInputValue(value)} onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
      {value ? (
        <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={onReset}>
          Reset {label.toLowerCase()}
        </button>
      ) : null}
    </div>
  )
}

function BlockStyleInspectorFields({ block, disabled, entry, label = 'Site style', onUpdatePath, siteShell, stylePath }) {
  const resolvedStylePath = stylePath ?? [...entry.path, 'style']
  const rawStyle = getPlainObject(block?.style)
  const rawBackground = getPlainObject(rawStyle.background)
  const stylePresets = getSiteThemeElementStylePresets(siteShell?.theme).filter((preset) => preset.enabled !== false)
  const style = resolveBlockStyle(rawStyle, stylePresets)
  const selectedPresetId = String(rawStyle.presetId ?? '').trim()
  const hasCustomStyle = !isDefaultBlockStyle(rawStyle)

  function replaceStyle(nextStyle) {
    onUpdatePath(resolvedStylePath, nextStyle)
  }

  function updateStyle(patch) {
    replaceStyle({ ...rawStyle, ...patch })
  }

  function updateBackground(patch) {
    updateStyle({ background: { ...rawBackground, ...patch } })
  }

  function handlePresetChange(nextPresetId) {
    if (!nextPresetId) {
      const nextStyle = { ...rawStyle }
      delete nextStyle.presetId
      replaceStyle(nextStyle)
      return
    }

    replaceStyle({ presetId: nextPresetId })
  }

  return (
    <div className="block-inspector-style-fields">
      <label className="admin-field">
        <span>{label}</span>
        <select disabled={disabled} value={selectedPresetId} onChange={(event) => handlePresetChange(event.target.value)}>
          <option value="">Custom</option>
          {stylePresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <StyleSelectField
        disabled={disabled}
        group="width"
        label="Width"
        options={BLOCK_WIDTH_OPTIONS}
        value={style.width}
        onChange={(value) => updateStyle({ width: value })}
      />
      <StyleSelectField
        disabled={disabled}
        group="spacing"
        label="Spacing"
        options={BLOCK_SPACING_OPTIONS}
        value={style.spacing}
        onChange={(value) => updateStyle({ spacing: value })}
      />
      <StyleSelectField
        disabled={disabled}
        group="align"
        label="Alignment"
        options={BLOCK_ALIGN_OPTIONS}
        value={style.align}
        onChange={(value) => updateStyle({ align: value })}
      />
      <StyleSelectField
        disabled={disabled}
        group="background"
        label="Background"
        options={BLOCK_BACKGROUND_TYPES}
        value={style.background.type}
        onChange={(value) => updateBackground({ color: value === 'color' && !style.background.color ? '#f4f8fc' : style.background.color, type: value })}
      />

      {style.background.type === 'color' ? (
        <ColorSwatchPicker
          disabled={disabled}
          label="Background color"
          value={style.background.color}
          onChange={(value) => updateBackground({ color: value, type: 'color' })}
          onReset={() => updateBackground({ color: '' })}
        />
      ) : null}

      {style.background.type === 'image' ? (
        <fieldset className="block-inspector-fieldset">
          <legend>Background image</legend>
          <ManagedImageInspector
            disabled={disabled}
            image={style.background.image}
            onChange={(nextImage) => updateBackground({ image: nextImage })}
          />
          <StyleSelectField
            disabled={disabled}
            group="backgroundFocalPoint"
            label="Focal point"
            options={BLOCK_BACKGROUND_FOCAL_POINT_OPTIONS}
            value={style.background.focalPoint}
            onChange={(value) => updateBackground({ focalPoint: value })}
          />
          <StyleSelectField
            disabled={disabled}
            group="backgroundOverlay"
            label="Overlay"
            options={BLOCK_BACKGROUND_OVERLAY_OPTIONS}
            value={style.background.overlay}
            onChange={(value) => updateBackground({ overlay: value })}
          />
        </fieldset>
      ) : null}

      <ColorSwatchPicker
        disabled={disabled}
        label="Text color"
        value={style.color}
        onChange={(value) => updateStyle({ color: value })}
        onReset={() => updateStyle({ color: '' })}
      />

      <StyleSelectField
        disabled={disabled}
        group="border"
        label="Border"
        options={BLOCK_BORDER_OPTIONS}
        value={style.border}
        onChange={(value) => updateStyle({ border: value })}
      />
      <StyleSelectField
        disabled={disabled}
        group="borderRadius"
        label="Corners"
        options={BLOCK_BORDER_RADIUS_OPTIONS}
        value={style.borderRadius}
        onChange={(value) => updateStyle({ borderRadius: value })}
      />

      <button className="button-link button-link--ghost admin-action" disabled={disabled || !hasCustomStyle} type="button" onClick={() => replaceStyle({})}>
        Reset style
      </button>

      {entry?.kind === 'block' ? (
        <BlockElementStylePresetFields
          block={block}
          disabled={disabled}
          entry={entry}
          siteShell={siteShell}
          stylePresets={stylePresets}
          onUpdatePath={onUpdatePath}
        />
      ) : null}
    </div>
  )
}

function BlockElementStylePresetFields({ block, disabled, entry, onUpdatePath, siteShell, stylePresets: providedStylePresets }) {
  const targets = getBlockElementStyleTargets(entry.type)
  const stylePresets = providedStylePresets ?? getSiteThemeElementStylePresets(siteShell?.theme).filter((preset) => preset.enabled !== false)
  const elementStyles = getPlainObject(block?.elementStyles)

  if (targets.length === 0) {
    return null
  }

  function updateTargetPreset(targetId, presetId) {
    onUpdatePath([...entry.path, 'elementStyles'], (currentValue) => {
      const nextElementStyles = { ...getPlainObject(currentValue) }

      if (!presetId) {
        delete nextElementStyles[targetId]
        return nextElementStyles
      }

      nextElementStyles[targetId] = { presetId }
      return nextElementStyles
    })
  }

  return (
    <fieldset className="block-inspector-fieldset block-inspector-element-styles">
      <legend>Element styles</legend>
      {targets.map((target) => {
        const targetStyle = getPlainObject(elementStyles[target.id])
        const selectedPresetId = String(targetStyle.presetId ?? '').trim()
        const hasTargetStyle = !isDefaultBlockStyle(targetStyle)

        return (
          <div className="block-inspector-element-style-row" key={target.id}>
            <label className="admin-field">
              <span>{target.label}</span>
              <select
                aria-label={`${target.label} style`}
                disabled={disabled}
                value={selectedPresetId}
                onChange={(event) => updateTargetPreset(target.id, event.target.value)}
              >
                <option value="">None</option>
                {stylePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <EditorIconButton
              disabled={disabled || !hasTargetStyle}
              icon={Trash2}
              label={`Clear ${target.label} style`}
              tone="danger"
              onClick={() => updateTargetPreset(target.id, '')}
            />
          </div>
        )
      })}
    </fieldset>
  )
}

function BlockResponsiveInspectorFields({ block, disabled, entry, onUpdatePath }) {
  const visibility = normalizeBlockVisibility(block?.visibility)
  const rowResponsive = normalizeRowResponsive(block?.responsive)
  const columns = Array.isArray(block?.columns) ? block.columns : []
  const mobileColumnOrder = getRowMobileColumnOrder(block)
  const hasResponsiveSettings = Object.keys(getPlainObject(block?.visibility)).length > 0 || Object.keys(getPlainObject(block?.responsive)).length > 0
  const hiddenEverywhere = visibility.hideOnDesktop && visibility.hideOnTablet && visibility.hideOnMobile

  function updateDeviceVisibility(device, visible) {
    onUpdatePath([...entry.path, 'visibility'], setBlockDeviceVisibility(block?.visibility, device, visible))
  }

  function updateMobileColumns(mobileColumns) {
    onUpdatePath([...entry.path, 'responsive'], setRowMobileColumns(block?.responsive, mobileColumns))
  }

  function moveMobileColumn(index, direction) {
    const nextIndex = index + Math.sign(direction)

    if (nextIndex < 0 || nextIndex >= mobileColumnOrder.length) {
      return
    }

    const nextOrder = [...mobileColumnOrder]
    const [columnId] = nextOrder.splice(index, 1)
    nextOrder.splice(nextIndex, 0, columnId)
    onUpdatePath([...entry.path, 'responsive'], setRowMobileColumnOrder(block?.responsive, nextOrder))
  }

  function resetResponsiveSettings() {
    onUpdatePath(entry.path, { ...getPlainObject(block), responsive: {}, visibility: {} })
  }

  return (
    <div className="block-inspector-responsive-fields">
      <fieldset className="block-inspector-fieldset">
        <legend>Visibility</legend>
        {BLOCK_VISIBILITY_FLAGS.map((flag) => (
          <label className="admin-checkbox-field" key={flag.device}>
            <input
              checked={!visibility[flag.field]}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => updateDeviceVisibility(flag.device, event.target.checked)}
            />
            <span>{flag.label}</span>
          </label>
        ))}
        {hiddenEverywhere ? <p className="block-inspector-warning">Hidden on desktop, tablet, and mobile.</p> : null}
      </fieldset>

      {entry.type === 'row' ? (
        <>
          <label className="admin-field">
            <span>Mobile columns</span>
            <select disabled={disabled} value={rowResponsive.mobileColumns} onChange={(event) => updateMobileColumns(event.target.value)}>
              {ROW_MOBILE_COLUMN_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {RESPONSIVE_OPTION_LABELS[option] ?? option}
                </option>
              ))}
            </select>
          </label>

          {rowResponsive.mobileColumns === 'stack' && mobileColumnOrder.length > 1 ? (
            <fieldset className="block-inspector-fieldset">
              <legend>Mobile stack order</legend>
              <div className="block-inspector-mobile-order">
                {mobileColumnOrder.map((columnId, index) => {
                  const sourceIndex = columns.findIndex((column) => String(column?.id ?? '') === columnId)

                  return (
                    <div key={columnId}>
                      <span>Column {sourceIndex + 1}</span>
                      <div className="admin-inline-actions">
                        <EditorIconButton
                          disabled={disabled || index === 0}
                          icon={ArrowUp}
                          label="Earlier"
                          onClick={() => moveMobileColumn(index, -1)}
                        />
                        <EditorIconButton
                          disabled={disabled || index === mobileColumnOrder.length - 1}
                          icon={ArrowDown}
                          label="Later"
                          onClick={() => moveMobileColumn(index, 1)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}

      <button
        className="button-link button-link--ghost admin-action"
        disabled={disabled || !hasResponsiveSettings}
        type="button"
        onClick={resetResponsiveSettings}
      >
        Reset responsive
      </button>
    </div>
  )
}

function BlockLayoutInspectorFields({ block, disabled, entry, onUpdatePath }) {
  const columns = Array.isArray(block?.columns) ? block.columns : []
  const selectedPresetId = getRowLayoutPresetId(columns)

  function applyPreset(presetId) {
    const result = applyRowLayoutPreset(columns, presetId)

    if (result) {
      onUpdatePath([...entry.path, 'columns'], result.columns)
    }
  }

  function updateColumnWidth(index, value) {
    const width = Number(value)

    if (!Number.isFinite(width) || width < 1 || width > MAX_ROW_COLUMN_WIDTH) {
      return
    }

    onUpdatePath(
      [...entry.path, 'columns'],
      columns.map((column, columnIndex) => (columnIndex === index ? { ...getPlainObject(column), width } : column)),
    )
  }

  function moveColumn(index, direction) {
    const nextColumns = moveRowColumn(columns, index, direction)

    if (nextColumns) {
      onUpdatePath([...entry.path, 'columns'], nextColumns)
    }
  }

  return (
    <div className="block-inspector-layout-fields">
      <label className="admin-field">
        <span>Column layout</span>
        <select aria-label="Column layout" disabled={disabled} value={selectedPresetId} onChange={(event) => applyPreset(event.target.value)}>
          <option disabled value="">
            Custom
          </option>
          {ROW_LAYOUT_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <div className="block-inspector-column-list">
        {columns.map((column, index) => (
          <section className="block-inspector-column-item" key={column?.id ?? index}>
            <div className="block-inspector-column-header">
              <strong>Column {index + 1}</strong>
              <div className="block-inspector-column-actions">
                <EditorIconButton
                  disabled={disabled || index === 0}
                  icon={ArrowLeft}
                  label="Move left"
                  onClick={() => moveColumn(index, -1)}
                />
                <EditorIconButton
                  disabled={disabled || index === columns.length - 1}
                  icon={ArrowRight}
                  label="Move right"
                  onClick={() => moveColumn(index, 1)}
                />
              </div>
            </div>
            <label className="admin-field">
              <span>Width ratio</span>
              <input
                aria-label={`Column ${index + 1} width ratio`}
                disabled={disabled}
                max={MAX_ROW_COLUMN_WIDTH}
                min="1"
                step="0.5"
                type="number"
                value={Number(column?.width) > 0 ? Number(column.width) : 1}
                onChange={(event) => updateColumnWidth(index, event.target.value)}
              />
            </label>
          </section>
        ))}
      </div>
    </div>
  )
}

function TextInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const fieldPath = appendPath(basePath, field.path)
  const value = getValueAtPath(data, field.path) ?? ''
  const fieldState = getInspectorFieldState(issues, fieldPath)

  if (field.multiline) {
    return (
      <label className={`admin-field${fieldState.className}`}>
        <span>{field.label}</span>
        <textarea
          aria-label={field.label}
          disabled={disabled}
          aria-invalid={fieldState.hasError || undefined}
          rows={field.rows ?? 3}
          value={value}
          onChange={(event) => onUpdatePath(fieldPath, event.target.value)}
        />
        <InspectorFieldIssues issues={fieldState.fieldIssues} />
      </label>
    )
  }

  return (
    <label className={`admin-field${fieldState.className}`}>
      <span>{field.label}</span>
      <input aria-label={field.label} aria-invalid={fieldState.hasError || undefined} disabled={disabled} type={field.inputType ?? 'text'} value={value} onChange={(event) => onUpdatePath(fieldPath, event.target.value)} />
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </label>
  )
}

function ColorInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const fieldPath = appendPath(basePath, field.path)
  const value = String(getValueAtPath(data, field.path) ?? '')
  const fieldState = getInspectorFieldState(issues, fieldPath)

  return (
    <div aria-invalid={fieldState.hasError || undefined} className={`block-inspector-fieldset${fieldState.className}`}>
      <ColorSwatchPicker
        disabled={disabled}
        label={field.label}
        value={value}
        onChange={(nextValue) => onUpdatePath(fieldPath, nextValue)}
        onReset={() => onUpdatePath(fieldPath, '')}
      />
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </div>
  )
}

function BooleanInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const fieldPath = appendPath(basePath, field.path)
  const value = getValueAtPath(data, field.path) === true
  const fieldState = getInspectorFieldState(issues, fieldPath)

  return (
    <div className={`block-inspector-fieldset${fieldState.className}`}>
      <label className="admin-checkbox-field">
        <input
          aria-invalid={fieldState.hasError || undefined}
          checked={value}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => onUpdatePath(fieldPath, event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </div>
  )
}

function EnumInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const fieldPath = appendPath(basePath, field.path)
  const value = String(getValueAtPath(data, field.path) ?? '')
  const fieldState = getInspectorFieldState(issues, fieldPath)

  return (
    <label className={`admin-field${fieldState.className}`}>
      <span>{field.label}</span>
      <select aria-label={field.label} aria-invalid={fieldState.hasError || undefined} disabled={disabled} value={value} onChange={(event) => onUpdatePath(fieldPath, event.target.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </label>
  )
}

function RichHtmlInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const fieldPath = appendPath(basePath, field.path)
  const fieldState = getInspectorFieldState(issues, fieldPath)

  return (
    <div aria-invalid={fieldState.hasError || undefined} className={`block-inspector-rich-field${fieldState.className}`}>
      <AdminRichTextEditor
        compact
        disabled={disabled}
        label={field.label}
        sourceRows={field.rows ?? 8}
        value={getValueAtPath(data, field.path) ?? ''}
        onChange={(nextValue) => onUpdatePath(fieldPath, nextValue)}
      />
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </div>
  )
}

function ManagedImageInspector({ disabled, image, onChange }) {
  const normalizedImage = getPlainObject(image)
  const previewSrc = getContentImageSrc(normalizedImage, { height: 240, mode: 'fit', width: 400 })
  const dimensions = [normalizedImage.originalWidth || normalizedImage.width, normalizedImage.originalHeight || normalizedImage.height]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)

  function updateImage(nextFields) {
    onChange({ kind: 'image', ...normalizedImage, ...nextFields })
  }

  return (
    <div className="block-inspector-image-field">
      <AdminMediaManager
        currentUrl={normalizedImage.url ?? ''}
        disabled={disabled}
        onClear={() => onChange(clearBlockImageSource(normalizedImage))}
        onSelect={(nextUrl, entry) => onChange(selectManagedBlockImage(normalizedImage, nextUrl, entry))}
        preferredOwnerType="page"
        title=""
      />

      {previewSrc ? (
        <div className="block-inspector-image-preview">
          <img alt="" loading="lazy" src={previewSrc} />
          {dimensions.length === 2 ? <span>{Math.round(dimensions[0])} x {Math.round(dimensions[1])}</span> : null}
        </div>
      ) : null}

      <label className="admin-checkbox-field">
        <input
          checked={normalizedImage.decorative === true}
          disabled={disabled}
          type="checkbox"
          onChange={(event) => updateImage({ decorative: event.target.checked })}
        />
        <span>Decorative image</span>
      </label>
      <label className="admin-field">
        <span>Alt text</span>
        <input
          disabled={disabled || normalizedImage.decorative === true}
          type="text"
          value={normalizedImage.alt ?? ''}
          onChange={(event) => updateImage({ alt: event.target.value })}
        />
      </label>
      <label className="admin-field">
        <span>Image title</span>
        <input disabled={disabled} type="text" value={normalizedImage.title ?? ''} onChange={(event) => updateImage({ title: event.target.value })} />
      </label>
    </div>
  )
}

function ImageInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const imagePath = appendPath(basePath, field.path)
  const image = getPlainObject(getValueAtPath(data, field.path))
  const fieldState = getInspectorFieldState(issues, imagePath, { includeDescendants: true })

  return (
    <fieldset aria-invalid={fieldState.hasError || undefined} className={`block-inspector-fieldset${fieldState.className}`}>
      <legend>{field.label}</legend>
      <ManagedImageInspector disabled={disabled} image={image} onChange={(nextImage) => onUpdatePath(imagePath, nextImage)} />
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </fieldset>
  )
}

function LinkInspectorField({ basePath, data, disabled, field, issues, onUpdatePath, routeOptions }) {
  const labelPath = appendPath(basePath, field.labelPath)
  const linkPath = appendPath(basePath, field.linkPath)
  const link = getValueAtPath(data, field.linkPath) ?? {}
  const fieldState = getInspectorFieldState(issues, linkPath, { includeDescendants: true })

  return (
    <fieldset aria-invalid={fieldState.hasError || undefined} className={`block-inspector-fieldset${fieldState.className}`}>
      <legend>{field.label}</legend>
      <label className="admin-field">
        <span>{field.labelLabel}</span>
        <input
          disabled={disabled}
          type="text"
          value={getValueAtPath(data, field.labelPath) ?? ''}
          onChange={(event) => onUpdatePath(labelPath, event.target.value)}
        />
      </label>
      <AdminLinkFields
        defaultType={field.defaultType}
        destinationField={field.destinationField}
        destinationLabel={field.destinationLabel}
        disabled={disabled}
        link={link}
        routeOptions={routeOptions}
        onChange={(nextLink) => onUpdatePath(linkPath, nextLink)}
      />
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
    </fieldset>
  )
}

function ObjectListInspectorField({ basePath, data, disabled, field, issues, onUpdatePath, routeOptions }) {
  const listPath = appendPath(basePath, field.path)
  const items = Array.isArray(getValueAtPath(data, field.path)) ? getValueAtPath(data, field.path) : []
  const fieldState = getInspectorFieldState(issues, listPath)

  function updateItems(nextItems) {
    onUpdatePath(listPath, nextItems)
  }

  function moveItem(index, direction) {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= items.length) {
      return
    }

    const nextItems = [...items]
    const [movedItem] = nextItems.splice(index, 1)
    nextItems.splice(nextIndex, 0, movedItem)
    updateItems(nextItems)
  }

  function removeItem(index) {
    if (!window.confirm(`Remove ${field.singularLabel || 'item'} ${index + 1}?`)) {
      return
    }

    updateItems(items.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <section className={`block-inspector-list-field${fieldState.className}`}>
      <div className="block-inspector-list-header">
        <span>{field.label}</span>
        <button
          className="button-link button-link--ghost admin-action"
          disabled={disabled}
          type="button"
          onClick={() => updateItems([...items, field.makeItem?.() ?? {}])}
        >
          Add {field.singularLabel || 'item'}
        </button>
      </div>
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
      <div className="block-inspector-list-items">
        {items.map((item, index) => (
          <details className="block-inspector-list-item" key={item?.id ?? index} open={items.length <= 3}>
            <summary>
              <span>{formatListItemTitle(field.singularLabel, index, item)}</span>
              <span>{field.singularLabel || 'Item'} {index + 1}</span>
            </summary>
            <div className="block-inspector-list-item-body">
              <div className="block-inspector-list-actions">
                <EditorIconButton disabled={disabled || index === 0} icon={ArrowUp} label="Up" onClick={() => moveItem(index, -1)} />
                <EditorIconButton disabled={disabled || index === items.length - 1} icon={ArrowDown} label="Down" onClick={() => moveItem(index, 1)} />
                <EditorIconButton disabled={disabled} icon={Trash2} label="Delete" tone="danger" onClick={() => removeItem(index)} />
              </div>
              <InspectorSchemaFields
                basePath={[...listPath, index]}
                data={item}
                disabled={disabled}
                fields={field.fields}
                issues={issues}
                routeOptions={routeOptions}
                onUpdatePath={onUpdatePath}
              />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function alignStringListIds(ids, length, makeId) {
  const aligned = Array.isArray(ids) ? ids.slice(0, length) : []
  const seenIds = new Set()

  return Array.from({ length }, (_, index) => {
    const currentId = typeof aligned[index] === 'string' ? aligned[index].trim() : ''

    if (currentId && !seenIds.has(currentId)) {
      seenIds.add(currentId)
      return currentId
    }

    let nextId = String(makeId?.() ?? '').trim()

    while (!nextId || seenIds.has(nextId)) {
      nextId = String(makeId?.() ?? '').trim()
    }

    seenIds.add(nextId)
    return nextId
  })
}

function StringListInspectorField({ basePath, data, disabled, field, issues, onUpdatePath }) {
  const listPath = appendPath(basePath, field.path)
  const values = Array.isArray(getValueAtPath(data, field.path)) ? getValueAtPath(data, field.path) : []
  const currentIds = getValueAtPath(data, field.idPath)
  const fieldState = getInspectorFieldState(issues, listPath, { includeDescendants: true })

  function updateList(nextValues, nextIds) {
    const withValues = updateValueAtPath(data, field.path, nextValues)
    const withIds = updateValueAtPath(withValues, field.idPath, nextIds)
    onUpdatePath(basePath, withIds)
  }

  function updateItem(index, nextValue) {
    const nextValues = values.map((value, itemIndex) => (itemIndex === index ? nextValue : value))
    updateList(nextValues, alignStringListIds(currentIds, nextValues.length, field.makeId))
  }

  function addItem() {
    const nextValues = [...values, '']
    const nextIds = alignStringListIds(currentIds, nextValues.length, field.makeId)
    updateList(nextValues, nextIds)
  }

  function moveItem(index, direction) {
    const nextIndex = index + direction

    if (nextIndex < 0 || nextIndex >= values.length) {
      return
    }

    const nextValues = [...values]
    const nextIds = alignStringListIds(currentIds, values.length, field.makeId)
    const [movedValue] = nextValues.splice(index, 1)
    const [movedId] = nextIds.splice(index, 1)
    nextValues.splice(nextIndex, 0, movedValue)
    nextIds.splice(nextIndex, 0, movedId)
    updateList(nextValues, nextIds)
  }

  function removeItem(index) {
    if (!window.confirm(`Remove ${field.singularLabel || 'item'} ${index + 1}?`)) {
      return
    }

    const nextValues = values.filter((_, itemIndex) => itemIndex !== index)
    const nextIds = alignStringListIds(currentIds, values.length, field.makeId).filter((_, itemIndex) => itemIndex !== index)
    updateList(nextValues, nextIds)
  }

  return (
    <section className={`block-inspector-list-field${fieldState.className}`}>
      <div className="block-inspector-list-header">
        <span>{field.label}</span>
        <button className="button-link button-link--ghost admin-action" disabled={disabled} type="button" onClick={addItem}>
          Add {field.singularLabel || 'item'}
        </button>
      </div>
      <InspectorFieldIssues issues={fieldState.fieldIssues} />
      <div className="block-inspector-list-items">
        {values.map((value, index) => {
          const itemPath = [...listPath, index]
          const itemState = getInspectorFieldState(issues, itemPath)

          return (
            <div className={`block-inspector-list-item-body${itemState.className}`} key={`${currentIds?.[index] ?? 'item'}-${index}`}>
              <label className="admin-field">
                <span>{field.singularLabel || 'Item'} {index + 1}</span>
                <input
                  aria-invalid={itemState.hasError || undefined}
                  disabled={disabled}
                  type="text"
                  value={value}
                  onChange={(event) => updateItem(index, event.target.value)}
                />
              </label>
              <InspectorFieldIssues issues={itemState.fieldIssues} />
              <div className="block-inspector-list-actions">
                <EditorIconButton disabled={disabled || index === 0} icon={ArrowUp} label="Up" onClick={() => moveItem(index, -1)} />
                <EditorIconButton disabled={disabled || index === values.length - 1} icon={ArrowDown} label="Down" onClick={() => moveItem(index, 1)} />
                <EditorIconButton disabled={disabled} icon={Trash2} label="Delete" tone="danger" onClick={() => removeItem(index)} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function InspectorSchemaField({ basePath, data, disabled, field, issues, onUpdatePath, routeOptions }) {
  if (field.widget === 'color') {
    return <ColorInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
  }

  if (field.widget === 'boolean') {
    return <BooleanInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
  }

  if (field.widget === 'enum') {
    return <EnumInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
  }

  if (field.widget === 'richHtml') {
    return <RichHtmlInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
  }

  if (field.widget === 'image') {
    return <ImageInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
  }

  if (field.widget === 'link') {
    return (
      <LinkInspectorField
        basePath={basePath}
        data={data}
        disabled={disabled}
        field={field}
        issues={issues}
        routeOptions={routeOptions}
        onUpdatePath={onUpdatePath}
      />
    )
  }

  if (field.widget === 'objectList') {
    return (
      <ObjectListInspectorField
        basePath={basePath}
        data={data}
        disabled={disabled}
        field={field}
        issues={issues}
        routeOptions={routeOptions}
        onUpdatePath={onUpdatePath}
      />
    )
  }

  if (field.widget === 'stringList') {
    return (
      <StringListInspectorField
        basePath={basePath}
        data={data}
        disabled={disabled}
        field={field}
        issues={issues}
        onUpdatePath={onUpdatePath}
      />
    )
  }

  return <TextInspectorField basePath={basePath} data={data} disabled={disabled} field={field} issues={issues} onUpdatePath={onUpdatePath} />
}

function isInspectorFieldVisible(field, data) {
  const condition = field.visibleWhen

  if (!condition) {
    return true
  }

  const value = getValueAtPath(data, condition.path)

  if (Array.isArray(condition.oneOf)) {
    return condition.oneOf.includes(value)
  }

  if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
    return value === condition.equals
  }

  return true
}

function InspectorSchemaFields({ basePath, data, disabled, fields = [], issues = [], onUpdatePath, routeOptions }) {
  return fields.filter((field) => isInspectorFieldVisible(field, data)).map((field) => (
    <InspectorSchemaField
      basePath={basePath}
      data={data}
      disabled={disabled}
      field={field}
      issues={issues}
      key={`${field.widget}:${pathKey(field.path ?? field.linkPath)}:${field.label}`}
      routeOptions={routeOptions}
      onUpdatePath={onUpdatePath}
    />
  ))
}

function ContainerInspectorFields({ activeTab, disabled, entry, issues, onClearSelection, onTabChange, onUpdatePath, selectedValue, siteShell }) {
  const isGroupItem = entry.kind === 'group-item'
  const isRowColumn = entry.kind === 'row-column'
  const tabs = isRowColumn ? ROW_COLUMN_INSPECTOR_TABS : GROUP_ITEM_INSPECTOR_TABS
  const titleState = getInspectorFieldState(issues, [...entry.path, 'title'])
  const imageState = getInspectorFieldState(issues, [...entry.path, 'image'], { includeDescendants: true })
  const widthState = getInspectorFieldState(issues, [...entry.path, 'width'])

  function updateColumnWidth(value) {
    const width = Number(value)

    if (Number.isFinite(width) && width >= 1 && width <= MAX_ROW_COLUMN_WIDTH) {
      onUpdatePath([...entry.path, 'width'], width)
    }
  }

  return (
    <div className="block-inspector-fields">
      <InspectorTabs activeTab={activeTab} onChange={onTabChange} tabs={tabs} />

      {activeTab === 'content' && isGroupItem ? (
        <div className="block-inspector-schema-fields">
          <label className={`admin-field${titleState.className}`}>
            <span>Card title</span>
            <input
              aria-invalid={titleState.hasError || undefined}
              disabled={disabled}
              type="text"
              value={selectedValue?.title ?? ''}
              onChange={(event) => onUpdatePath([...entry.path, 'title'], event.target.value)}
            />
            <InspectorFieldIssues issues={titleState.fieldIssues} />
          </label>
          <fieldset aria-invalid={imageState.hasError || undefined} className={`block-inspector-fieldset${imageState.className}`}>
            <legend>Card image</legend>
            <ManagedImageInspector
              disabled={disabled}
              image={getPlainObject(selectedValue?.image)}
              onChange={(nextImage) => onUpdatePath([...entry.path, 'image'], nextImage)}
            />
            <InspectorFieldIssues issues={imageState.fieldIssues} />
          </fieldset>
        </div>
      ) : null}

      {activeTab === 'layout' && isRowColumn ? (
        <div className="block-inspector-layout-fields">
          <label className={`admin-field${widthState.className}`}>
            <span>Width ratio</span>
            <input
              aria-label="Width ratio"
              aria-invalid={widthState.hasError || undefined}
              disabled={disabled}
              max={MAX_ROW_COLUMN_WIDTH}
              min="1"
              step="0.5"
              type="number"
              value={Number(selectedValue?.width) > 0 ? Number(selectedValue.width) : 1}
              onChange={(event) => updateColumnWidth(event.target.value)}
            />
            <InspectorFieldIssues issues={widthState.fieldIssues} />
          </label>
        </div>
      ) : null}

      {activeTab === 'style' ? (
        <BlockStyleInspectorFields block={selectedValue} disabled={disabled} entry={entry} siteShell={siteShell} onUpdatePath={onUpdatePath} />
      ) : null}

      {activeTab === 'settings' ? (
        <>
          <dl className="block-inspector-details">
            <div>
              <dt>Container</dt>
              <dd>{isRowColumn ? 'Row column' : 'Group card'}</dd>
            </div>
            <div>
              <dt>Container id</dt>
              <dd>{entry.nodeId || 'Missing'}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{formatPath(entry.path)}</dd>
            </div>
          </dl>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={onClearSelection}>
            Clear selection
          </button>
        </>
      ) : null}
    </div>
  )
}

function PageInspectorFields({ activeTab, disabled, issues, onTabChange, onUpdatePath, page, routeInventory, siteShell }) {
  const routeAliases = Array.isArray(page?.routeAliases) ? page.routeAliases : []
  const groupOptions = Array.from(
    new Set([
      'custom',
      String(page?.group ?? '').trim(),
      ...routeInventory.map((route) => String(route?.group ?? '').trim()).filter((group) => group && group !== 'internal'),
    ]),
  )
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
  const pathState = getInspectorFieldState(issues, ['path'])
  const titleState = getInspectorFieldState(issues, ['title'])
  const navLabelState = getInspectorFieldState(issues, ['navLabel'])
  const groupState = getInspectorFieldState(issues, ['group'])
  const descriptionState = getInspectorFieldState(issues, ['metaDescription'])

  function updateAlias(index, value) {
    onUpdatePath(
      ['routeAliases'],
      routeAliases.map((alias, aliasIndex) => (aliasIndex === index ? value : alias)),
    )
  }

  function removeAlias(index) {
    onUpdatePath(
      ['routeAliases'],
      routeAliases.filter((_, aliasIndex) => aliasIndex !== index),
    )
  }

  return (
    <div className="block-inspector-fields">
      <InspectorTabs activeTab={activeTab} onChange={onTabChange} tabs={PAGE_INSPECTOR_TABS} />

      {activeTab === 'style' ? (
        <BlockStyleInspectorFields
          block={page}
          disabled={disabled}
          label="Page style"
          siteShell={siteShell}
          stylePath={['style']}
          onUpdatePath={onUpdatePath}
        />
      ) : null}

      {activeTab === 'settings' ? (
        <>
          <fieldset className="block-inspector-fieldset">
            <legend>Routing</legend>
            <label className={`admin-field${pathState.className}`}>
              <span>Page URL</span>
              <input
                aria-invalid={pathState.hasError || undefined}
                disabled={disabled}
                inputMode="url"
                type="text"
                value={page?.path ?? ''}
                onBlur={(event) => onUpdatePath(['path'], normalizePageRoutePath(event.target.value))}
                onChange={(event) => onUpdatePath(['path'], event.target.value)}
              />
              <InspectorFieldIssues issues={pathState.fieldIssues} />
            </label>

            <div className="block-inspector-route-aliases">
              <div className="block-inspector-list-header">
                <span>URL aliases</span>
                <button
                  className="button-link button-link--ghost admin-action"
                  disabled={disabled || routeAliases.length >= MAX_PAGE_ROUTE_ALIASES}
                  type="button"
                  onClick={() => onUpdatePath(['routeAliases'], [...routeAliases, ''])}
                >
                  Add alias
                </button>
              </div>
              {routeAliases.map((alias, index) => {
                const aliasState = getInspectorFieldState(issues, ['routeAliases', index])

                return (
                  <div className="block-inspector-route-alias" key={index}>
                    <label className={`admin-field${aliasState.className}`}>
                      <span>Alias {index + 1}</span>
                      <input
                        aria-invalid={aliasState.hasError || undefined}
                        disabled={disabled}
                        inputMode="url"
                        type="text"
                        value={alias}
                        onBlur={(event) => updateAlias(index, normalizePageRoutePath(event.target.value))}
                        onChange={(event) => updateAlias(index, event.target.value)}
                      />
                      <InspectorFieldIssues issues={aliasState.fieldIssues} />
                    </label>
                    <EditorIconButton disabled={disabled} icon={Trash2} label={`Remove alias ${index + 1}`} tone="danger" onClick={() => removeAlias(index)} />
                  </div>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="block-inspector-fieldset">
            <legend>Navigation and SEO</legend>
            <label className={`admin-field${titleState.className}`}>
              <span>Page title</span>
              <input aria-invalid={titleState.hasError || undefined} disabled={disabled} type="text" value={page?.title ?? ''} onChange={(event) => onUpdatePath(['title'], event.target.value)} />
              <InspectorFieldIssues issues={titleState.fieldIssues} />
            </label>
            <label className={`admin-field${navLabelState.className}`}>
              <span>Navigation label</span>
              <input aria-invalid={navLabelState.hasError || undefined} disabled={disabled} type="text" value={page?.navLabel ?? ''} onChange={(event) => onUpdatePath(['navLabel'], event.target.value)} />
              <InspectorFieldIssues issues={navLabelState.fieldIssues} />
            </label>
            <label className={`admin-field${groupState.className}`}>
              <span>Navigation group</span>
              <select aria-invalid={groupState.hasError || undefined} disabled={disabled} value={page?.group ?? 'custom'} onChange={(event) => onUpdatePath(['group'], event.target.value)}>
                {groupOptions.map((group) => (
                  <option key={group} value={group}>
                    {group.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`)}
                  </option>
                ))}
              </select>
              <InspectorFieldIssues issues={groupState.fieldIssues} />
            </label>
            <label className={`admin-field${descriptionState.className}`}>
              <span>Search description</span>
              <textarea
                aria-invalid={descriptionState.hasError || undefined}
                disabled={disabled}
                rows={5}
                value={page?.metaDescription ?? ''}
                onChange={(event) => onUpdatePath(['metaDescription'], event.target.value)}
              />
              <InspectorFieldIssues issues={descriptionState.fieldIssues} />
            </label>
          </fieldset>
        </>
      ) : null}
    </div>
  )
}

function BlockInspectorFields({
  activeTab,
  disabled,
  entry,
  onClearSelection,
  onTabChange,
  onUpdatePath,
  issues,
  routeOptions,
  selectedBlock,
  siteShell,
}) {
  const visible = selectedBlock?.hidden !== true
  const definition = getBlockDefinition(entry.type)
  const fields = definition?.schema?.fields ?? []
  const editorLabelState = getInspectorFieldState(issues, [...entry.path, 'editorLabel'])
  const anchorState = getInspectorFieldState(issues, [...entry.path, 'anchorId'])

  return (
    <div className="block-inspector-fields">
      <InspectorTabs activeTab={activeTab} blockType={entry.type} onChange={onTabChange} />

      {activeTab === 'content' ? (
        !definition ? (
          <section className="block-inspector-unsupported" role="alert">
            <strong>Unsupported block type</strong>
            <p>The stored block is preserved, but its content fields cannot be edited until this type is registered again.</p>
          </section>
        ) : fields.length > 0 ? (
          <div className="block-inspector-schema-fields">
            <InspectorSchemaFields
              basePath={entry.path}
              data={selectedBlock}
              disabled={disabled}
              fields={fields}
              issues={issues}
              routeOptions={routeOptions}
              onUpdatePath={onUpdatePath}
            />
          </div>
        ) : (
          <p className="block-inspector-empty">No content fields for this block.</p>
        )
      ) : null}

      {activeTab === 'style' ? (
        <BlockStyleInspectorFields block={selectedBlock} disabled={disabled} entry={entry} siteShell={siteShell} onUpdatePath={onUpdatePath} />
      ) : null}

      {activeTab === 'layout' ? (
        <BlockLayoutInspectorFields block={selectedBlock} disabled={disabled} entry={entry} onUpdatePath={onUpdatePath} />
      ) : null}

      {activeTab === 'responsive' ? (
        <BlockResponsiveInspectorFields block={selectedBlock} disabled={disabled} entry={entry} onUpdatePath={onUpdatePath} />
      ) : null}

      {activeTab === 'settings' ? (
        <>
          <fieldset className="block-inspector-fieldset">
            <legend>Block identity</legend>
            <label className={`admin-field${editorLabelState.className}`}>
              <span>Editor label</span>
              <input
                aria-invalid={editorLabelState.hasError || undefined}
                disabled={disabled}
                maxLength={MAX_BLOCK_EDITOR_LABEL_LENGTH}
                type="text"
                value={selectedBlock?.editorLabel ?? ''}
                onBlur={(event) => onUpdatePath([...entry.path, 'editorLabel'], event.target.value.trim())}
                onChange={(event) => onUpdatePath([...entry.path, 'editorLabel'], event.target.value)}
              />
              <InspectorFieldIssues issues={editorLabelState.fieldIssues} />
            </label>
            <label className={`admin-field${anchorState.className}`}>
              <span>Section anchor</span>
              <input
                aria-invalid={anchorState.hasError || undefined}
                disabled={disabled}
                maxLength={MAX_BLOCK_ANCHOR_LENGTH}
                type="text"
                value={selectedBlock?.anchorId ?? ''}
                onBlur={(event) => onUpdatePath([...entry.path, 'anchorId'], normalizeBlockAnchorId(event.target.value))}
                onChange={(event) => onUpdatePath([...entry.path, 'anchorId'], event.target.value)}
              />
              <InspectorFieldIssues issues={anchorState.fieldIssues} />
            </label>
          </fieldset>

          <label className="admin-checkbox-field">
            <input
              checked={visible}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onUpdatePath([...entry.path, 'hidden'], !event.target.checked)}
            />
            <span>Visible</span>
          </label>

          <dl className="block-inspector-details">
            <div>
              <dt>Type</dt>
              <dd>{entry.type || 'Unknown'}</dd>
            </div>
            <div>
              <dt>Block id</dt>
              <dd>{entry.blockId || 'Missing'}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{formatPath(entry.path)}</dd>
            </div>
          </dl>

          <button className="button-link button-link--ghost admin-action" type="button" onClick={onClearSelection}>
            Clear selection
          </button>
        </>
      ) : null}
    </div>
  )
}

export function BlockInspectorPanel({
  disabled = false,
  headingLevel = 3,
  onClearSelection,
  onUpdatePath,
  page,
  routeInventory = [],
  selectedBlockId,
  siteShell,
  validation,
}) {
  const inspectorHeadingTag = headingLevel === 2 ? 'h2' : 'h3'
  const [tabState, setTabState] = useState(() => ({ activeTab: 'content', selectedBlockId: '' }))
  const blocks = Array.isArray(page?.blocks) ? page.blocks : []
  const entries = collectBlockOutlineEntries(blocks, { resolveBlockLabel })
  const issueMap = mapValidationIssuesToEntries(validation, entries)
  const selectedEntry = findBlockOutlineEntry(entries, selectedBlockId)
  const selectedValue = selectedEntry ? getBlockValueAtPath(page, selectedEntry.path) : null
  const routeOptions = buildRouteOptions(routeInventory)
  const defaultActiveTab = selectedEntry ? (selectedEntry.kind === 'row-column' ? 'layout' : 'content') : 'style'
  const requestedActiveTab = tabState.selectedBlockId === selectedBlockId ? tabState.activeTab : defaultActiveTab
  const activeTab = selectedEntry || PAGE_INSPECTOR_TABS.some((tab) => tab.id === requestedActiveTab) ? requestedActiveTab : defaultActiveTab
  const selectedIssues = selectedEntry
    ? [...(issueMap.get(selectedEntry.selectionId)?.errors ?? []), ...(issueMap.get(selectedEntry.selectionId)?.warnings ?? [])]
    : getPageLevelValidationIssues(validation, entries)

  if (selectedBlockId && !selectedEntry) {
    return (
      <aside className="block-inspector" aria-label="Inspector">
        <InspectorHeader eyebrow="Inspector" headingTag={inspectorHeadingTag} title="Selection unavailable" />
        <button className="button-link button-link--ghost admin-action" type="button" onClick={onClearSelection}>
          Clear selection
        </button>
      </aside>
    )
  }

  return (
    <aside className="block-inspector" aria-label="Inspector">
      {selectedEntry ? (
        <>
          <InspectorHeader
            eyebrow={selectedEntry.kind === 'block' ? 'Selected block' : 'Selected container'}
            headingTag={inspectorHeadingTag}
            title={selectedEntry.label}
          />
          {selectedEntry.summary ? <p className="block-inspector-summary">{selectedEntry.summary}</p> : null}
          <InspectorIssueSummary
            issues={selectedIssues}
            onActivateIssue={(issue) =>
              setTabState({ activeTab: getValidationIssueInspectorTab(issue, selectedEntry), selectedBlockId })
            }
          />
          {selectedEntry.kind === 'block' ? (
            <BlockInspectorFields
              disabled={disabled}
              entry={selectedEntry}
              issues={selectedIssues}
              onClearSelection={onClearSelection}
              onUpdatePath={onUpdatePath}
              routeOptions={routeOptions}
              selectedBlock={selectedValue}
              siteShell={siteShell}
              activeTab={activeTab}
              onTabChange={(nextTab) => setTabState({ activeTab: nextTab, selectedBlockId })}
            />
          ) : (
            <ContainerInspectorFields
              activeTab={activeTab}
              disabled={disabled}
              entry={selectedEntry}
              issues={selectedIssues}
              onClearSelection={onClearSelection}
              onTabChange={(nextTab) => setTabState({ activeTab: nextTab, selectedBlockId })}
              onUpdatePath={onUpdatePath}
              selectedValue={selectedValue}
              siteShell={siteShell}
            />
          )}
        </>
      ) : (
        <>
          <InspectorHeader eyebrow="Page" headingTag={inspectorHeadingTag} title={page?.title || page?.navLabel || 'Untitled page'} />
          <InspectorIssueSummary issues={selectedIssues} />
          <PageInspectorFields
            activeTab={activeTab}
            disabled={disabled}
            issues={selectedIssues}
            page={page}
            routeInventory={routeInventory}
            siteShell={siteShell}
            onTabChange={(nextTab) => setTabState({ activeTab: nextTab, selectedBlockId })}
            onUpdatePath={onUpdatePath}
          />
        </>
      )}
    </aside>
  )
}
