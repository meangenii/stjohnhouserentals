import { forwardRef, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { findInternalNavigationTarget } from '../lib/internalLinkNavigation'
import { richTextValueToInlineHtml } from '../lib/richTextValue'
import {
  applyRichTextFontSize,
  captureCaretOffset,
  captureRichTextSelectionRange,
  restoreCaretOffset,
  restoreRichTextSelectionRange,
  RICH_TEXT_BLOCK_OPTIONS,
  RICH_TEXT_FONT_SIZE_OPTIONS,
  readRichTextSelectionState,
} from '../lib/richTextFormatting'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { AdminImageSizeControls } from './AdminImageSizeControls'
import { AdminRichTextMenu } from './AdminRichTextMenu'
import { RichTextValue } from './RichTextValue'

const AdminMediaManager = lazy(() =>
  import('./AdminMediaManager').then((module) => ({
    default: module.AdminMediaManager,
  })),
)

const AdminRichTextEditor = lazy(() =>
  import('./AdminRichTextEditor').then((module) => ({
    default: module.AdminRichTextEditor,
  })),
)

function pathToKey(path = []) {
  return path.map((segment) => String(segment)).join('.')
}

function pathsAreEqual(leftPath = [], rightPath = []) {
  if (!Array.isArray(leftPath) || !Array.isArray(rightPath) || leftPath.length !== rightPath.length) {
    return false
  }

  return leftPath.every((segment, index) => segment === rightPath[index])
}

function usePageEditor() {
  const previewState = useContext(SiteContentPreviewContext)
  return previewState?.pageEditor ?? null
}

function useRouteInventory() {
  const previewState = useContext(SiteContentPreviewContext)
  return Array.isArray(previewState?.routeInventory) ? previewState.routeInventory : []
}

function useEditableField(path, fieldKey = '') {
  const pageEditor = usePageEditor()
  const id = fieldKey || pathToKey(path)
  const isEnabled = Boolean(pageEditor)
  const isActive = isEnabled && pageEditor.activeFieldId === id

  function activate() {
    if (pageEditor?.disabled) {
      return
    }

    pageEditor?.setActiveFieldId(id)
  }

  function close() {
    pageEditor?.setActiveFieldId('')
  }

  function updatePath(targetPath, nextValue) {
    pageEditor?.updatePath(targetPath, nextValue)
  }

  return {
    disabled: Boolean(pageEditor?.disabled),
    isActive,
    isEnabled,
    activate,
    close,
    updatePath,
  }
}

function InlinePopover({ active, onClose, title, children }) {
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!active) {
      return undefined
    }

    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, onClose])

  if (!active) {
    return null
  }

  if (typeof document === 'undefined') {
    return null
  }

  function stopEventPropagation(event) {
    event.stopPropagation()
  }

  function handleBackdropPointerDown(event) {
    event.stopPropagation()

    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="admin-inline-popover-shell"
      role="presentation"
      onClick={stopEventPropagation}
      onMouseDown={handleBackdropPointerDown}
    >
      <div
        ref={popoverRef}
        aria-modal="true"
        className="admin-inline-popover"
        role="dialog"
        aria-label={title}
        onClick={stopEventPropagation}
        onMouseDown={stopEventPropagation}
      >
        <div className="admin-inline-popover-header">
          <strong>{title}</strong>
          <button className="button-link button-link--ghost admin-inline-popover-close" type="button" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="admin-inline-popover-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

function buildEditableClassName(className = '', isEnabled = false, isActive = false) {
  return [className, isEnabled ? 'admin-inline-editable-target' : '', isActive ? 'admin-inline-editable-target--active' : '']
    .filter(Boolean)
    .join(' ')
}

function InlinePopoverContent({ children }) {
  return <Suspense fallback={<p className="admin-note">Loading editor...</p>}>{children}</Suspense>
}

function InlineToolbarButton({ active = false, children, disabled, onClick }) {
  return (
    <button
      className={`button-link button-link--ghost admin-rich-text-button ${active ? 'admin-rich-text-button--active' : ''}`.trim()}
      disabled={disabled}
      type="button"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </button>
  )
}

function isEmptyHtmlValue(value = '') {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim().length === 0
}

function normalizeColorValue(value) {
  return String(value ?? '').trim()
}

function normalizeLinkValue(value) {
  return String(value ?? '').trim()
}

function isExternalLinkValue(value) {
  const normalizedValue = normalizeLinkValue(value)

  if (!normalizedValue) {
    return false
  }

  if (normalizedValue.startsWith('/')) {
    return false
  }

  return /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(normalizedValue)
}

function shouldOpenLinkInNewTab(value) {
  return /^(?:https?:)?\/\//i.test(normalizeLinkValue(value))
}

function buildRouteOptionLabel(route, path, isAlias = false) {
  const label = String(route?.label ?? route?.navLabel ?? route?.title ?? route?.key ?? '').trim()
  const title = String(route?.title ?? '').trim()
  const descriptor = isAlias ? 'Alias' : ''

  return [label, title && title !== label ? title : '', descriptor, path].filter(Boolean).join(' | ') || path
}

function buildRouteOptions(routeInventory = []) {
  const seenPaths = new Set()

  return routeInventory.flatMap((route) => {
    if (String(route?.group ?? '').trim() === 'internal') {
      return []
    }

    const pathCandidates = [route?.path, ...(Array.isArray(route?.routeAliases) ? route.routeAliases : [])]

    return pathCandidates.reduce((options, candidatePath, index) => {
      const normalizedPath = normalizeLinkValue(candidatePath)

      if (!normalizedPath || normalizedPath.includes(':') || seenPaths.has(normalizedPath)) {
        return options
      }

      seenPaths.add(normalizedPath)
      options.push({
        label: buildRouteOptionLabel(route, normalizedPath, index > 0),
        value: normalizedPath,
      })
      return options
    }, [])
  })
}

function expandHexColor(value) {
  const normalizedValue = normalizeColorValue(value)

  if (/^#[\da-f]{6}$/i.test(normalizedValue)) {
    return normalizedValue.toLowerCase()
  }

  if (/^#[\da-f]{3}$/i.test(normalizedValue)) {
    return `#${normalizedValue
      .slice(1)
      .split('')
      .map((segment) => `${segment}${segment}`)
      .join('')}`.toLowerCase()
  }

  return ''
}

function getColorInputValue(value, fallback = '#ffffff') {
  return expandHexColor(value) || fallback
}

function focusEditableElementAtEnd(element) {
  if (!element || typeof window === 'undefined') {
    return
  }

  const selection = window.getSelection()

  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function hasSelectionInsideElement(element) {
  if (!element || typeof window === 'undefined') {
    return false
  }

  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return false
  }

  const range = selection.getRangeAt(0)
  const commonAncestor =
    range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement

  return commonAncestor instanceof Element && element.contains(commonAncestor)
}

function assignRef(ref, value) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ref.current = value
  }
}

function InlineTextFormattingToolbar({
  active = false,
  allowBlockFormatting = false,
  allowLinkFormatting = true,
  allowLineBreaks = false,
  anchorRef,
  disabled = false,
  fixedBlockTag = '',
  onClose,
  onSync,
}) {
  const toolbarRef = useRef(null)
  const selectionRangeRef = useRef(null)
  const showBlockFormattingMenu = allowBlockFormatting && !fixedBlockTag
  const [selectionState, setSelectionState] = useState(() => ({
    blockTag: fixedBlockTag || 'p',
    bold: false,
    fontSize: 'default',
    italic: false,
    underline: false,
  }))
  const [position, setPosition] = useState({ left: 8, top: 8 })

  useLayoutEffect(() => {
    if (!active || typeof window === 'undefined') {
      return undefined
    }

    let animationFrameId = 0

    function updatePosition() {
      const anchor = anchorRef?.current
      const toolbar = toolbarRef.current

      if (!anchor || !toolbar || typeof anchor.getBoundingClientRect !== 'function') {
        return
      }

      const anchorBounds = anchor.getBoundingClientRect()
      const toolbarBounds = toolbar.getBoundingClientRect()
      const margin = 8
      const fitsAbove = anchorBounds.top - toolbarBounds.height - margin >= margin
      const nextTop = fitsAbove ? anchorBounds.top - toolbarBounds.height - margin : anchorBounds.bottom + margin
      const maxLeft = Math.max(margin, window.innerWidth - toolbarBounds.width - margin)
      const nextLeft = Math.min(Math.max(margin, anchorBounds.left), maxLeft)
      const maxTop = Math.max(margin, window.innerHeight - toolbarBounds.height - margin)

      setPosition({
        left: nextLeft,
        top: Math.min(Math.max(margin, nextTop), maxTop),
      })
    }

    function scheduleUpdate() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(updatePosition)
    }

    scheduleUpdate()
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
    }
  }, [active, anchorRef])

  useEffect(() => {
    if (!active || typeof document === 'undefined') {
      return undefined
    }

    function updateSelectionState({ preserveWhenMissing = true } = {}) {
      const anchor = anchorRef?.current

      if (!anchor) {
        return
      }

      const nextRange = captureRichTextSelectionRange(anchor)

      if (nextRange) {
        selectionRangeRef.current = nextRange
        setSelectionState(
          readRichTextSelectionState(anchor, {
            defaultBlockTag: fixedBlockTag || 'p',
            fixedBlockTag,
          }),
        )
        return
      }

      if (!preserveWhenMissing) {
        setSelectionState(
          readRichTextSelectionState(anchor, {
            defaultBlockTag: fixedBlockTag || 'p',
            fixedBlockTag,
          }),
        )
      }
    }

    updateSelectionState({ preserveWhenMissing: false })
    document.addEventListener('selectionchange', updateSelectionState)

    return () => {
      document.removeEventListener('selectionchange', updateSelectionState)
    }
  }, [active, anchorRef, fixedBlockTag])

  if (!active || typeof document === 'undefined') {
    return null
  }

  function syncCurrentValue() {
    const anchor = anchorRef?.current

    if (!anchor) {
      return
    }

    const nextRange = captureRichTextSelectionRange(anchor)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }

    onSync?.(anchor.innerHTML)
    setSelectionState(
      readRichTextSelectionState(anchor, {
        defaultBlockTag: fixedBlockTag || 'p',
        fixedBlockTag,
      }),
    )
  }

  function rememberSelection() {
    const nextRange = captureRichTextSelectionRange(anchorRef?.current)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }
  }

  function focusAnchorSelection() {
    const anchor = anchorRef?.current

    if (!anchor) {
      return false
    }

    if (restoreRichTextSelectionRange(anchor, selectionRangeRef.current)) {
      return true
    }

    anchor.focus()
    return true
  }

  function applyCommand(command, commandValue = null) {
    if (disabled) {
      return
    }

    const anchor = anchorRef?.current

    if (!anchor || !focusAnchorSelection()) {
      return
    }

    document.execCommand(command, false, commandValue)
    syncCurrentValue()
  }

  function insertLink() {
    if (disabled) {
      return
    }

    const href = window.prompt('Enter a link URL')

    if (!href) {
      return
    }

    applyCommand('createLink', href)
  }

  function handleFontSizeChange(nextValue) {
    const anchor = anchorRef?.current

    if (disabled || !anchor || !focusAnchorSelection()) {
      return
    }

    if (applyRichTextFontSize(anchor, nextValue, { collapsedBehavior: 'root' })) {
      syncCurrentValue()
    }
  }

  function handleBlockTagChange(nextValue) {
    const nextTag = String(nextValue ?? 'p').trim().toLowerCase()

    if (!nextTag) {
      return
    }

    applyCommand('formatBlock', `<${nextTag}>`)
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="admin-inline-format-toolbar"
      data-admin-inline-editable="true"
      role="toolbar"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {showBlockFormattingMenu ? (
        <AdminRichTextMenu
          disabled={disabled}
          inline
          label="Tag"
          onBeforeOpen={rememberSelection}
          onSelect={handleBlockTagChange}
          options={RICH_TEXT_BLOCK_OPTIONS}
          value={selectionState.blockTag}
        />
      ) : null}
      <AdminRichTextMenu
        disabled={disabled}
        inline
        label="Size"
        onBeforeOpen={rememberSelection}
        onSelect={handleFontSizeChange}
        options={RICH_TEXT_FONT_SIZE_OPTIONS}
        value={selectionState.fontSize}
      />
      <InlineToolbarButton active={selectionState.bold} disabled={disabled} onClick={() => applyCommand('bold')}>
        Bold
      </InlineToolbarButton>
      <InlineToolbarButton active={selectionState.italic} disabled={disabled} onClick={() => applyCommand('italic')}>
        Italic
      </InlineToolbarButton>
      <InlineToolbarButton active={selectionState.underline} disabled={disabled} onClick={() => applyCommand('underline')}>
        Underline
      </InlineToolbarButton>
      {allowLineBreaks ? (
        <InlineToolbarButton disabled={disabled} onClick={() => applyCommand('insertHTML', '<br />')}>
          Line Break
        </InlineToolbarButton>
      ) : null}
      {allowLinkFormatting ? (
        <InlineToolbarButton disabled={disabled} onClick={insertLink}>
          Link
        </InlineToolbarButton>
      ) : null}
      <InlineToolbarButton disabled={disabled} onClick={() => applyCommand('removeFormat')}>
        Clear
      </InlineToolbarButton>
      <InlineToolbarButton disabled={disabled} onClick={onClose}>
        Done
      </InlineToolbarButton>
    </div>,
    document.body,
  )
}

const InlineTextEditableElement = forwardRef(function InlineTextEditableElement({
  active = false,
  as: Component = 'span',
  className = '',
  disabled = false,
  label = 'Text',
  onActivate,
  onChange,
  onClose,
  registerPublisher,
  value = '',
  ...rest
}, forwardedRef) {
  const elementRef = useRef(null)
  const activationModeRef = useRef('cursor-end')
  const renderedValue = richTextValueToInlineHtml(value)
  const lastPublishedValueRef = useRef(renderedValue)
  const [draftValue, setDraftValue] = useState(renderedValue)
  const isInteractiveElement = Component === 'a' || Component === 'button'
  const currentValue = active ? draftValue : renderedValue
  const isEmpty = isEmptyHtmlValue(currentValue)

  useEffect(() => {
    const element = elementRef.current
    const shouldSyncLocalDraft =
      renderedValue !== lastPublishedValueRef.current || !active || document.activeElement !== element

    if (!shouldSyncLocalDraft) {
      return
    }

    lastPublishedValueRef.current = renderedValue
    setDraftValue(renderedValue)
  }, [active, renderedValue])

  useLayoutEffect(() => {
    const element = elementRef.current

    if (!active || !element || element.innerHTML === renderedValue) {
      return
    }

    const isFocused = document.activeElement === element
    const caretOffsets = isFocused ? captureCaretOffset(element) : null

    element.innerHTML = renderedValue

    if (isFocused) {
      restoreCaretOffset(element, caretOffsets)
    }
  }, [active, renderedValue])

  useLayoutEffect(() => {
    if (!active) {
      return
    }

    const element = elementRef.current

    if (!element) {
      return
    }

    if (activationModeRef.current === 'preserve-selection') {
      activationModeRef.current = 'cursor-end'
      return
    }

    if (document.activeElement !== element) {
      element.focus()
      focusEditableElementAtEnd(element)
    }
  }, [active])

  const publishNextValue = useCallback((nextValue) => {
    lastPublishedValueRef.current = nextValue
    setDraftValue(nextValue)
    onChange?.(nextValue)
  }, [onChange])

  useEffect(() => {
    if (typeof registerPublisher !== 'function') {
      return undefined
    }

    registerPublisher(publishNextValue)

    return () => {
      registerPublisher(null)
    }
  }, [publishNextValue, registerPublisher])

  function handleClick(event) {
    if (disabled) {
      return
    }

    if (!active) {
      event.preventDefault()
      event.stopPropagation()
      onActivate?.()
      return
    }

    if (isInteractiveElement) {
      event.preventDefault()
    }

    event.stopPropagation()

    if (document.activeElement !== elementRef.current) {
      elementRef.current?.focus()

      if (!hasSelectionInsideElement(elementRef.current)) {
        focusEditableElementAtEnd(elementRef.current)
      }
    }
  }

  function handleMouseDown(event) {
    if (disabled) {
      return
    }

    if (!active) {
      activationModeRef.current = 'preserve-selection'
      event.stopPropagation()
      flushSync(() => {
        onActivate?.()
      })
      return
    }

    if (isInteractiveElement) {
      event.preventDefault()
    }

    event.stopPropagation()
  }

  function handleInput(event) {
    publishNextValue(event.currentTarget.innerHTML)
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onClose?.()
    event.currentTarget.blur()
  }

  function handleBlur(event) {
    publishNextValue(event.currentTarget.innerHTML)
  }

  return (
    <Component
      ref={(node) => {
        elementRef.current = node
        assignRef(forwardedRef, node)
      }}
      {...rest}
      className={className}
      contentEditable={active && !disabled}
      data-admin-inline-empty={isEmpty ? 'true' : undefined}
      data-admin-inline-editing={active ? 'true' : undefined}
      data-placeholder={isEmpty ? label : undefined}
      dangerouslySetInnerHTML={active ? undefined : { __html: renderedValue }}
      suppressContentEditableWarning
      onBlur={active ? handleBlur : undefined}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onInput={active ? handleInput : undefined}
      onKeyDown={active ? handleKeyDown : undefined}
    />
  )
})

export function EditableText({
  as: Component = 'span',
  children,
  className = '',
  label = 'Text',
  multiline = false,
  path,
  rows = 4,
  value = '',
  ...rest
}) {
  const anchorRef = useRef(null)
  const publishValueRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const displayValue = value ?? (typeof children === 'string' ? children : '')
  const allowLinkFormatting = Component !== 'a'
  void multiline
  void rows

  return (
    <>
      <InlineTextEditableElement
        ref={anchorRef}
        active={isActive}
        as={Component}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        disabled={!field.isEnabled || field.disabled}
        label={label}
        onActivate={field.activate}
        onChange={(nextValue) => field.updatePath(path, nextValue)}
        onClose={field.close}
        registerPublisher={(publisher) => {
          publishValueRef.current = typeof publisher === 'function' ? publisher : null
        }}
        value={displayValue}
      />
      <InlineTextFormattingToolbar
        active={isActive}
        allowBlockFormatting={['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(String(Component).toLowerCase())}
        allowLineBreaks={multiline}
        allowLinkFormatting={allowLinkFormatting}
        anchorRef={anchorRef}
        disabled={!field.isEnabled || field.disabled}
        fixedBlockTag={String(Component).toLowerCase()}
        onClose={field.close}
        onSync={(nextValue) => {
          if (typeof publishValueRef.current === 'function') {
            publishValueRef.current(nextValue)
            return
          }

          field.updatePath(path, nextValue)
        }}
      />
    </>
  )
}

export function EditableLink({
  allowExternalUrl = false,
  allowRouteSelection = false,
  buttonColor = '',
  buttonColorLabel = 'Button Color',
  buttonColorPath,
  className = '',
  destination = '',
  destinationLabel = 'Link',
  destinationPath,
  external = false,
  label = '',
  labelLabel = 'Text',
  labelPath,
  style,
  target = undefined,
  ...rest
}) {
  const anchorRef = useRef(null)
  const routeInventory = useRouteInventory()
  const textPath = labelPath ?? destinationPath
  const normalizedButtonColor = normalizeColorValue(buttonColor)
  const normalizedDestination = normalizeLinkValue(destination)
  const routeOptions = buildRouteOptions(routeInventory)
  const routeOptionValues = new Set(routeOptions.map((option) => option.value))
  const isExternalDestination = normalizedDestination ? isExternalLinkValue(normalizedDestination) : external
  const routeSelectionEnabled = Boolean(destinationPath) && allowRouteSelection && routeOptions.length > 0
  const externalUrlEnabled = Boolean(destinationPath) && allowExternalUrl
  const usesRouteSelection = routeSelectionEnabled && !isExternalDestination
  const selectableRouteOptions =
    usesRouteSelection && normalizedDestination && !routeOptionValues.has(normalizedDestination)
      ? [{ label: `Current Path | ${normalizedDestination}`, value: normalizedDestination }, ...routeOptions]
      : routeOptions
  const sharesDestinationPath = pathsAreEqual(textPath, destinationPath)
  const field = useEditableField(textPath, `${pathToKey(textPath ?? [])}:${pathToKey(destinationPath ?? [])}`)
  const isActive = field.isActive
  const shouldRenderExternalLink = isExternalDestination
  const shouldOpenExternalDocument = shouldRenderExternalLink && shouldOpenLinkInNewTab(normalizedDestination)
  const resolvedTarget = shouldOpenExternalDocument ? target ?? '_blank' : undefined
  const linkStyle = buttonColorPath && normalizedButtonColor ? { ...style, backgroundColor: normalizedButtonColor } : style
  const Component = field.isEnabled ? 'a' : shouldRenderExternalLink ? 'a' : Link
  const linkProps = field.isEnabled
    ? {
        href: normalizedDestination || '#',
        rel: resolvedTarget === '_blank' ? 'noreferrer noopener' : undefined,
        target: resolvedTarget,
      }
    : shouldRenderExternalLink
      ? {
          href: normalizedDestination,
          rel: resolvedTarget === '_blank' ? 'noreferrer noopener' : undefined,
          target: resolvedTarget,
        }
      : {
          to: normalizedDestination,
        }

  function handleDestinationModeChange(nextMode) {
    if (!destinationPath) {
      return
    }

    if (nextMode === 'route') {
      const nextRouteValue = selectableRouteOptions[0]?.value || routeOptions[0]?.value || '/'
      field.updatePath(destinationPath, nextRouteValue)
      return
    }

    if (!isExternalDestination) {
      field.updatePath(destinationPath, '')
    }
  }

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  function handleActivateMouseDown(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    flushSync(() => {
      field.activate()
    })
  }

  return (
    <>
      <Component
        ref={anchorRef}
        {...linkProps}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        onClick={handleActivate}
        onMouseDown={handleActivateMouseDown}
        style={linkStyle}
      >
        <RichTextValue value={label} />
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={labelLabel}>
        <InlinePopoverContent>
          <AdminRichTextEditor compact label={labelLabel} onChange={(nextValue) => field.updatePath(textPath, nextValue)} value={label ?? ''} />
          {destinationPath && !sharesDestinationPath ? (
            <>
              {routeSelectionEnabled && externalUrlEnabled ? (
                <label className="admin-field">
                  <span>Link Type</span>
                  <select value={usesRouteSelection ? 'route' : 'external'} onChange={(event) => handleDestinationModeChange(event.target.value)}>
                    <option value="route">Site Route</option>
                    <option value="external">External URL</option>
                  </select>
                </label>
              ) : null}
              {usesRouteSelection ? (
                <label className="admin-field">
                  <span>{destinationLabel}</span>
                  <select value={normalizedDestination} onChange={(event) => field.updatePath(destinationPath, event.target.value)}>
                    {selectableRouteOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="admin-field">
                  <span>{destinationLabel}</span>
                  <input
                    placeholder={externalUrlEnabled ? 'https://example.com or mailto:name@example.com' : ''}
                    type="text"
                    value={destination ?? ''}
                    onChange={(event) => field.updatePath(destinationPath, event.target.value)}
                  />
                </label>
              )}
            </>
          ) : null}
          {buttonColorPath ? (
            <label className="admin-field">
              <span>{buttonColorLabel}</span>
              <div className="admin-inline-background-color-row">
                <input
                  className="admin-inline-background-color-swatch"
                  type="color"
                  value={getColorInputValue(normalizedButtonColor, '#6da6dc')}
                  onChange={(event) => field.updatePath(buttonColorPath, event.target.value)}
                />
                <input
                  placeholder="#6da6dc"
                  type="text"
                  value={normalizedButtonColor}
                  onChange={(event) => field.updatePath(buttonColorPath, event.target.value)}
                />
              </div>
            </label>
          ) : null}
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableButton({
  className = '',
  disabled = false,
  label = '',
  labelLabel = 'Button Text',
  labelPath,
  type = 'button',
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(labelPath)
  const isActive = field.isActive
  const buttonDisabled = field.isEnabled ? field.disabled : disabled

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  function handleActivateMouseDown(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    flushSync(() => {
      field.activate()
    })
  }

  return (
    <>
      <button
        ref={anchorRef}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        aria-disabled={buttonDisabled ? 'true' : undefined}
        disabled={buttonDisabled}
        type={type}
        onClick={handleActivate}
        onMouseDown={handleActivateMouseDown}
      >
        <RichTextValue value={label} />
      </button>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title={labelLabel}>
        <InlinePopoverContent>
          <AdminRichTextEditor compact label={labelLabel} onChange={(nextValue) => field.updatePath(labelPath, nextValue)} value={label ?? ''} />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

function ImagePopoverFields({ displaySize = {}, field, image = {}, path, showSizeControls = true, title = 'Image' }) {
  function handleSizeChange(nextSize) {
    const nextImage = {
      kind: image?.kind ?? 'image',
      ...image,
      height: nextSize.height,
      width: nextSize.width,
    }

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalHeight')) {
      nextImage.originalHeight = nextSize.originalHeight
    }

    if (Object.prototype.hasOwnProperty.call(nextSize, 'originalWidth')) {
      nextImage.originalWidth = nextSize.originalWidth
    }

    field.updatePath(path, nextImage)
  }

  function handleSelectImage(nextUrl, entry) {
    const originalWidth = normalizeImageDimension(entry?.width)
    const originalHeight = normalizeImageDimension(entry?.height)

    field.updatePath(path, {
      kind: image?.kind ?? 'image',
      ...image,
      url: nextUrl,
      alt: image?.alt || entry?.alt || '',
      title: 'title' in image || entry?.title ? image?.title || entry?.title || '' : undefined,
      originalHeight: originalHeight || null,
      originalWidth: originalWidth || null,
    })
  }

  return (
    <>
      <AdminMediaManager
        currentUrl={image?.url ?? ''}
        disabled={field.disabled}
        onClear={() => field.updatePath([...path, 'url'], '')}
        onSelect={handleSelectImage}
        preferredOwnerType="page"
        title={`${title} Media`}
      />
      <label className="admin-field">
        <span>Manual Image URL</span>
        <input type="text" value={image?.url ?? ''} onChange={(event) => field.updatePath([...path, 'url'], event.target.value)} />
      </label>
      <label className="admin-field">
        <span>Alt Text</span>
        <input type="text" value={image?.alt ?? ''} onChange={(event) => field.updatePath([...path, 'alt'], event.target.value)} />
      </label>
      {'title' in image ? (
        <label className="admin-field">
          <span>Title</span>
          <input type="text" value={image?.title ?? ''} onChange={(event) => field.updatePath([...path, 'title'], event.target.value)} />
        </label>
      ) : null}
      {showSizeControls ? <AdminImageSizeControls disabled={field.disabled} displaySize={displaySize} image={image} onChange={handleSizeChange} /> : null}
    </>
  )
}

function BackgroundPopoverFields({ field, image = {}, path }) {
  const backgroundColor = normalizeColorValue(image?.backgroundColor)

  return (
    <>
      <label className="admin-field">
        <span>Background Color</span>
        <div className="admin-inline-background-color-row">
          <input
            className="admin-inline-background-color-swatch"
            type="color"
            value={getColorInputValue(backgroundColor)}
            onChange={(event) => field.updatePath([...path, 'backgroundColor'], event.target.value)}
          />
          <input
            placeholder="#0b2b5f or rgba(7, 33, 74, 0.45)"
            type="text"
            value={backgroundColor}
            onChange={(event) => field.updatePath([...path, 'backgroundColor'], event.target.value)}
          />
        </div>
      </label>
      <ImagePopoverFields field={field} image={image} path={path} showSizeControls={false} title="Background Image" />
    </>
  )
}

function getEditableImageStyle(image, style) {
  const { width, height } = getImageDimensions(image)

  if (!width && !height) {
    return style
  }

  return {
    ...style,
    width: width ? `${width}px` : style?.width,
    height: height ? `${height}px` : style?.height,
    maxWidth: style?.maxWidth ?? '100%',
    aspectRatio: width && height ? `${width} / ${height}` : style?.aspectRatio,
    objectFit: width || height ? 'contain' : style?.objectFit,
  }
}

export function EditableImage({ alt = '', className = '', image = null, path, src = '', ...rest }) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const imageStyle = getEditableImageStyle(image, rest.style)
  const [displaySize, setDisplaySize] = useState({ height: 0, width: 0 })

  function measureDisplayedImage() {
    const imageElement = anchorRef.current

    if (!imageElement || typeof imageElement.getBoundingClientRect !== 'function') {
      return
    }

    const rect = imageElement.getBoundingClientRect()
    const width = normalizeImageDimension(Math.round(rect.width))
    const height = normalizeImageDimension(Math.round(rect.height))

    if (!width || !height) {
      return
    }

    setDisplaySize((currentSize) => {
      if (currentSize.width === width && currentSize.height === height) {
        return currentSize
      }

      return { height, width }
    })
  }

  useLayoutEffect(() => {
    if (!isActive || !src) {
      return undefined
    }

    measureDisplayedImage()

    const imageElement = anchorRef.current
    let animationFrameId = 0
    const scheduleMeasure = () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(measureDisplayedImage)
    }
    const resizeObserver =
      typeof ResizeObserver === 'undefined' || !imageElement ? null : new ResizeObserver(scheduleMeasure)

    resizeObserver?.observe(imageElement)
    window.addEventListener('resize', scheduleMeasure)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [image?.height, image?.width, isActive, src])

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  function handleImageLoad(event) {
    rest.onLoad?.(event)
    measureDisplayedImage()
  }

  return (
    <>
      {src ? (
        <img
          ref={anchorRef}
          {...rest}
          alt={alt}
          className={buildEditableClassName(className, field.isEnabled, isActive)}
          data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
          onClick={handleActivate}
          onLoad={handleImageLoad}
          src={src}
          style={imageStyle}
        />
      ) : (
        <button
          ref={anchorRef}
          className={buildEditableClassName(`${className} admin-inline-image-placeholder`.trim(), field.isEnabled, isActive)}
          data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
          type="button"
          onClick={handleActivate}
        >
          Add image
        </button>
      )}

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title="Image">
        <InlinePopoverContent>
          <ImagePopoverFields displaySize={displaySize} field={field} image={image} path={path} title="Image" />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableBackgroundSection({
  as: Component = 'section',
  children,
  className = '',
  image = null,
  path,
  style,
  ...rest
}) {
  const anchorRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const backgroundColor = normalizeColorValue(image?.backgroundColor)
  const sectionStyle = {
    ...style,
    ...(backgroundColor ? { backgroundColor } : {}),
    position: style?.position ?? 'relative',
  }

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <Component
        ref={anchorRef}
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        style={sectionStyle}
      >
        {field.isEnabled ? (
          <div className="admin-inline-background-controls">
            <button
              className={`button-link button-link--ghost admin-inline-background-button${
                isActive ? ' admin-inline-background-button--active' : ''
              }`.trim()}
              data-admin-inline-editable="true"
              disabled={field.disabled}
              type="button"
              onClick={handleActivate}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              Edit background
            </button>
          </div>
        ) : null}
        {children}
      </Component>

      <InlinePopover active={isActive} anchorRef={anchorRef} onClose={field.close} title="Background">
        <InlinePopoverContent>
          <BackgroundPopoverFields field={field} image={image} path={path} />
        </InlinePopoverContent>
      </InlinePopover>
    </>
  )
}

export function EditableRichHtml({ className = '', html = '', path, title = 'Body HTML' }) {
  const field = useEditableField(path)
  const isActive = field.isActive
  const navigate = useNavigate()

  function handleActivate(event) {
    if (!field.isEnabled || field.disabled) {
      const nextPath = findInternalNavigationTarget(event)

      if (nextPath) {
        event.preventDefault()
        navigate(nextPath)
      }

      return
    }

    event.preventDefault()
    event.stopPropagation()
    field.activate()
  }

  return (
    <>
      <div
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleActivate}
      />

      {isActive ? (
        <div className="admin-inline-embedded-editor" data-admin-inline-editable={field.isEnabled ? 'true' : undefined}>
          <InlinePopoverContent>
            <AdminRichTextEditor label={title} onChange={(nextValue) => field.updatePath(path, nextValue)} value={html} />
          </InlinePopoverContent>
          <div className="admin-inline-embedded-editor-actions">
            <button className="button-link button-link--ghost" type="button" onClick={field.close}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
