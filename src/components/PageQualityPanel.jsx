import { useState } from 'react'
import { CheckCircle2, ChevronDown, CircleAlert, CircleX } from 'lucide-react'
import { summarizeBlockPageQuality } from '../lib/blockPageValidation'
import { getPageValidationIssues } from '../lib/pageValidationIssues'

export function PageQualityPanel({ defaultOpen = false, onSelectIssue, validation }) {
  const summary = summarizeBlockPageQuality(validation)
  const [open, setOpen] = useState(defaultOpen)

  if (!summary) {
    return null
  }

  const issues = getPageValidationIssues(validation).slice(0, 6)
  const issueCount = (validation.errors?.length ?? 0) + (validation.warnings?.length ?? 0)
  const StatusIcon = summary.tone === 'error' ? CircleX : summary.tone === 'warning' ? CircleAlert : CheckCircle2

  return (
    <details
      className={`admin-page-quality admin-page-quality--${summary.tone}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="admin-page-quality-header">
        <StatusIcon aria-hidden="true" className="admin-page-review-summary-icon" size={18} strokeWidth={2} />
        <div className="admin-page-review-summary-copy">
          <strong className="admin-page-review-title">{summary.title}</strong>
          <p>{summary.message}</p>
        </div>
        <span className="admin-page-quality-count">
          {issueCount > 0 ? `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}` : `${validation.blockCount ?? 0} blocks`}
        </span>
        <ChevronDown aria-hidden="true" className="admin-page-review-chevron" size={18} strokeWidth={2} />
      </summary>

      {issues.length > 0 ? (
        <div className="admin-page-review-body">
          <ul className="admin-page-quality-list">
            {issues.map((issue) => (
              <li key={`${issue.code}:${issue.path}:${issue.message}`}>
                <button className="admin-page-quality-issue" type="button" onClick={() => onSelectIssue?.(issue)}>
                  <span className="admin-page-quality-path">{issue.path}</span>
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  )
}
