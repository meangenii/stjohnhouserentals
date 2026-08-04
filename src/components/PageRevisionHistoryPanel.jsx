import { useState } from 'react'
import { ChevronDown, Eye, History, RefreshCw, RotateCcw, X } from 'lucide-react'
import { EditorIconButton } from './EditorIconButton'

function formatRevisionAction(action = '') {
  if (action === 'delete') {
    return 'Deleted'
  }

  if (action === 'publish') {
    return 'Published'
  }

  if (action === 'reset') {
    return 'Reset'
  }

  if (action === 'restore') {
    return 'Restored'
  }

  if (action === 'undelete') {
    return 'Recovered'
  }

  return 'Saved'
}

function formatRevisionTimestamp(value) {
  const timestamp = Number(value)

  if (!Number.isFinite(timestamp)) {
    return 'Timestamp pending'
  }

  const date = new Date(timestamp)

  if (Number.isNaN(date.getTime())) {
    return 'Timestamp pending'
  }

  return date.toLocaleString()
}

export function PageRevisionHistoryPanel({
  defaultOpen = false,
  disabled = false,
  message = '',
  previewRevisionId = '',
  revisions = [],
  restoringRevisionId = '',
  status = 'idle',
  onClosePreview,
  onPreview,
  onRefresh,
  onRestore,
}) {
  const isBusy = status === 'loading' || status === 'previewing' || status === 'restoring'
  const visibleRevisions = revisions
  const [userOpen, setUserOpen] = useState(defaultOpen)
  const forcedOpen = Boolean(previewRevisionId || (message && status === 'error'))
  const open = userOpen || forcedOpen

  return (
    <section className="admin-page-revisions" aria-label="Page revision history">
      <details
        className="admin-page-review-details"
        open={open}
        onToggle={(event) => {
          if (!forcedOpen) {
            setUserOpen(event.currentTarget.open)
          }
        }}
      >
        <summary className="admin-page-revisions-header">
          <History aria-hidden="true" className="admin-page-review-summary-icon" size={18} strokeWidth={2} />
          <div className="admin-page-review-summary-copy">
            <span>Revision history</span>
            <strong className="admin-page-review-title">
              {revisions.length ? `${revisions.length} saved revision${revisions.length === 1 ? '' : 's'}` : 'No saved revisions'}
            </strong>
          </div>
          <span className="admin-page-review-count">{revisions.length}</span>
          <ChevronDown aria-hidden="true" className="admin-page-review-chevron" size={18} strokeWidth={2} />
        </summary>

        <div className="admin-page-review-body admin-page-revisions-body">
          <div className="admin-page-review-actions">
            <EditorIconButton
              disabled={isBusy}
              icon={RefreshCw}
              label={status === 'loading' ? 'Loading revisions' : 'Refresh revisions'}
              onClick={onRefresh}
            />
          </div>

          {previewRevisionId ? (
            <div className="admin-page-revision-preview-status">
              <span>Previewing a saved revision in the Canvas.</span>
              <EditorIconButton icon={X} label="Close preview" onClick={onClosePreview} />
            </div>
          ) : null}

          {message ? <p className={`admin-feedback admin-feedback--${status === 'error' ? 'error' : 'idle'}`}>{message}</p> : null}

          {visibleRevisions.length ? (
            <ol className="admin-page-revisions-list">
              {visibleRevisions.map((revision) => {
                const isRestoring = status === 'restoring' && restoringRevisionId === revision.id

                return (
                  <li key={revision.id} className="admin-page-revision">
                    <div className="admin-page-revision-main">
                      <strong>{formatRevisionAction(revision.action)}</strong>
                      <time>{formatRevisionTimestamp(revision.createdAt)}</time>
                      <span>{revision.actor || 'admin'}</span>
                    </div>
                    <div className="admin-page-revision-meta">
                      <span>{revision.pageTitle || revision.pageKey || 'Untitled page'}</span>
                      {revision.pagePath ? <span>{revision.pagePath}</span> : null}
                      <span>{revision.blockCount} block{revision.blockCount === 1 ? '' : 's'}</span>
                      {revision.restoredFrom ? <span>From {revision.restoredFrom}</span> : null}
                    </div>
                    <div className="admin-page-revision-actions">
                      <EditorIconButton
                        disabled={isBusy}
                        icon={Eye}
                        label={status === 'previewing' && previewRevisionId === revision.id ? 'Loading preview' : 'Preview'}
                        onClick={() => onPreview(revision)}
                      />
                      <EditorIconButton
                        disabled={disabled || isBusy}
                        icon={RotateCcw}
                        label={isRestoring ? 'Restoring revision' : 'Restore'}
                        onClick={() => onRestore(revision)}
                      />
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : status === 'loading' ? (
            <p className="admin-empty">Loading revisions...</p>
          ) : (
            <p className="admin-empty">No revisions yet.</p>
          )}
        </div>
      </details>
    </section>
  )
}
