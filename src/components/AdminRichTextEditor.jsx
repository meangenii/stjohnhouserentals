import { useEffect, useRef, useState } from 'react'

function ToolbarButton({ children, disabled, onClick }) {
  return (
    <button className="button-link button-link--ghost admin-rich-text-button" disabled={disabled} type="button" onClick={onClick}>
      {children}
    </button>
  )
}

export function AdminRichTextEditor({ disabled = false, label, onChange, value }) {
  const editorRef = useRef(null)
  const [mode, setMode] = useState('visual')

  useEffect(() => {
    if (mode !== 'visual' || !editorRef.current) {
      return
    }

    if (editorRef.current.innerHTML !== String(value ?? '')) {
      editorRef.current.innerHTML = String(value ?? '')
    }
  }, [mode, value])

  function syncValue() {
    if (!editorRef.current) {
      return
    }

    onChange(editorRef.current.innerHTML)
  }

  function applyCommand(command, commandValue = null) {
    if (disabled || !editorRef.current) {
      return
    }

    editorRef.current.focus()
    document.execCommand(command, false, commandValue)
    syncValue()
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

  return (
    <div className="admin-rich-text-editor">
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
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('formatBlock', '<p>')}>
              Paragraph
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('formatBlock', '<h2>')}>
              Heading 2
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('formatBlock', '<h3>')}>
              Heading 3
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('bold')}>
              Bold
            </ToolbarButton>
            <ToolbarButton disabled={disabled} onClick={() => applyCommand('italic')}>
              Italic
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

          <div
            ref={editorRef}
            aria-label={label}
            className={`admin-rich-text-canvas ${disabled ? 'admin-rich-text-canvas--disabled' : ''}`.trim()}
            contentEditable={!disabled}
            data-placeholder="Start typing the page content here."
            suppressContentEditableWarning
            onBlur={syncValue}
            onInput={syncValue}
          />
        </>
      ) : (
        <label className="admin-field admin-field--wide">
          <span>HTML Source</span>
          <textarea disabled={disabled} rows="14" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
        </label>
      )}
    </div>
  )
}
