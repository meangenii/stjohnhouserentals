import { FileDiff, History, ListChecks } from 'lucide-react'
import { EditorIconButton } from './EditorIconButton'

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function EditorReviewToolbar({
  activeView = '',
  changeCount = 0,
  changesAvailable = false,
  disabled = false,
  issueCount = 0,
  revisionsCount = 0,
  onViewChange,
}) {
  function toggleView(view) {
    onViewChange?.(activeView === view ? '' : view)
  }

  return (
    <div aria-label="Page review tools" className="admin-page-editor-review-toolbar" role="toolbar">
      <EditorIconButton
        aria-pressed={activeView === 'checks'}
        className={activeView === 'checks' ? 'editor-icon-button--active' : ''}
        disabled={disabled}
        icon={ListChecks}
        label={`Page checks: ${countLabel(issueCount, 'issue')}`}
        onClick={() => toggleView('checks')}
      />
      <EditorIconButton
        aria-pressed={activeView === 'changes'}
        className={activeView === 'changes' ? 'editor-icon-button--active' : ''}
        disabled={disabled || !changesAvailable}
        icon={FileDiff}
        label={changesAvailable ? `Page changes: ${countLabel(changeCount, 'change')}` : 'Page changes: no changes'}
        onClick={() => toggleView('changes')}
      />
      <EditorIconButton
        aria-pressed={activeView === 'revisions'}
        className={activeView === 'revisions' ? 'editor-icon-button--active' : ''}
        disabled={disabled}
        icon={History}
        label={`Revision history: ${countLabel(revisionsCount, 'revision')}`}
        onClick={() => toggleView('revisions')}
      />
    </div>
  )
}
