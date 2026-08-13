import { forwardRef, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { AlignJustify, Bold, Check, CornerDownLeft, Italic, Link as LinkIcon, Paintbrush, RemoveFormatting, Underline, Unlink, X } from 'lucide-react'
import { Link, useNavigate } from '../lib/router'
import { getImageDimensions, normalizeImageDimension } from '../lib/imageSizePresets'
import { findInternalNavigationTarget } from '../lib/internalLinkNavigation'
import { buildRouteOptions, resolveLinkRenderConfig } from '../lib/linkRecords'
import { getClipboardRichTextHtml, richTextValueToHtml, richTextValueToInlineHtml } from '../lib/richTextValue'
import {
  RICH_TEXT_HORIZONTAL_ALIGN_OPTIONS,
  applyRichTextColor,
  applyRichTextHorizontalAlign,
  applyRichTextFontSize,
  captureCaretOffset,
  captureRichTextSelectionRange,
  insertLinkAtCollapsedSelection,
  isTightenedBlockSelection,
  placeCaretAtPoint,
  restoreCaretOffset,
  restoreRichTextSelectionRange,
  readRichTextSelectionState,
  tightenOrUntightenSelectedLines,
} from '../lib/richTextFormatting'
import { RICH_TEXT_COLOR_OPTIONS } from '../lib/richTextColorOptions'
import { getEnabledRichTextBlockOptions, getEnabledRichTextFontSizeOptions } from '../lib/editorStyleSettings'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { useEditorStyleSettings } from '../lib/useEditorStyleSettings'
import { usePageEditor } from '../lib/usePageEditor'
import { AdminLinkFields } from './AdminLinkFields'
import { AdminImageSizeControls } from './AdminImageSizeControls'
import { AdminRichTextMenu } from './AdminRichTextMenu'
import { EditorIconButton } from './EditorIconButton'
import { RichTextFontSizeInput } from './RichTextFontSizeInput'

const AdminMediaManager = lazy(() =>
  import('./AdminMediaManager').then((module) => ({
    default: module.AdminMediaManager,
  })),
)

function pathToKey(path = []) {
  return path.map((segment) => String(segment)).join('.')
}

function getTerminalPathSegment(path = []) {
  return Array.isArray(path) && path.length > 0 ? String(path[path.length - 1] ?? '').trim() : ''
}

function pathsAreEqual(leftPath = [], rightPath = []) {
  if (!Array.isArray(leftPath) || !Array.isArray(rightPath) || leftPath.length !== rightPath.length) {
    return false
  }

  return leftPath.every((segment, index) => segment === rightPath[index])
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
          <EditorIconButton className="admin-inline-popover-close" icon={X} label="Close" onClick={onClose} />
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

function InlineToolbarButton({ active = false, disabled, icon, label, onClick }) {
  return (
    <EditorIconButton
      className={`admin-rich-text-button${active ? ' admin-rich-text-button--active' : ''}`}
      disabled={disabled}
      icon={icon}
      label={label}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
    />
  )
}

function isEmptyHtmlValue(value = '') {
  const sourceHtml = String(value ?? '')

  if (/<\s*table\b/i.test(sourceHtml)) {
    return false
  }

  return sourceHtml
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim().length === 0
}

function ensureDefaultParagraphSeparator() {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  } catch {
    // Browsers that do not support this command still fall back to their native Enter behavior.
  }
}

function getInsertedLinkText(renderConfig) {
  const destination = String(renderConfig?.destination || renderConfig?.href || renderConfig?.to || '').trim()

  if (renderConfig?.type === 'email') {
    return destination.replace(/^mailto:/i, '').split('?')[0] || destination
  }

  if (renderConfig?.type === 'phone') {
    return destination.replace(/^tel:/i, '') || destination
  }

  return destination
}

function normalizeColorValue(value) {
  return String(value ?? '').trim()
}

function normalizeLinkValue(value) {
  return String(value ?? '').trim()
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

function RichTextColorInput({ disabled, onApply }) {
  const [customColor, setCustomColor] = useState('#111111')

  return (
    <div className="admin-rich-text-menu-custom-color">
      <label>
        <span>Custom</span>
        <input disabled={disabled} type="color" value={getColorInputValue(customColor, '#111111')} onChange={(event) => setCustomColor(event.target.value)} />
      </label>
      <button
        className="admin-rich-text-menu-custom-size-apply"
        disabled={disabled}
        type="button"
        onClick={() => onApply(customColor)}
        onMouseDown={(event) => event.preventDefault()}
      >
        Apply
      </button>
    </div>
  )
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
  allowLineTightening = false,
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
    color: 'default',
    fontSize: 'default',
    horizontalAlign: 'left',
    italic: false,
    tightenedLines: false,
    underline: false,
  }))
  const [linkEditorState, setLinkEditorState] = useState(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const routeInventory = useRouteInventory()
  const routeOptions = buildRouteOptions(routeInventory)
  const editorStyleSettings = useEditorStyleSettings()
  const blockStyleOptions = getEnabledRichTextBlockOptions(editorStyleSettings)
  const fontSizeOptions = getEnabledRichTextFontSizeOptions(editorStyleSettings)
  const displayedFontSizeOptions = fontSizeOptions.map((option) =>
    option.value === 'default' && selectionState.defaultFontSizeLabel
      ? { ...option, label: selectionState.defaultFontSizeLabel }
      : option,
  )

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
  }, [active, anchorRef, linkEditorState])

  const readSelectionState = useCallback(
    (anchor) => ({
      ...readRichTextSelectionState(anchor, {
        defaultBlockTag: fixedBlockTag || 'p',
        fixedBlockTag,
      }),
      tightenedLines: allowLineTightening ? isTightenedBlockSelection(anchor) : false,
    }),
    [allowLineTightening, fixedBlockTag],
  )

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
        setSelectionState(readSelectionState(anchor))
        return
      }

      if (!preserveWhenMissing) {
        setSelectionState(readSelectionState(anchor))
      }
    }

    updateSelectionState({ preserveWhenMissing: false })
    document.addEventListener('selectionchange', updateSelectionState)

    return () => {
      document.removeEventListener('selectionchange', updateSelectionState)
    }
  }, [active, anchorRef, readSelectionState])

  useEffect(() => {
    if (active || typeof window === 'undefined') {
      return undefined
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      setLinkEditorState(null)
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [active])

  useEffect(() => {
    if (!active || !linkEditorState || typeof document === 'undefined') {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setLinkEditorState(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, linkEditorState])

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
    setSelectionState(readSelectionState(anchor))
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

  function tightenSelectedLines() {
    if (disabled) {
      return
    }

    const anchor = anchorRef?.current

    if (!anchor || !focusAnchorSelection()) {
      return
    }

    if (tightenOrUntightenSelectedLines(anchor)) {
      syncCurrentValue()
    }
  }

  function getSelectedAnchorElement() {
    const anchor = anchorRef?.current
    const selection = typeof window !== 'undefined' ? window.getSelection() : null

    if (!anchor || !selection || selection.rangeCount === 0) {
      return null
    }

    let node = selection.getRangeAt(0).commonAncestorContainer

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement
    }

    const anchorElement = node instanceof Element ? node.closest('a') : null
    return anchorElement && anchor.contains(anchorElement) ? anchorElement : null
  }

  function openLinkEditor() {
    if (disabled || !focusAnchorSelection()) {
      return
    }

    const existingAnchor = getSelectedAnchorElement()

    setLinkEditorState({
      hasExistingLink: Boolean(existingAnchor),
      link: existingAnchor
        ? {
            href: existingAnchor.getAttribute('href') || '',
            openInNewTab: existingAnchor.getAttribute('target') === '_blank',
          }
        : {},
    })
  }

  function applyLinkDraft() {
    if (disabled || !linkEditorState || !focusAnchorSelection()) {
      return
    }

    const renderConfig = resolveLinkRenderConfig(linkEditorState.link, { defaultType: 'external', destinationField: 'href' })
    const href = renderConfig.destination

    if (!href) {
      return
    }

    const existingAnchorElement = getSelectedAnchorElement()
    const insertedAnchorElement = existingAnchorElement
      ? null
      : insertLinkAtCollapsedSelection(anchorRef.current, href, getInsertedLinkText(renderConfig))

    if (!insertedAnchorElement) {
      document.execCommand('createLink', false, href)
    }

    const anchorElement = insertedAnchorElement || getSelectedAnchorElement()

    if (anchorElement) {
      anchorElement.setAttribute('href', href)

      if (renderConfig.target) {
        anchorElement.setAttribute('target', renderConfig.target)
        anchorElement.setAttribute('rel', renderConfig.rel || 'noreferrer noopener')
      } else {
        anchorElement.removeAttribute('target')
        anchorElement.removeAttribute('rel')
      }
    }

    syncCurrentValue()
    setLinkEditorState(null)
  }

  function removeLink() {
    if (disabled || !focusAnchorSelection()) {
      return
    }

    document.execCommand('unlink', false, null)
    syncCurrentValue()
    setLinkEditorState(null)
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

  function handleColorChange(nextValue) {
    const anchor = anchorRef?.current

    if (disabled || !anchor || !focusAnchorSelection()) {
      return
    }

    if (applyRichTextColor(anchor, nextValue, { collapsedBehavior: 'root' })) {
      syncCurrentValue()
    }
  }

  function handleHorizontalAlignChange(nextValue) {
    const anchor = anchorRef?.current

    if (disabled || !anchor || !focusAnchorSelection()) {
      return
    }

    if (applyRichTextHorizontalAlign(anchor, nextValue)) {
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
          label="Style"
          onBeforeOpen={rememberSelection}
          onSelect={handleBlockTagChange}
          options={blockStyleOptions}
          showLabel={false}
          value={selectionState.blockTag}
        />
      ) : null}
      <AdminRichTextMenu
        currentLabel={selectionState.fontSize === 'default' ? selectionState.defaultFontSizeLabel : ''}
        disabled={disabled}
        footer={<RichTextFontSizeInput disabled={disabled} onApply={handleFontSizeChange} />}
        inline
        label="Size"
        onBeforeOpen={rememberSelection}
        onSelect={handleFontSizeChange}
        options={displayedFontSizeOptions}
        showLabel={false}
        value={selectionState.fontSize}
      />
      <AdminRichTextMenu
        disabled={disabled}
        footer={<RichTextColorInput disabled={disabled} onApply={handleColorChange} />}
        inline
        label="Color"
        onBeforeOpen={rememberSelection}
        onSelect={handleColorChange}
        options={RICH_TEXT_COLOR_OPTIONS}
        showLabel={false}
        value={selectionState.color}
      />
      {allowBlockFormatting && !fixedBlockTag ? (
        <AdminRichTextMenu
          disabled={disabled}
          inline
          label="Horizontal align"
          onBeforeOpen={rememberSelection}
          onSelect={handleHorizontalAlignChange}
          options={RICH_TEXT_HORIZONTAL_ALIGN_OPTIONS}
          showLabel={false}
          value={selectionState.horizontalAlign}
        />
      ) : null}
      <InlineToolbarButton active={selectionState.bold} disabled={disabled} icon={Bold} label="Bold" onClick={() => applyCommand('bold')} />
      <InlineToolbarButton active={selectionState.italic} disabled={disabled} icon={Italic} label="Italic" onClick={() => applyCommand('italic')} />
      <InlineToolbarButton active={selectionState.underline} disabled={disabled} icon={Underline} label="Underline" onClick={() => applyCommand('underline')} />
      {allowLineBreaks ? (
        <InlineToolbarButton disabled={disabled} icon={CornerDownLeft} label="Line Break" onClick={() => applyCommand('insertHTML', '<br />')} />
      ) : null}
      {allowLineTightening ? (
        <InlineToolbarButton
          active={selectionState.tightenedLines}
          disabled={disabled}
          icon={AlignJustify}
          label={selectionState.tightenedLines ? 'Untighten Lines' : 'Tighten Lines'}
          onClick={tightenSelectedLines}
        />
      ) : null}
      {allowLinkFormatting ? (
        <InlineToolbarButton active={Boolean(linkEditorState)} disabled={disabled} icon={LinkIcon} label="Link" onClick={openLinkEditor} />
      ) : null}
      <InlineToolbarButton disabled={disabled} icon={RemoveFormatting} label="Clear formatting" onClick={() => applyCommand('removeFormat')} />
      <InlineToolbarButton disabled={disabled} icon={Check} label="Done" onClick={onClose} />
      {linkEditorState ? (
        <div aria-label="Link" className="admin-inline-format-link-editor" role="dialog">
          <AdminLinkFields
            defaultType="external"
            destinationField="href"
            destinationLabel="Link"
            disabled={disabled}
            link={linkEditorState.link}
            routeOptions={routeOptions}
            onChange={(nextLink) => setLinkEditorState((currentState) => ({ ...currentState, link: nextLink }))}
          />
          <div className="admin-inline-actions">
            <InlineToolbarButton disabled={disabled} icon={Check} label="Apply link" onClick={applyLinkDraft} />
            {linkEditorState.hasExistingLink ? (
              <InlineToolbarButton disabled={disabled} icon={Unlink} label="Remove link" onClick={removeLink} />
            ) : null}
            <InlineToolbarButton disabled={disabled} icon={X} label="Cancel" onClick={() => setLinkEditorState(null)} />
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

const InlineTextEditableElement = forwardRef(function InlineTextEditableElement({
  active = false,
  as: Component = 'span',
  className = '',
  componentDisabled = undefined,
  disabled = false,
  label = 'Text',
  multiline = false,
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

    if (isFocused && renderedValue === lastPublishedValueRef.current) {
      return
    }

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

  function syncEditableHtml(element, { cleanDom = true } = {}) {
    const normalizedValue = isEmptyHtmlValue(element?.innerHTML) ? '' : richTextValueToInlineHtml(element?.innerHTML ?? '')

    if (cleanDom && element && element.innerHTML !== normalizedValue) {
      const isFocused = document.activeElement === element
      const caretOffsets = isFocused ? captureCaretOffset(element) : null

      element.innerHTML = normalizedValue

      if (isFocused) {
        restoreCaretOffset(element, caretOffsets)
      }
    }

    return normalizedValue
  }

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
      if (isInteractiveElement) {
        event.preventDefault()
      }
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

  function handlePointerDown(event) {
    if (disabled || !isInteractiveElement) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (active) {
      return
    }

    activationModeRef.current = 'preserve-selection'
    flushSync(() => {
      onActivate?.()
    })
  }

  function handleInput(event) {
    publishNextValue(syncEditableHtml(event.currentTarget, { cleanDom: false }))
  }

  function handlePaste(event) {
    const pastedHtml = getClipboardRichTextHtml(event.clipboardData, { inline: true })

    if (!pastedHtml) {
      return
    }

    event.preventDefault()
    document.execCommand('insertHTML', false, pastedHtml)
    publishNextValue(syncEditableHtml(event.currentTarget))
  }

  function handleDrop(event) {
    const droppedHtml = getClipboardRichTextHtml(event.dataTransfer, { inline: true })

    event.preventDefault()

    if (!droppedHtml) {
      return
    }

    if (!placeCaretAtPoint(event.currentTarget, event.clientX, event.clientY)) {
      return
    }

    document.execCommand('insertHTML', false, droppedHtml)
    publishNextValue(syncEditableHtml(event.currentTarget))
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      event.stopPropagation()

      if (multiline) {
        document.execCommand('insertHTML', false, '<br />')
        publishNextValue(syncEditableHtml(event.currentTarget))
      } else {
        publishNextValue(syncEditableHtml(event.currentTarget))
        onClose?.()
        event.currentTarget.blur()
      }

      return
    }

    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onClose?.()
    event.currentTarget.blur()
  }

  function handleBlur(event) {
    publishNextValue(syncEditableHtml(event.currentTarget))
  }

  const componentStateProps =
    Component === 'button' && typeof componentDisabled === 'boolean' ? { disabled: componentDisabled } : {}

  return (
    <Component
      ref={(node) => {
        elementRef.current = node
        assignRef(forwardedRef, node)
      }}
      {...rest}
      {...componentStateProps}
      className={className}
      contentEditable={active && !disabled}
      data-admin-inline-empty={isEmpty ? 'true' : undefined}
      data-admin-inline-editing={active ? 'true' : undefined}
      data-placeholder={isEmpty ? label : undefined}
      dangerouslySetInnerHTML={active ? undefined : { __html: renderedValue }}
      suppressContentEditableWarning
      onBlur={active ? handleBlur : undefined}
      onClick={handleClick}
      onDrop={active ? handleDrop : undefined}
      onMouseDown={handleMouseDown}
      onPointerDown={handlePointerDown}
      onInput={active ? handleInput : undefined}
      onKeyDown={active ? handleKeyDown : undefined}
      onPaste={active ? handlePaste : undefined}
    />
  )
})

const InlineRichHtmlEditableElement = forwardRef(function InlineRichHtmlEditableElement({
  active = false,
  as: Component = 'div',
  className = '',
  disabled = false,
  label = 'Text',
  onActivate,
  onChange,
  onClose,
  onPassthroughClick,
  registerPublisher,
  value = '',
  ...rest
}, forwardedRef) {
  const elementRef = useRef(null)
  const activationModeRef = useRef('cursor-end')
  const renderedValue = richTextValueToHtml(value)
  const lastPublishedValueRef = useRef(renderedValue)
  const [draftValue, setDraftValue] = useState(renderedValue)
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

    if (isFocused && renderedValue === lastPublishedValueRef.current) {
      return
    }

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

  function syncEditableHtml(element, { cleanDom = true } = {}) {
    const normalizedValue = isEmptyHtmlValue(element?.innerHTML) ? '' : richTextValueToHtml(element?.innerHTML ?? '')

    if (cleanDom && element && element.innerHTML !== normalizedValue) {
      const isFocused = document.activeElement === element
      const caretOffsets = isFocused ? captureCaretOffset(element) : null

      element.innerHTML = normalizedValue

      if (isFocused) {
        restoreCaretOffset(element, caretOffsets)
      }
    }

    return normalizedValue
  }

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
      onPassthroughClick?.(event)
      return
    }

    if (!active) {
      event.preventDefault()
      event.stopPropagation()
      onActivate?.()
      return
    }

    if (event.target instanceof Element && event.target.closest('a')) {
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

    event.stopPropagation()
  }

  function handleInput(event) {
    publishNextValue(syncEditableHtml(event.currentTarget, { cleanDom: false }))
  }

  function handlePaste(event) {
    const pastedHtml = getClipboardRichTextHtml(event.clipboardData)

    if (!pastedHtml) {
      return
    }

    event.preventDefault()
    document.execCommand('insertHTML', false, pastedHtml)
    publishNextValue(syncEditableHtml(event.currentTarget))
  }

  function handleDrop(event) {
    const droppedHtml = getClipboardRichTextHtml(event.dataTransfer)

    event.preventDefault()

    if (!droppedHtml) {
      return
    }

    if (!placeCaretAtPoint(event.currentTarget, event.clientX, event.clientY)) {
      return
    }

    document.execCommand('insertHTML', false, droppedHtml)
    publishNextValue(syncEditableHtml(event.currentTarget))
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      ensureDefaultParagraphSeparator()
    }

    if (event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onClose?.()
    event.currentTarget.blur()
  }

  function handleBlur(event) {
    publishNextValue(syncEditableHtml(event.currentTarget))
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
      onDrop={active ? handleDrop : undefined}
      onMouseDown={handleMouseDown}
      onInput={active ? handleInput : undefined}
      onKeyDown={active ? handleKeyDown : undefined}
      onPaste={active ? handlePaste : undefined}
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
        multiline={multiline}
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
          const normalizedValue = richTextValueToInlineHtml(nextValue)

          if (typeof publishValueRef.current === 'function') {
            publishValueRef.current(normalizedValue)
            return
          }

          field.updatePath(path, normalizedValue)
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
  destinationField = '',
  destinationLabel = 'Link',
  destinationPath,
  external = false,
  label = '',
  labelLabel = 'Text',
  link = null,
  linkPath,
  labelPath,
  presentation = 'inline',
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
  const resolvedDestinationField =
    normalizeLinkValue(destinationField) || getTerminalPathSegment(destinationPath) || (allowRouteSelection ? 'path' : 'href')
  const linkEditorEnabled = Boolean(destinationPath) && Array.isArray(linkPath) && link && typeof link === 'object'
  // No explicit linkType here: with only a bare destination string to work with (no
  // separate "mode" field), the type must be auto-detected from the destination value
  // itself via detectLinkType so switching between Site Route and External URL below
  // actually changes which input is shown, instead of being pinned to whatever these
  // props said on the very first render.
  const fallbackLinkRecord = {
    [resolvedDestinationField]: normalizedDestination,
    target,
  }
  const renderConfig = resolveLinkRenderConfig(linkEditorEnabled ? link : fallbackLinkRecord, {
    defaultType: allowRouteSelection && !external ? 'internal' : external ? 'external' : 'external',
    destinationField: resolvedDestinationField,
  })
  const isExternalDestination = renderConfig.isInternal ? false : Boolean(renderConfig.destination)
  const routeSelectionEnabled = Boolean(destinationPath) && allowRouteSelection && routeOptions.length > 0
  const externalUrlEnabled = Boolean(destinationPath) && allowExternalUrl
  const routeOptionValues = new Set(routeOptions.map((option) => option.value))
  const usesRouteSelection = routeSelectionEnabled && !isExternalDestination
  const selectableRouteOptions =
    usesRouteSelection && normalizedDestination && !routeOptionValues.has(normalizedDestination)
      ? [{ label: `Current Path | ${normalizedDestination}`, value: normalizedDestination }, ...routeOptions]
      : routeOptions
  const sharesDestinationPath = pathsAreEqual(textPath, destinationPath)
  const field = useEditableField(textPath, `${pathToKey(textPath ?? [])}:${pathToKey(destinationPath ?? [])}`)
  const isActive = field.isActive
  const shouldRenderExternalLink = !renderConfig.isInternal
  const linkStyle = buttonColorPath && normalizedButtonColor ? { ...style, backgroundColor: normalizedButtonColor } : style
  const presentationClassName = presentation === 'button' ? 'site-button-link' : 'site-inline-link'
  const resolvedClassName = [className, presentationClassName].filter(Boolean).join(' ')
  const Component = field.isEnabled ? 'a' : shouldRenderExternalLink ? 'a' : Link
  const publishValueRef = useRef(null)
  const linkProps = field.isEnabled
    ? {
        href: renderConfig.destination || '#',
        rel: renderConfig.rel,
        target: renderConfig.target,
      }
    : shouldRenderExternalLink
      ? {
          href: renderConfig.href,
          rel: renderConfig.rel,
          target: renderConfig.target,
        }
      : {
          to: renderConfig.to,
        }
  const showInlineSettings = isActive && ((destinationPath && !sharesDestinationPath) || buttonColorPath)

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
      // An empty destination falls back to defaultType (internal), which would
      // immediately re-detect as a route and flip the UI straight back to the route
      // select. Seed a scheme so detectLinkType classifies it as external right away.
      field.updatePath(destinationPath, 'https://')
    }
  }

  return (
    <>
      <InlineTextEditableElement
        ref={anchorRef}
        active={isActive}
        as={Component}
        {...linkProps}
        {...rest}
        className={buildEditableClassName(resolvedClassName, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        disabled={!field.isEnabled || field.disabled}
        label={labelLabel}
        onActivate={field.activate}
        onChange={(nextValue) => field.updatePath(textPath, nextValue)}
        onClose={field.close}
        registerPublisher={(publisher) => {
          publishValueRef.current = typeof publisher === 'function' ? publisher : null
        }}
        style={linkStyle}
        value={label ?? ''}
      />

      <InlineTextFormattingToolbar
        active={isActive}
        allowLinkFormatting={false}
        anchorRef={anchorRef}
        disabled={!field.isEnabled || field.disabled}
        fixedBlockTag="span"
        onClose={field.close}
        onSync={(nextValue) => {
          const normalizedValue = richTextValueToInlineHtml(nextValue)

          if (typeof publishValueRef.current === 'function') {
            publishValueRef.current(normalizedValue)
            return
          }

          field.updatePath(textPath, normalizedValue)
        }}
      />

      {showInlineSettings ? (
        <div
          className="admin-inline-link-settings"
          data-admin-inline-editable="true"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <span className="admin-inline-link-settings-label">Link</span>
          {destinationPath && !sharesDestinationPath ? (
            linkEditorEnabled ? (
              <AdminLinkFields
                defaultType={allowRouteSelection && !external ? 'internal' : external ? 'external' : 'external'}
                destinationField={resolvedDestinationField}
                destinationLabel={destinationLabel}
                disabled={field.disabled}
                link={link}
                routeOptions={routeOptions}
                onChange={(nextLink) => field.updatePath(linkPath, nextLink)}
              />
            ) : (
              <>
                {routeSelectionEnabled && externalUrlEnabled ? (
                  <label className="admin-field">
                    <span>Link Type</span>
                    <select disabled={field.disabled} value={usesRouteSelection ? 'route' : 'external'} onChange={(event) => handleDestinationModeChange(event.target.value)}>
                      <option value="route">Site Route</option>
                      <option value="external">External URL</option>
                    </select>
                  </label>
                ) : null}
                {usesRouteSelection ? (
                  <label className="admin-field">
                    <span>{destinationLabel}</span>
                    <select disabled={field.disabled} value={normalizedDestination} onChange={(event) => field.updatePath(destinationPath, event.target.value)}>
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
                      disabled={field.disabled}
                      placeholder={externalUrlEnabled ? 'https://example.com or mailto:name@example.com' : ''}
                      type="text"
                      value={destination ?? ''}
                      onChange={(event) => field.updatePath(destinationPath, event.target.value)}
                    />
                  </label>
                )}
              </>
            )
          ) : null}
          {buttonColorPath ? (
            <label className="admin-field admin-inline-link-color-field">
              <span>{buttonColorLabel}</span>
              <div className="admin-inline-background-color-row">
                <input
                  className="admin-inline-background-color-swatch"
                  disabled={field.disabled}
                  type="color"
                  value={getColorInputValue(normalizedButtonColor, '#6da6dc')}
                  onChange={(event) => field.updatePath(buttonColorPath, event.target.value)}
                />
                <input
                  disabled={field.disabled}
                  placeholder="#6da6dc"
                  type="text"
                  value={normalizedButtonColor}
                  onChange={(event) => field.updatePath(buttonColorPath, event.target.value)}
                />
              </div>
            </label>
          ) : null}
        </div>
      ) : null}
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
  const publishValueRef = useRef(null)
  const field = useEditableField(labelPath)
  const isActive = field.isActive
  const buttonDisabled = field.isEnabled ? field.disabled : disabled

  return (
    <>
      <InlineTextEditableElement
        ref={anchorRef}
        active={isActive}
        as="button"
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        componentDisabled={buttonDisabled}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        aria-disabled={buttonDisabled ? 'true' : undefined}
        disabled={!field.isEnabled || field.disabled}
        label={labelLabel}
        onActivate={field.activate}
        onChange={(nextValue) => field.updatePath(labelPath, nextValue)}
        onClose={field.close}
        registerPublisher={(publisher) => {
          publishValueRef.current = typeof publisher === 'function' ? publisher : null
        }}
        type={type}
        value={label ?? ''}
      />

      <InlineTextFormattingToolbar
        active={isActive}
        allowLinkFormatting={false}
        anchorRef={anchorRef}
        disabled={!field.isEnabled || field.disabled}
        fixedBlockTag="span"
        onClose={field.close}
        onSync={(nextValue) => {
          const normalizedValue = richTextValueToInlineHtml(nextValue)

          if (typeof publishValueRef.current === 'function') {
            publishValueRef.current(normalizedValue)
            return
          }

          field.updatePath(labelPath, normalizedValue)
        }}
      />
    </>
  )
}

function ImagePopoverFields({ displaySize = {}, field, image = {}, path, showSizeControls = true }) {
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
      // A manual crop/size chosen for the previous image is very unlikely to fit a
      // newly picked image's aspect ratio - reset it so the new image renders at its
      // natural size instead of silently squeezing into the old dimensions.
      height: null,
      width: null,
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
        title=""
      />
      <label className="admin-field">
        <span>Manual Image URL</span>
        <input disabled={field.disabled} type="text" value={image?.url ?? ''} onChange={(event) => field.updatePath([...path, 'url'], event.target.value)} />
      </label>
      <label className="admin-field">
        <span>Alt Text</span>
        <input disabled={field.disabled} type="text" value={image?.alt ?? ''} onChange={(event) => field.updatePath([...path, 'alt'], event.target.value)} />
      </label>
      {'title' in image ? (
        <label className="admin-field">
          <span>Title</span>
          <input disabled={field.disabled} type="text" value={image?.title ?? ''} onChange={(event) => field.updatePath([...path, 'title'], event.target.value)} />
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
            disabled={field.disabled}
            type="color"
            value={getColorInputValue(backgroundColor)}
            onChange={(event) => field.updatePath([...path, 'backgroundColor'], event.target.value)}
          />
          <input
            disabled={field.disabled}
            placeholder="#0b2b5f or rgba(7, 33, 74, 0.45)"
            type="text"
            value={backgroundColor}
            onChange={(event) => field.updatePath([...path, 'backgroundColor'], event.target.value)}
          />
        </div>
      </label>
      <ImagePopoverFields field={field} image={image} path={path} showSizeControls={false} />
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
          <ImagePopoverFields displaySize={displaySize} field={field} image={image} path={path} />
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
            <EditorIconButton
              className={`admin-inline-background-button${isActive ? ' admin-inline-background-button--active' : ''}`}
              data-admin-inline-editable="true"
              disabled={field.disabled}
              icon={Paintbrush}
              label="Edit background"
              onClick={handleActivate}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            />
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

export function EditableRichHtml({ className = '', html = '', path, title = 'Body HTML', ...rest }) {
  const anchorRef = useRef(null)
  const publishValueRef = useRef(null)
  const field = useEditableField(path)
  const isActive = field.isActive
  const navigate = useNavigate()

  function handlePassthroughClick(event) {
    const nextPath = findInternalNavigationTarget(event)

    if (nextPath) {
      event.preventDefault()
      navigate(nextPath)
    }
  }

  return (
    <>
      <InlineRichHtmlEditableElement
        ref={anchorRef}
        active={isActive}
        as="div"
        {...rest}
        className={buildEditableClassName(className, field.isEnabled, isActive)}
        data-admin-inline-editable={field.isEnabled ? 'true' : undefined}
        disabled={!field.isEnabled || field.disabled}
        label={title}
        onActivate={field.activate}
        onChange={(nextValue) => field.updatePath(path, nextValue)}
        onClose={field.close}
        onPassthroughClick={handlePassthroughClick}
        registerPublisher={(publisher) => {
          publishValueRef.current = typeof publisher === 'function' ? publisher : null
        }}
        value={html}
      />

      <InlineTextFormattingToolbar
        active={isActive}
        allowBlockFormatting
        allowLineBreaks
        allowLineTightening
        anchorRef={anchorRef}
        disabled={!field.isEnabled || field.disabled}
        onClose={field.close}
        onSync={(nextValue) => {
          const normalizedValue = richTextValueToHtml(nextValue)

          if (typeof publishValueRef.current === 'function') {
            publishValueRef.current(normalizedValue)
            return
          }

          field.updatePath(path, normalizedValue)
        }}
      />
    </>
  )
}
