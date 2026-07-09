import { useState } from 'react'

function normalizeTypedFontSize(value) {
  const trimmedValue = String(value ?? '').trim()

  if (!trimmedValue) {
    return ''
  }

  return /^\d+(?:\.\d+)?$/.test(trimmedValue) ? `${trimmedValue}px` : trimmedValue
}

export function RichTextFontSizeInput({ disabled = false, onApply }) {
  const [draft, setDraft] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    const normalizedDraft = normalizeTypedFontSize(draft)

    if (!normalizedDraft) {
      return
    }

    onApply(normalizedDraft)
    setDraft('')
  }

  return (
    <form className="admin-rich-text-menu-custom-size" onSubmit={handleSubmit}>
      <input
        aria-label="Custom font size"
        disabled={disabled}
        placeholder="e.g. 20px or 1.4rem"
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button className="button-link button-link--ghost admin-rich-text-menu-custom-size-apply" disabled={disabled} type="submit">
        Apply
      </button>
    </form>
  )
}
