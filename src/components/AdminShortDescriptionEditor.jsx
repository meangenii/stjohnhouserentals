import { useLayoutEffect, useRef } from 'react'
import { captureCaretOffset, restoreCaretOffset } from '../lib/richTextFormatting'
import { richTextValueToPlainLineText } from '../lib/richTextValue'

const BLOCKED_FORMAT_SHORTCUTS = new Set(['b', 'i', 'u'])

function normalizeShortDescriptionText(value = '', { preserveBlankLines = true } = {}) {
  return richTextValueToPlainLineText(value, { preserveBlankLines })
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/^\n+|\n+$/g, '')
}

function readEditorText(editor) {
  return String(editor?.innerText ?? editor?.textContent ?? '')
}

function insertPlainText(value) {
  if (typeof document === 'undefined') {
    return
  }

  document.execCommand('insertText', false, value)
}

export function AdminShortDescriptionEditor({
  disabled = false,
  label,
  lockedLines = [],
  onChange,
  placeholder = '',
  value = '',
  wide = true,
}) {
  const editorRef = useRef(null)
  const normalizedLockedLines = Array.isArray(lockedLines)
    ? lockedLines.map((line) => normalizeShortDescriptionText(line, { preserveBlankLines: false })).filter(Boolean)
    : []
  const normalizedValue = normalizeShortDescriptionText(value)
  const normalizedValueLines = normalizedValue
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const displayLines = [...normalizedLockedLines, ...normalizedValueLines]

  useLayoutEffect(() => {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const currentValue = normalizeShortDescriptionText(readEditorText(editor))

    if (currentValue === normalizedValue) {
      return
    }

    const isFocused = document.activeElement === editor
    const caretOffsets = isFocused ? captureCaretOffset(editor) : null

    editor.textContent = normalizedValue

    if (isFocused) {
      restoreCaretOffset(editor, caretOffsets)
    }
  }, [normalizedValue])

  function syncValue({ cleanDom = false } = {}) {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const nextValue = normalizeShortDescriptionText(readEditorText(editor))

    if (cleanDom) {
      const isFocused = document.activeElement === editor
      const caretOffsets = isFocused ? captureCaretOffset(editor) : null

      editor.textContent = nextValue

      if (isFocused) {
        restoreCaretOffset(editor, caretOffsets)
      }
    }

    onChange(nextValue)
  }

  function handleKeyDown(event) {
    if (!event.ctrlKey && !event.metaKey) {
      return
    }

    if (BLOCKED_FORMAT_SHORTCUTS.has(event.key.toLowerCase())) {
      event.preventDefault()
    }
  }

  function handlePaste(event) {
    if (disabled) {
      return
    }

    const clipboardData = event.clipboardData
    const pastedValue = clipboardData?.getData('text/plain') || clipboardData?.getData('text/html') || ''
    const normalizedPaste = normalizeShortDescriptionText(pastedValue)

    if (!normalizedPaste) {
      return
    }

    event.preventDefault()
    insertPlainText(normalizedPaste)
    syncValue({ cleanDom: true })
  }

  function handleDrop(event) {
    if (disabled) {
      return
    }

    const droppedValue = event.dataTransfer?.getData('text/plain') || ''
    const normalizedDrop = normalizeShortDescriptionText(droppedValue)

    if (!normalizedDrop) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    insertPlainText(normalizedDrop)
    syncValue({ cleanDom: true })
  }

  return (
    <div className={`admin-field admin-field--short-description${wide ? ' admin-field--wide' : ''}`.trim()}>
      <span>{label}</span>
      {displayLines.length > 0 ? (
        <div className="admin-short-description-derived" aria-readonly="true">
          {displayLines.map((line, index) => (
            <div className="admin-short-description-derived-line" key={`${line}-${index}`}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
      <div className="admin-short-description-custom-shell">
        <p className="admin-note admin-short-description-note">Additional lines</p>
        <div
          ref={editorRef}
          aria-label={label}
          aria-multiline="true"
          className={`admin-short-description-canvas${disabled ? ' admin-short-description-canvas--disabled' : ''}`.trim()}
          contentEditable={disabled ? 'false' : 'plaintext-only'}
          data-placeholder={placeholder}
          role="textbox"
          spellCheck
          suppressContentEditableWarning
          onBlur={() => syncValue({ cleanDom: true })}
          onDrop={handleDrop}
          onInput={() => syncValue()}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
    </div>
  )
}
