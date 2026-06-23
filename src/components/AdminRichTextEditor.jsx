import { useEffect, useRef, useState } from 'react'
import {
  applyRichTextFontSize,
  captureRichTextSelectionRange,
  restoreRichTextSelectionRange,
  RICH_TEXT_BLOCK_OPTIONS,
  RICH_TEXT_FONT_SIZE_OPTIONS,
  readRichTextSelectionState,
} from '../lib/richTextFormatting'
import { AdminRichTextMenu } from './AdminRichTextMenu'

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

export function AdminRichTextEditor({
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
  const editorRef = useRef(null)
  const selectionRangeRef = useRef(null)
  const [mode, setMode] = useState('visual')
  const [selectionState, setSelectionState] = useState(() => ({
    blockTag: 'p',
    bold: false,
    fontSize: 'default',
    italic: false,
    underline: false,
  }))
  const htmlSourceRows = Number(sourceRows) > 0 ? Number(sourceRows) : compact ? 8 : 14

  useEffect(() => {
    if (mode !== 'visual' || !editorRef.current) {
      return
    }

    if (editorRef.current.innerHTML !== String(value ?? '')) {
      editorRef.current.innerHTML = String(value ?? '')
    }
  }, [mode, value])

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
  }, [mode, value])

  function syncValue() {
    if (!editorRef.current) {
      return
    }

    const nextRange = captureRichTextSelectionRange(editorRef.current)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }

    onChange(editorRef.current.innerHTML)
    setSelectionState(readRichTextSelectionState(editorRef.current, { defaultBlockTag: 'p' }))
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

    if (applyRichTextFontSize(editorRef.current, nextValue)) {
      syncValue()
    }
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

  return (
    <div className={`admin-rich-text-editor${compact ? ' admin-rich-text-editor--compact' : ''}`.trim()}>
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
          <div className="admin-rich-text-toolbar">
            <AdminRichTextMenu
              disabled={disabled}
              label="Tag"
              onBeforeOpen={rememberSelection}
              onSelect={handleBlockTagChange}
              options={RICH_TEXT_BLOCK_OPTIONS}
              value={selectionState.blockTag}
            />
            <AdminRichTextMenu
              disabled={disabled}
              label="Size"
              onBeforeOpen={rememberSelection}
              onSelect={handleFontSizeChange}
              options={RICH_TEXT_FONT_SIZE_OPTIONS}
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
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('insertUnorderedList')}>
              Bullets
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('insertOrderedList')}>
              Numbers
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={insertLink}>
              Link
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('removeFormat')}>
              Clear
            </ToolbarButton>
          </div>

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
            onInput={syncValue}
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
            <textarea disabled={disabled} rows={htmlSourceRows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
          </label>
        </>
      )}
    </div>
  )
}
