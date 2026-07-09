import { useEffect, useMemo, useRef, useState } from 'react'

export function AdminRichTextMenu({
  disabled = false,
  footer = null,
  inline = false,
  label,
  onBeforeOpen,
  onSelect,
  options = [],
  value,
}) {
  const shellRef = useRef(null)
  const [open, setOpen] = useState(false)
  const isOpen = open && !disabled
  const currentOption = useMemo(() => {
    const matchedOption = options.find((option) => option.value === value)

    if (matchedOption) {
      return matchedOption
    }

    if (value && value !== 'default') {
      return { label: value, value }
    }

    return options[0] ?? { label: '', value: '' }
  }, [options, value])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined
    }

    function handlePointerDown(event) {
      if (shellRef.current?.contains(event.target)) {
        return
      }

      setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleTriggerMouseDown(event) {
    event.preventDefault()
    event.stopPropagation()
    onBeforeOpen?.()
  }

  function handleTriggerClick(event) {
    event.preventDefault()
    event.stopPropagation()

    if (disabled) {
      return
    }

    setOpen((currentState) => !currentState)
  }

  function handleOptionMouseDown(event) {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleOptionClick(nextValue) {
    onSelect?.(nextValue)
    setOpen(false)
  }

  return (
    <div
      ref={shellRef}
      className={`admin-rich-text-menu-shell ${inline ? 'admin-rich-text-menu-shell--inline' : ''}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="admin-rich-text-menu-label">{label}</span>
      <button
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        className="admin-rich-text-menu-trigger"
        disabled={disabled}
        type="button"
        onClick={handleTriggerClick}
        onMouseDown={handleTriggerMouseDown}
      >
        <span>{currentOption.label}</span>
        <span aria-hidden="true" className="admin-rich-text-menu-caret">
          v
        </span>
      </button>
      {isOpen ? (
        <div className="admin-rich-text-menu-panel" role="listbox" aria-label={label}>
          {options.map((option) => {
            const active = option.value === value

            return (
              <button
                key={option.value}
                aria-selected={active ? 'true' : 'false'}
                className={`admin-rich-text-menu-option ${active ? 'admin-rich-text-menu-option--active' : ''}`.trim()}
                role="option"
                type="button"
                onClick={() => handleOptionClick(option.value)}
                onMouseDown={handleOptionMouseDown}
              >
                <span>{option.label}</span>
                {active ? (
                  <span aria-hidden="true" className="admin-rich-text-menu-check">
                    Current
                  </span>
                ) : null}
              </button>
            )
          })}
          {footer ? <div className="admin-rich-text-menu-footer">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
