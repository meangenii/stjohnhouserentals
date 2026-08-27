import { useEffect, useLayoutEffect, useRef } from 'react'

function fitTextareaToContent(textarea) {
  if (!textarea) {
    return
  }

  textarea.style.height = 'auto'
  const borderHeight = textarea.offsetHeight - textarea.clientHeight
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`
}

export function AdminAutoResizeTextarea({ ariaLabel, className = '', disabled = false, onChange, placeholder = '', value = '' }) {
  const textareaRef = useRef(null)

  useLayoutEffect(() => {
    fitTextareaToContent(textareaRef.current)
  }, [value])

  useEffect(() => {
    const handleResize = () => fitTextareaToContent(textareaRef.current)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <textarea
      ref={textareaRef}
      aria-label={ariaLabel}
      className={`admin-auto-resize-textarea ${className}`.trim()}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      value={value}
      wrap="soft"
      onChange={(event) => {
        onChange(event.target.value)
        fitTextareaToContent(event.currentTarget)
      }}
    />
  )
}
