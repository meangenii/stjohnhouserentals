import { ChevronDown, FileDiff } from 'lucide-react'

function formatChangeText(change) {
  if (change.type === 'metadata') {
    return `${change.label}: "${change.before || 'Empty'}" to "${change.after || 'Empty'}"`
  }

  if (change.type === 'block-added') {
    return `Added ${change.label} at ${change.afterPath}`
  }

  if (change.type === 'block-removed') {
    return `Removed ${change.label} from ${change.beforePath}`
  }

  if (change.type === 'block-moved') {
    return `Moved ${change.label} from ${change.beforePath} to ${change.afterPath}`
  }

  if (change.type === 'block-type-changed') {
    return `Changed ${change.label} from ${change.before || 'unknown'} to ${change.after || 'unknown'}`
  }

  if (change.type === 'block-updated') {
    return `Updated ${change.label} at ${change.path}`
  }

  return `Updated ${change.label || 'page content'}`
}

function formatSummary(diff) {
  const summaryItems = [
    [diff.summary.metadata, 'metadata'],
    [diff.summary.added, 'added'],
    [diff.summary.removed, 'removed'],
    [diff.summary.moved, 'moved'],
    [diff.summary.updated, 'updated'],
    [diff.summary.typeChanged, 'type changed'],
    [diff.summary.content, 'content'],
  ]
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)

  return summaryItems.length > 0 ? summaryItems.join(', ') : 'No changes'
}

export function PageChangeSummaryPanel({ defaultOpen = false, diff, mode = 'draft', publication = null }) {
  if (!diff || diff.empty) {
    return null
  }

  const title =
    mode === 'publish' ? 'Publish Diff' : mode === 'conflict' ? 'Conflict Comparison' : mode === 'revision' ? 'Revision Comparison' : 'Draft Changes'
  const subtitle =
    mode === 'publish'
      ? `Review ${diff.totalChanges} saved change${diff.totalChanges === 1 ? '' : 's'} before publishing live.`
      : mode === 'conflict'
        ? `Your draft differs from the latest saved version by ${diff.totalChanges} change${diff.totalChanges === 1 ? '' : 's'}.`
        : mode === 'revision'
          ? `The current saved draft differs from this revision by ${diff.totalChanges} change${diff.totalChanges === 1 ? '' : 's'}.`
      : `Review ${diff.totalChanges} unsaved change${diff.totalChanges === 1 ? '' : 's'} before saving the draft.`
  const visibleChanges = diff.changes.slice(0, 8)
  const hiddenCount = Math.max(diff.changes.length - visibleChanges.length, 0)

  return (
    <section className={`admin-page-change-summary admin-page-change-summary--${mode}`} aria-label={title}>
      <details className="admin-page-review-details" open={defaultOpen || mode === 'conflict'}>
        <summary className="admin-page-change-summary-header">
          <FileDiff aria-hidden="true" className="admin-page-review-summary-icon" size={18} strokeWidth={2} />
          <div className="admin-page-review-summary-copy">
            <span>{title}</span>
            <strong className="admin-page-review-title">{formatSummary(diff)}</strong>
          </div>
          <span className="admin-page-review-count">{diff.totalChanges} changes</span>
          <ChevronDown aria-hidden="true" className="admin-page-review-chevron" size={18} strokeWidth={2} />
        </summary>
        <div className="admin-page-review-body">
          <div className="admin-page-change-summary-intro">
            <p>{subtitle}</p>
            {mode === 'publish' && publication?.savedAt ? <time>{new Date(publication.savedAt).toLocaleString()}</time> : null}
          </div>
          <ul>
            {visibleChanges.map((change, index) => (
              <li key={`${change.type}:${change.blockId ?? change.field ?? index}:${index}`}>{formatChangeText(change)}</li>
            ))}
            {hiddenCount > 0 ? <li>{hiddenCount} more change{hiddenCount === 1 ? '' : 's'}</li> : null}
          </ul>
        </div>
      </details>
    </section>
  )
}
