import { Layers3, LayoutPanelTop, SlidersHorizontal, X } from 'lucide-react'
import { EditorIconButton } from './EditorIconButton'

const EDITOR_CONTEXT_VIEWS = [
  { icon: Layers3, key: 'layers', label: 'Layers' },
  { icon: LayoutPanelTop, key: 'layout', label: 'Layout' },
  { icon: SlidersHorizontal, key: 'inspector', label: 'Inspector' },
]

export function EditorContextToolbar({ activeView = '', onViewChange }) {
  return (
    <div aria-label="Editor panels" className="admin-page-editor-panel-toolbar" role="toolbar">
      {EDITOR_CONTEXT_VIEWS.map((view) => (
        <EditorIconButton
          aria-pressed={activeView === view.key}
          className={activeView === view.key ? 'editor-icon-button--active' : ''}
          icon={view.icon}
          key={view.key}
          label={`Open ${view.label}`}
          onClick={() => onViewChange?.(activeView === view.key ? '' : view.key)}
        />
      ))}
    </div>
  )
}

export function EditorContextPanel({ activeView = '', children, onViewChange }) {
  const activeIndex = EDITOR_CONTEXT_VIEWS.findIndex((view) => view.key === activeView)

  if (activeIndex === -1) {
    return null
  }

  function focusTabAt(index) {
    const nextView = EDITOR_CONTEXT_VIEWS[index]

    if (!nextView) {
      return
    }

    onViewChange?.(nextView.key)
    window.requestAnimationFrame(() => {
      document.getElementById(`editor-context-tab-${nextView.key}`)?.focus()
    })
  }

  function handleTabKeyDown(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTabAt((activeIndex + 1) % EDITOR_CONTEXT_VIEWS.length)
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTabAt((activeIndex - 1 + EDITOR_CONTEXT_VIEWS.length) % EDITOR_CONTEXT_VIEWS.length)
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusTabAt(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusTabAt(EDITOR_CONTEXT_VIEWS.length - 1)
    }
  }

  return (
    <section aria-label="Editor context" className="admin-page-editor-context">
      <div className="admin-page-editor-context-header">
        <div aria-label="Editor context views" className="admin-page-editor-context-tabs" role="tablist">
          {EDITOR_CONTEXT_VIEWS.map((view) => {
            const selected = activeView === view.key
            const Icon = view.icon

            return (
              <button
                aria-controls="editor-context-panel"
                aria-selected={selected}
                className={`admin-page-editor-context-tab${selected ? ' admin-page-editor-context-tab--active' : ''}`}
                id={`editor-context-tab-${view.key}`}
                key={view.key}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
                onClick={() => onViewChange?.(view.key)}
                onKeyDown={handleTabKeyDown}
              >
                <Icon aria-hidden="true" size={15} strokeWidth={2} />
                <span>{view.label}</span>
              </button>
            )
          })}
        </div>
        <EditorIconButton className="admin-page-editor-context-close" icon={X} label="Close editor panel" onClick={() => onViewChange?.('')} />
      </div>
      <div
        className="admin-page-editor-context-body"
        id="editor-context-panel"
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`editor-context-tab-${activeView}`}
      >
        {children}
      </div>
    </section>
  )
}
