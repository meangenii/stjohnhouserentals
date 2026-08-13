import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Monitor, Smartphone, Tablet } from 'lucide-react'

const PREVIEW_DEVICE_OPTIONS = [
  { icon: Monitor, label: 'Desktop', value: 'desktop' },
  { icon: Tablet, label: 'Tablet', value: 'tablet' },
  { icon: Smartphone, label: 'Mobile', value: 'mobile' },
]

export function AdminPreviewModeSplitButton({ device = 'desktop', mode = 'edit', onDeviceChange, onModeChange }) {
  const shellRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedDevice = useMemo(
    () => PREVIEW_DEVICE_OPTIONS.find((option) => option.value === device) ?? PREVIEW_DEVICE_OPTIONS[0],
    [device],
  )
  const SelectedDeviceIcon = selectedDevice.icon

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
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
  }, [open])

  function handleDeviceSelect(nextDevice) {
    onDeviceChange?.(nextDevice)
    onModeChange?.('preview')
    setOpen(false)
  }

  return (
    <div className="admin-preview-mode-split" ref={shellRef}>
      <button
        aria-pressed={mode === 'edit'}
        className={`admin-preview-mode-split-button admin-preview-mode-split-button--edit${
          mode === 'edit' ? ' admin-preview-mode-split-button--active' : ''
        }`}
        type="button"
        onClick={() => onModeChange?.('edit')}
      >
        Edit
      </button>
      <button
        aria-pressed={mode === 'preview'}
        className={`admin-preview-mode-split-button admin-preview-mode-split-button--preview${
          mode === 'preview' ? ' admin-preview-mode-split-button--active' : ''
        }`}
        type="button"
        onClick={() => onModeChange?.('preview')}
      >
        Preview
      </button>
      <button
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="menu"
        aria-label={`Preview device: ${selectedDevice.label}`}
        className="admin-preview-mode-split-device"
        title={`Preview device: ${selectedDevice.label}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <SelectedDeviceIcon aria-hidden="true" size={18} strokeWidth={2} />
        <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
      </button>
      {open ? (
        <div className="admin-preview-mode-menu" role="menu" aria-label="Preview device">
          {PREVIEW_DEVICE_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = option.value === selectedDevice.value

            return (
              <button
                className={`admin-preview-mode-menu-option${selected ? ' admin-preview-mode-menu-option--selected' : ''}`}
                key={option.value}
                role="menuitemradio"
                aria-checked={selected ? 'true' : 'false'}
                type="button"
                onClick={() => handleDeviceSelect(option.value)}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={2} />
                <span>{option.label}</span>
                {selected ? <Check aria-hidden="true" className="admin-preview-mode-menu-check" size={16} strokeWidth={2.4} /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
