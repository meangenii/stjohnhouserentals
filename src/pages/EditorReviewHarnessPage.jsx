import { useState } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { EditorIconButton } from '../components/EditorIconButton'
import { EditorReviewToolbar } from '../components/EditorReviewToolbar'
import { PageChangeSummaryPanel } from '../components/PageChangeSummaryPanel'
import { PageQualityPanel } from '../components/PageQualityPanel'
import { PageRevisionHistoryPanel } from '../components/PageRevisionHistoryPanel'
import '../styles/editorReviewHarness.css'

const REVIEW_VALIDATION = {
  applies: true,
  blockCount: 12,
  errors: [],
  warnings: [
    {
      code: 'missing-image-alt',
      message: 'Add descriptive alternative text or mark this image decorative.',
      path: 'blocks[1].image.alt',
      pathSegments: ['blocks', 1, 'image', 'alt'],
    },
    {
      code: 'empty-link',
      message: 'Choose a destination for this call-to-action link.',
      path: 'blocks[4].link',
      pathSegments: ['blocks', 4, 'link'],
    },
  ],
}

const REVIEW_DIFF = {
  changes: [
    { afterPath: 'blocks[2]', blockId: 'features', label: 'Feature Grid', type: 'block-added' },
    { blockId: 'hero', label: 'Hero Banner', path: 'blocks[0]', type: 'block-updated' },
    { after: '/new-page', before: '/draft-page', field: 'path', label: 'Page URL', type: 'metadata' },
  ],
  empty: false,
  summary: {
    added: 1,
    content: 0,
    metadata: 1,
    moved: 0,
    removed: 0,
    typeChanged: 0,
    updated: 1,
  },
  totalChanges: 3,
}

const REVIEW_REVISIONS = Array.from({ length: 40 }, (_, index) => ({
  action: index % 5 === 0 ? 'publish' : 'save',
  actor: 'editor@example.com',
  blockCount: 12,
  createdAt: Date.UTC(2026, 7, 3, 18, 0) - index * 3600000,
  id: `revision-${index + 1}`,
  pageKey: 'review-harness',
  pagePath: '/review-harness',
  pageTitle: 'Review Harness',
}))

export function EditorReviewHarnessPage() {
  const [activeView, setActiveView] = useState('')

  return (
    <main className="editor-review-harness">
      <header>
        <span>Editor test surface</span>
        <h1>Review tools</h1>
      </header>
      <div className="admin-page-editor-heading-toolbar">
        <h2>Page Editor</h2>
        <label className="admin-field admin-selector-field">
          <span className="visually-hidden">Page</span>
          <select aria-label="Page" defaultValue="test">
            <option value="test">test | /test - editing: editor@example.com</option>
          </select>
        </label>
        <div className="admin-page-editor-heading-actions">
          <EditorIconButton icon={RefreshCw} label="Refresh page" />
          <EditorIconButton icon={Trash2} label="Delete page" tone="danger" />
          <EditorIconButton icon={Plus} label="New page" />
        </div>
      </div>
      <div className="editor-review-harness-tools">
        <EditorReviewToolbar
          activeView={activeView}
          changeCount={REVIEW_DIFF.totalChanges}
          changesAvailable
          issueCount={REVIEW_VALIDATION.warnings.length}
          revisionsCount={REVIEW_REVISIONS.length}
          onViewChange={setActiveView}
        />
        {activeView ? (
          <div className="admin-page-editor-review-view">
            {activeView === 'checks' ? <PageQualityPanel defaultOpen validation={REVIEW_VALIDATION} /> : null}
            {activeView === 'changes' ? <PageChangeSummaryPanel defaultOpen diff={REVIEW_DIFF} /> : null}
            {activeView === 'revisions' ? (
              <PageRevisionHistoryPanel defaultOpen revisions={REVIEW_REVISIONS} status="ready" />
            ) : null}
          </div>
        ) : null}
      </div>
      <section className="editor-review-harness-canvas" aria-label="Canvas placeholder">
        <h2>Canvas remains immediately available</h2>
      </section>
    </main>
  )
}
