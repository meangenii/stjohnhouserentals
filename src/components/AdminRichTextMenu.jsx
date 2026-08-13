import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_VIEWPORT_MARGIN = 8
const MENU_TRIGGER_GAP = 6
const MENU_DEFAULT_MIN_WIDTH = 160
const MENU_COLOR_MIN_WIDTH = 208

function clampNumber(value, min, max) {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function normalizeMenuKind(label = '') {
  const normalizedLabel = String(label ?? '').trim().toLowerCase()

  if (normalizedLabel.includes('color')) {
    return 'color'
  }

  if (normalizedLabel.includes('size')) {
    return 'size'
  }

  if (normalizedLabel.includes('style') || normalizedLabel.includes('tag')) {
    return 'style'
  }

  if (normalizedLabel.includes('horizontal')) {
    return 'align-horizontal'
  }

  if (normalizedLabel.includes('vertical')) {
    return 'align-vertical'
  }

  return 'default'
}

function normalizeStylePreviewClass(value = '') {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getColorSwatchValue(option) {
  const value = String(option?.swatch || option?.value || '').trim()
  return value && value !== 'default' ? value : ''
}

function RichTextMenuAffordance({ kind, option }) {
  const colorValue = kind === 'color' ? getColorSwatchValue(option) : ''
  const stylePreviewClass = kind === 'style' ? normalizeStylePreviewClass(option?.value) : ''

  if (kind === 'color') {
    return (
      <span
        aria-hidden="true"
        className={`admin-rich-text-menu-affordance admin-rich-text-menu-affordance--color${
          colorValue ? '' : ' admin-rich-text-menu-affordance--default-color'
        }`.trim()}
        style={colorValue ? { backgroundColor: colorValue } : undefined}
      />
    )
  }

  if (kind === 'style') {
    return (
      <span
        aria-hidden="true"
        className={`admin-rich-text-menu-affordance admin-rich-text-menu-affordance--style ${
          stylePreviewClass ? `admin-rich-text-menu-affordance--${stylePreviewClass}` : ''
        }`.trim()}
      >
        T
      </span>
    )
  }

  if (kind === 'size') {
    return (
      <span aria-hidden="true" className="admin-rich-text-menu-affordance admin-rich-text-menu-affordance--size">
        A
      </span>
    )
  }

  if (kind === 'align-horizontal' || kind === 'align-vertical') {
    return (
      <span
        aria-hidden="true"
        className={`admin-rich-text-menu-affordance admin-rich-text-menu-affordance--${kind}`}
      >
        <span />
        <span />
        <span />
      </span>
    )
  }

  return null
}

export function AdminRichTextMenu({
  currentLabel = '',
  disabled = false,
  footer = null,
  inline = false,
  label,
  onBeforeOpen,
  onSelect,
  options = [],
  showLabel = true,
  value,
}) {
  const shellRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [panelLayout, setPanelLayout] = useState(() => ({
    left: MENU_VIEWPORT_MARGIN,
    maxHeight: 320,
    minWidth: MENU_DEFAULT_MIN_WIDTH,
    top: MENU_VIEWPORT_MARGIN,
  }))
  const isOpen = open && !disabled
  const menuKind = normalizeMenuKind(label)
  const currentOption = useMemo(() => {
    const normalizedCurrentLabel = String(currentLabel ?? '').trim()

    if (normalizedCurrentLabel) {
      return { label: normalizedCurrentLabel, value }
    }

    const matchedOption = options.find((option) => option.value === value)

    if (matchedOption) {
      return matchedOption
    }

    if (value && value !== 'default') {
      return { label: value, value }
    }

    return options[0] ?? { label: '', value: '' }
  }, [currentLabel, options, value])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined
    }

    function handlePointerDown(event) {
      if (shellRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) {
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

  useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return undefined
    }

    let animationFrameId = 0

    function updatePanelLayout() {
      const trigger = triggerRef.current

      if (!trigger) {
        return
      }

      const triggerBounds = trigger.getBoundingClientRect()
      const panelBounds = panelRef.current?.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const availableWidth = Math.max(0, viewportWidth - MENU_VIEWPORT_MARGIN * 2)
      const preferredMinWidth = menuKind === 'color' ? MENU_COLOR_MIN_WIDTH : MENU_DEFAULT_MIN_WIDTH
      const minWidth = Math.min(Math.max(triggerBounds.width, preferredMinWidth), availableWidth)
      const measuredWidth = Math.min(panelBounds?.width || minWidth, availableWidth)
      const belowTop = triggerBounds.bottom + MENU_TRIGGER_GAP
      const belowSpace = Math.max(0, viewportHeight - belowTop - MENU_VIEWPORT_MARGIN)
      const aboveSpace = Math.max(0, triggerBounds.top - MENU_TRIGGER_GAP - MENU_VIEWPORT_MARGIN)
      const measuredHeight = panelBounds?.height || 0
      const shouldOpenAbove = belowSpace < Math.min(measuredHeight || 260, 220) && aboveSpace > belowSpace
      const selectedSpace = shouldOpenAbove ? aboveSpace : belowSpace
      const maxHeight = Math.max(64, Math.min(selectedSpace, viewportHeight - MENU_VIEWPORT_MARGIN * 2))
      const renderedHeight = Math.min(measuredHeight || maxHeight, maxHeight)
      const left = clampNumber(triggerBounds.left, MENU_VIEWPORT_MARGIN, viewportWidth - measuredWidth - MENU_VIEWPORT_MARGIN)
      const maxTop = viewportHeight - renderedHeight - MENU_VIEWPORT_MARGIN
      const top = shouldOpenAbove
        ? clampNumber(triggerBounds.top - MENU_TRIGGER_GAP - renderedHeight, MENU_VIEWPORT_MARGIN, maxTop)
        : clampNumber(belowTop, MENU_VIEWPORT_MARGIN, maxTop)

      setPanelLayout((currentLayout) => {
        const nextLayout = {
          left,
          maxHeight,
          minWidth,
          top,
        }

        if (
          Math.round(currentLayout.left) === Math.round(nextLayout.left) &&
          Math.round(currentLayout.maxHeight) === Math.round(nextLayout.maxHeight) &&
          Math.round(currentLayout.minWidth) === Math.round(nextLayout.minWidth) &&
          Math.round(currentLayout.top) === Math.round(nextLayout.top)
        ) {
          return currentLayout
        }

        return nextLayout
      })
    }

    function schedulePanelLayoutUpdate() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(updatePanelLayout)
    }

    schedulePanelLayoutUpdate()
    window.addEventListener('resize', schedulePanelLayoutUpdate)
    window.addEventListener('scroll', schedulePanelLayoutUpdate, true)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      window.removeEventListener('resize', schedulePanelLayoutUpdate)
      window.removeEventListener('scroll', schedulePanelLayoutUpdate, true)
    }
  }, [isOpen, menuKind])

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

  const menuPanel =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            className={`admin-rich-text-menu-panel admin-rich-text-menu-panel--portal admin-rich-text-menu-panel--${menuKind}`}
            role="listbox"
            aria-label={label}
            style={{
              left: `${panelLayout.left}px`,
              maxHeight: `${panelLayout.maxHeight}px`,
              minWidth: `${panelLayout.minWidth}px`,
              top: `${panelLayout.top}px`,
            }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const active = option.value === value
              const optionLabel = active && currentOption.label ? currentOption.label : option.label

              return (
                <button
                  key={option.value}
                  aria-selected={active ? 'true' : 'false'}
                  className={`admin-rich-text-menu-option admin-rich-text-menu-option--${menuKind} ${
                    active ? 'admin-rich-text-menu-option--active' : ''
                  }`.trim()}
                  role="option"
                  type="button"
                  onClick={() => handleOptionClick(option.value)}
                  onMouseDown={handleOptionMouseDown}
                >
                  <span className="admin-rich-text-menu-option-main">
                    <RichTextMenuAffordance kind={menuKind} option={option} />
                    <span>{optionLabel}</span>
                  </span>
                  {active ? (
                    <span aria-hidden="true" className="admin-rich-text-menu-check">
                      Current
                    </span>
                  ) : null}
                </button>
              )
            })}
            {footer ? <div className="admin-rich-text-menu-footer">{footer}</div> : null}
          </div>,
          document.body,
        )
      : null

  return (
    <div
      ref={shellRef}
      className={`admin-rich-text-menu-shell admin-rich-text-menu-shell--${menuKind} ${
        inline ? 'admin-rich-text-menu-shell--inline' : ''
      }`.trim()}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {showLabel ? <span className="admin-rich-text-menu-label">{label}</span> : null}
      <button
        aria-expanded={isOpen ? 'true' : 'false'}
        aria-haspopup="listbox"
        aria-label={label}
        className="admin-rich-text-menu-trigger"
        disabled={disabled}
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        onMouseDown={handleTriggerMouseDown}
      >
        <span className="admin-rich-text-menu-trigger-main">
          <RichTextMenuAffordance kind={menuKind} option={currentOption} />
          <span className="admin-rich-text-menu-trigger-label">{currentOption.label}</span>
        </span>
        <span aria-hidden="true" className="admin-rich-text-menu-caret">
          v
        </span>
      </button>
      {menuPanel}
    </div>
  )
}
