import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ADMIN_FLOATING_PREVIEW_STACK_OFFSET_VAR, ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR } from '../lib/adminFloatingLayout'
import { resolveLinkRenderConfig } from '../lib/linkRecords'
import { getClipboardRichTextHtml, richTextValueToHtml } from '../lib/richTextValue'
import {
  applyRichTextFontSize,
  captureCaretOffset,
  captureRichTextSelectionRange,
  elementIntersectsRange,
  restoreCaretOffset,
  restoreRichTextSelectionRange,
  readRichTextSelectionState,
} from '../lib/richTextFormatting'
import { getEnabledRichTextBlockOptions, getEnabledRichTextFontSizeOptions } from '../lib/editorStyleSettings'
import { useEditorStyleSettings } from '../lib/useEditorStyleSettings'
import { AdminLinkFields } from './AdminLinkFields'
import { AdminRichTextMenu } from './AdminRichTextMenu'
import { RichTextFontSizeInput } from './RichTextFontSizeInput'

function ToolbarButton({ active = false, children, disabled, onClick }) {
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

export function AdminRichTextEditor({
  collapsedFontSizeBehavior = 'selection',
  compact = false,
  disabled = false,
  helperText = '',
  label,
  onChange,
  placeholder = 'Start typing the page content here.',
  snippets = [],
  sourceRows = undefined,
  value,
}) {
  const editorShellRef = useRef(null)
  const editorRef = useRef(null)
  const toolbarShellRef = useRef(null)
  const toolbarRef = useRef(null)
  const selectionRangeRef = useRef(null)
  const linkEditorPanelRef = useRef(null)
  const [mode, setMode] = useState('visual')
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarLayout, setToolbarLayout] = useState(() => ({
    floating: false,
    height: 0,
    left: 0,
    width: 0,
  }))
  const [linkEditorState, setLinkEditorState] = useState(null)
  const [selectionState, setSelectionState] = useState(() => ({
    blockTag: 'p',
    bold: false,
    fontSize: 'default',
    italic: false,
    underline: false,
  }))
  const editorStyleSettings = useEditorStyleSettings()
  const blockStyleOptions = getEnabledRichTextBlockOptions(editorStyleSettings)
  const fontSizeOptions = getEnabledRichTextFontSizeOptions(editorStyleSettings)
  const htmlSourceRows = Number(sourceRows) > 0 ? Number(sourceRows) : compact ? 8 : 14
  const renderedValue = richTextValueToHtml(value)

  useLayoutEffect(() => {
    if (mode !== 'visual' || !editorRef.current) {
      return
    }

    const editor = editorRef.current
    const nextHtml = isEmptyHtmlValue(renderedValue) ? '' : renderedValue

    if (editor.innerHTML === nextHtml) {
      return
    }

    const isFocused = document.activeElement === editor
    const caretOffsets = isFocused ? captureCaretOffset(editor) : null

    editor.innerHTML = nextHtml

    if (isFocused) {
      restoreCaretOffset(editor, caretOffsets)
    }
  }, [mode, renderedValue])

  useEffect(() => {
    if (mode !== 'visual' || typeof document === 'undefined') {
      return undefined
    }

    function updateSelectionState({ preserveWhenMissing = true } = {}) {
      const editor = editorRef.current

      if (!editor) {
        return
      }

      const nextRange = captureRichTextSelectionRange(editor)

      if (nextRange) {
        selectionRangeRef.current = nextRange
        setSelectionState(readRichTextSelectionState(editor, { defaultBlockTag: 'p' }))
        return
      }

      if (!preserveWhenMissing) {
        setSelectionState(readRichTextSelectionState(editor, { defaultBlockTag: 'p' }))
      }
    }

    updateSelectionState({ preserveWhenMissing: false })
    document.addEventListener('selectionchange', updateSelectionState)

    return () => {
      document.removeEventListener('selectionchange', updateSelectionState)
    }
  }, [mode])

  useEffect(() => {
    if (!linkEditorState || typeof document === 'undefined') {
      return undefined
    }

    function handlePointerDown(event) {
      if (!linkEditorPanelRef.current || linkEditorPanelRef.current.contains(event.target)) {
        return
      }

      setLinkEditorState(null)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setLinkEditorState(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [linkEditorState])

  useLayoutEffect(() => {
    if (!toolbarVisible || mode !== 'visual' || typeof window === 'undefined') {
      return undefined
    }

    let animationFrameId = 0

    function updateToolbarLayout() {
      const editorShell = editorShellRef.current
      const toolbarShell = toolbarShellRef.current
      const toolbar = toolbarRef.current

      if (!editorShell || !toolbarShell || !toolbar) {
        return
      }

      const editorShellBounds = editorShell.getBoundingClientRect()
      const toolbarShellBounds = toolbarShell.getBoundingClientRect()
      const toolbarHeight = toolbar.offsetHeight
      const margin = 14
      const nextWidth = Math.min(toolbarShellBounds.width, Math.max(0, window.innerWidth - margin * 2))
      const maxLeft = Math.max(margin, window.innerWidth - nextWidth - margin)
      const canFloatWithinEditor = editorShellBounds.bottom - margin >= toolbarHeight + margin
      const shouldFloat = toolbarShellBounds.top <= margin && canFloatWithinEditor

      setToolbarLayout((currentLayout) => {
        const nextLayout = shouldFloat
          ? {
              floating: true,
              height: toolbarHeight,
              left: Math.min(Math.max(margin, toolbarShellBounds.left), maxLeft),
              width: nextWidth,
            }
          : {
              floating: false,
              height: toolbarHeight,
              left: 0,
              width: 0,
            }

        if (
          currentLayout.floating === nextLayout.floating &&
          currentLayout.height === nextLayout.height &&
          currentLayout.left === nextLayout.left &&
          currentLayout.width === nextLayout.width
        ) {
          return currentLayout
        }

        return nextLayout
      })
    }

    function scheduleToolbarLayoutUpdate() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(updateToolbarLayout)
    }

    scheduleToolbarLayoutUpdate()
    window.addEventListener('resize', scheduleToolbarLayoutUpdate)
    window.addEventListener('scroll', scheduleToolbarLayoutUpdate, true)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      window.removeEventListener('resize', scheduleToolbarLayoutUpdate)
      window.removeEventListener('scroll', scheduleToolbarLayoutUpdate, true)
    }
  }, [mode, toolbarVisible])

  function syncValue() {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const normalizedHtml = (() => {
      const nextHtml = isEmptyHtmlValue(editor.innerHTML) ? '' : richTextValueToHtml(editor.innerHTML)

      if (editor.innerHTML === nextHtml) {
        return nextHtml
      }

      const isFocused = document.activeElement === editor
      const caretOffsets = isFocused ? captureCaretOffset(editor) : null

      editor.innerHTML = nextHtml

      if (isFocused) {
        restoreCaretOffset(editor, caretOffsets)
      }

      return nextHtml
    })()

    const nextRange = captureRichTextSelectionRange(editor)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }

    onChange(normalizedHtml)
    setSelectionState(readRichTextSelectionState(editor, { defaultBlockTag: 'p' }))
  }

  function rememberSelection() {
    const nextRange = captureRichTextSelectionRange(editorRef.current)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }
  }

  function focusEditorSelection() {
    if (!editorRef.current) {
      return false
    }

    if (restoreRichTextSelectionRange(editorRef.current, selectionRangeRef.current)) {
      return true
    }

    editorRef.current.focus()
    return true
  }

  function applyCommand(command, commandValue = null) {
    if (disabled || !editorRef.current || !focusEditorSelection()) {
      return
    }

    document.execCommand(command, false, commandValue)
    syncValue()
  }

  function handleBlockTagChange(nextValue) {
    const nextTag = String(nextValue ?? 'p').trim().toLowerCase()

    if (!nextTag) {
      return
    }

    applyCommand('formatBlock', `<${nextTag}>`)
  }

  function handleFontSizeChange(nextValue) {
    if (disabled || !editorRef.current || !focusEditorSelection()) {
      return
    }

    if (applyRichTextFontSize(editorRef.current, nextValue, { collapsedBehavior: collapsedFontSizeBehavior })) {
      syncValue()
    }
  }

  function getSelectedAnchorElement() {
    const editor = editorRef.current

    if (!editor || typeof window === 'undefined') {
      return null
    }

    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return null
    }

    let node = selection.getRangeAt(0).commonAncestorContainer

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement
    }

    const anchorElement = node instanceof Element ? node.closest('a') : null
    return anchorElement && editor.contains(anchorElement) ? anchorElement : null
  }

  function openLinkEditor() {
    if (disabled || !focusEditorSelection()) {
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

  function closeLinkEditor() {
    setLinkEditorState(null)
  }

  function applyLinkDraft() {
    if (disabled || !editorRef.current || !linkEditorState || !focusEditorSelection()) {
      return
    }

    const renderConfig = resolveLinkRenderConfig(linkEditorState.link, { defaultType: 'external', destinationField: 'href' })
    const href = renderConfig.destination

    if (!href) {
      return
    }

    document.execCommand('createLink', false, href)

    const anchorElement = getSelectedAnchorElement()

    if (anchorElement) {
      if (renderConfig.target) {
        anchorElement.setAttribute('target', renderConfig.target)
        anchorElement.setAttribute('rel', renderConfig.rel || 'noreferrer noopener')
      } else {
        anchorElement.removeAttribute('target')
        anchorElement.removeAttribute('rel')
      }
    }

    syncValue()
    closeLinkEditor()
  }

  function removeLink() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    document.execCommand('unlink', false, null)
    syncValue()
    closeLinkEditor()
  }

  function tightenSelectedLines() {
    const editor = editorRef.current

    if (disabled || !editor || !focusEditorSelection()) {
      return
    }

    const selection = typeof window !== 'undefined' ? window.getSelection() : null
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    if (!range || range.collapsed) {
      return
    }

    const selectedBlocks = Array.from(editor.children).filter((child) => elementIntersectsRange(child, range))

    if (selectedBlocks.length < 2) {
      return
    }

    const anchorBlock = selectedBlocks[0]

    selectedBlocks.slice(1).forEach((block) => {
      anchorBlock.append(document.createElement('br'))

      while (block.firstChild) {
        anchorBlock.append(block.firstChild)
      }

      block.remove()
    })

    syncValue()
  }

  function handleCanvasKeyDown(event) {
    if (disabled || event.key !== 'Enter' || !event.shiftKey) {
      return
    }

    event.preventDefault()
    document.execCommand('insertHTML', false, '<br />')
    syncValue()
  }

  function insertSnippet(html) {
    if (disabled || !html) {
      return
    }

    if (mode === 'html') {
      const normalizedValue = String(value ?? '').trim()
      const separator = normalizedValue ? '\n' : ''
      onChange(`${normalizedValue}${separator}${html}`.trim())
      return
    }

    applyCommand('insertHTML', html)
  }

  function showToolbar() {
    if (!disabled) {
      setToolbarVisible(true)
    }
  }

  function handlePaste(event) {
    if (disabled) {
      return
    }

    const pastedHtml = getClipboardRichTextHtml(event.clipboardData)

    if (!pastedHtml) {
      return
    }

    event.preventDefault()
    document.execCommand('insertHTML', false, pastedHtml)
    syncValue()
  }

  function handleEditorShellBlur(event) {
    const nextFocusedElement = event.relatedTarget

    if (
      editorShellRef.current &&
      nextFocusedElement instanceof Node &&
      editorShellRef.current.contains(nextFocusedElement)
    ) {
      return
    }

    setToolbarVisible(false)
  }

  const toolbarFloating = toolbarVisible && mode === 'visual' && toolbarLayout.floating
  const toolbarStyle = toolbarFloating
    ? {
        left: `${toolbarLayout.left}px`,
        top: `calc(var(--admin-floating-base-top, 1rem) + var(${ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR}, 0px) + var(${ADMIN_FLOATING_PREVIEW_STACK_OFFSET_VAR}, 0px))`,
        width: `${toolbarLayout.width}px`,
      }
    : undefined

  return (
    <div
      ref={editorShellRef}
      className={`admin-rich-text-editor${compact ? ' admin-rich-text-editor--compact' : ''}${
        toolbarVisible ? ' admin-rich-text-editor--toolbar-visible' : ''
      }`.trim()}
      onBlur={handleEditorShellBlur}
    >
      <div className="admin-rich-text-header">
        <span>{label}</span>
        <div className="admin-inline-actions">
          <ToolbarButton disabled={disabled || mode === 'visual'} onClick={() => setMode('visual')}>
            Visual
          </ToolbarButton>
          <ToolbarButton disabled={disabled || mode === 'html'} onClick={() => setMode('html')}>
            HTML
          </ToolbarButton>
        </div>
      </div>

      {mode === 'visual' ? (
        <>
          <div
            ref={toolbarShellRef}
            className={`admin-rich-text-toolbar-shell${toolbarFloating ? ' admin-rich-text-toolbar-shell--floating' : ''}`.trim()}
            style={toolbarFloating ? { minHeight: `${toolbarLayout.height}px` } : undefined}
          >
            <div ref={toolbarRef} className="admin-rich-text-toolbar" style={toolbarStyle}>
              <AdminRichTextMenu
                disabled={disabled}
                label="Tag"
                onBeforeOpen={rememberSelection}
                onSelect={handleBlockTagChange}
                options={blockStyleOptions}
                value={selectionState.blockTag}
              />
              <AdminRichTextMenu
                disabled={disabled}
                footer={<RichTextFontSizeInput disabled={disabled} onApply={handleFontSizeChange} />}
                label="Size"
                onBeforeOpen={rememberSelection}
                onSelect={handleFontSizeChange}
                options={fontSizeOptions}
                value={selectionState.fontSize}
              />
              <ToolbarButton active={selectionState.bold} disabled={disabled} onClick={() => applyCommand('bold')}>
                Bold
              </ToolbarButton>
              <ToolbarButton active={selectionState.italic} disabled={disabled} onClick={() => applyCommand('italic')}>
                Italic
              </ToolbarButton>
              <ToolbarButton active={selectionState.underline} disabled={disabled} onClick={() => applyCommand('underline')}>
                Underline
              </ToolbarButton>
              <ToolbarButton disabled={disabled} onClick={() => applyCommand('insertHTML', '<br />')}>
                Line Break
              </ToolbarButton>
              <ToolbarButton disabled={disabled} onClick={tightenSelectedLines}>
                Tighten Lines
              </ToolbarButton>
              <ToolbarButton disabled={disabled} onClick={() => applyCommand('insertUnorderedList')}>
                Bullets
              </ToolbarButton>
              <ToolbarButton disabled={disabled} onClick={() => applyCommand('insertOrderedList')}>
                Numbers
              </ToolbarButton>
              <ToolbarButton active={Boolean(linkEditorState)} disabled={disabled} onClick={openLinkEditor}>
                Link
              </ToolbarButton>
              <ToolbarButton disabled={disabled} onClick={() => applyCommand('removeFormat')}>
                Clear
              </ToolbarButton>
            </div>
          </div>

          <p className="admin-note admin-rich-text-linebreak-hint">
            Press <strong>Enter</strong> for a new paragraph (adds spacing). Press <strong>Shift+Enter</strong> or click{' '}
            <strong>Line Break</strong> to start a new line without extra spacing. Select a few lines and click{' '}
            <strong>Tighten Lines</strong> to remove extra spacing from text that already has it.
          </p>

          {linkEditorState ? (
            <div className="admin-rich-text-link-editor-shell" role="presentation">
              <div aria-label="Link" className="admin-rich-text-link-editor" ref={linkEditorPanelRef} role="dialog">
                <AdminLinkFields
                  defaultType="external"
                  destinationField="href"
                  destinationLabel="Link"
                  disabled={disabled}
                  link={linkEditorState.link}
                  onChange={(nextLink) => setLinkEditorState((currentState) => ({ ...currentState, link: nextLink }))}
                />
                <div className="admin-inline-actions">
                  <ToolbarButton disabled={disabled} onClick={applyLinkDraft}>
                    Apply link
                  </ToolbarButton>
                  {linkEditorState.hasExistingLink ? (
                    <ToolbarButton disabled={disabled} onClick={removeLink}>
                      Remove link
                    </ToolbarButton>
                  ) : null}
                  <ToolbarButton disabled={disabled} onClick={closeLinkEditor}>
                    Cancel
                  </ToolbarButton>
                </div>
              </div>
            </div>
          ) : null}

          {snippets.length > 0 ? (
            <div className="admin-rich-text-snippets">
              <span>Quick Insert</span>
              <div className="admin-inline-actions">
                {snippets.map((snippet) => (
                  <ToolbarButton disabled={disabled} key={snippet.label} onClick={() => insertSnippet(snippet.html)}>
                    {snippet.label}
                  </ToolbarButton>
                ))}
              </div>
            </div>
          ) : null}

          {helperText ? <p className="admin-note admin-rich-text-help">{helperText}</p> : null}

          <div
            ref={editorRef}
            aria-label={label}
            className={`admin-rich-text-canvas ${compact ? 'admin-rich-text-canvas--compact' : ''} ${
              disabled ? 'admin-rich-text-canvas--disabled' : ''
            }`.trim()}
            contentEditable={!disabled}
            data-placeholder={placeholder}
            suppressContentEditableWarning
            onBlur={syncValue}
            onFocus={showToolbar}
            onInput={syncValue}
            onKeyDown={handleCanvasKeyDown}
            onPaste={handlePaste}
          />
        </>
      ) : (
        <>
          {snippets.length > 0 ? (
            <div className="admin-rich-text-snippets">
              <span>Quick Insert</span>
              <div className="admin-inline-actions">
                {snippets.map((snippet) => (
                  <ToolbarButton disabled={disabled} key={snippet.label} onClick={() => insertSnippet(snippet.html)}>
                    {snippet.label}
                  </ToolbarButton>
                ))}
              </div>
            </div>
          ) : null}

          {helperText ? <p className="admin-note admin-rich-text-help">{helperText}</p> : null}

          <label className="admin-field admin-field--wide">
            <span>HTML Source</span>
            <textarea
              disabled={disabled}
              rows={htmlSourceRows}
              value={value ?? ''}
              onChange={(event) => onChange(event.target.value)}
              onFocus={showToolbar}
            />
          </label>
        </>
      )}
    </div>
  )
}
