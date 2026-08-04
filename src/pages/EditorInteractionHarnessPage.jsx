import { useRef, useState } from 'react'
import { AdminPageEditorCanvas, AdminPagePreview } from '../components/AdminPagePreview'
import { BlockInspectorPanel } from '../components/BlockInspectorPanel'
import { BlockLayoutOutline, BlockOutline } from '../components/BlockOutline'
import { EditorContextPanel, EditorContextToolbar } from '../components/EditorContextPanel'
import { validateEditorBlockPageDraft } from '../lib/blockPageValidation'
import { collectBlockOutlineEntries } from '../lib/blockTree'
import {
  getPageEditorHistoryStatus,
  recordPageEditorHistory,
  redoPageEditorHistory,
  resetPageEditorHistory,
  undoPageEditorHistory,
} from '../lib/pageEditorHistory'
import { updateValueAtPath } from '../lib/inlinePageEditor'
import '../styles/editorInteractionHarness.css'

const HARNESS_PAGE_KEY = 'editorInteractionFixture'
const HARNESS_STORAGE_KEY = 'genericcms:editor-interaction-fixture'
const HARNESS_SITE_SHELL = Object.freeze({ theme: {} })
const EMPTY_LAYOUT_METRICS = Object.freeze({ bySelectionId: {}, entries: [] })

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function createStarterPage() {
  return {
    blocks: [
      {
        action: { backgroundColor: '', label: 'Contact us', path: '/contact-us' },
        id: 'fixture-hero',
        image: { kind: 'image' },
        lead: 'A deterministic page used only by the browser interaction test.',
        title: 'Editor interaction fixture',
        type: 'hero',
        version: 1,
      },
      {
        html: '<p>Fixture body content.</p>',
        id: 'fixture-rich-text',
        type: 'rich-text',
        version: 1,
      },
    ],
    contentModel: 'block-page',
    group: 'custom',
    key: HARNESS_PAGE_KEY,
    metaDescription: 'A development-only page used to verify the professional page editor interaction contract.',
    navLabel: 'Editor Fixture',
    path: '/editor-interaction-fixture',
    routeAliases: [],
    source: 'structured',
    title: 'Editor Interaction Fixture',
  }
}

function createBlankPage() {
  return {
    ...createStarterPage(),
    blocks: [],
    metaDescription: '',
    navLabel: 'Untitled Page',
    path: '/untitled-page',
    title: 'Untitled Page',
  }
}

function readSavedPage() {
  try {
    const savedPage = window.sessionStorage.getItem(HARNESS_STORAGE_KEY)
    return savedPage ? JSON.parse(savedPage) : null
  } catch {
    return null
  }
}

function createInitialPage() {
  return readSavedPage() ?? createStarterPage()
}

export function EditorInteractionHarnessPage() {
  const [page, setPage] = useState(createInitialPage)
  const pageRef = useRef(page)
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const [contextView, setContextView] = useState('')
  const [layoutMetrics, setLayoutMetrics] = useState(EMPTY_LAYOUT_METRICS)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [history, setHistory] = useState(() => resetPageEditorHistory(HARNESS_PAGE_KEY))
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(readSavedPage() ?? page))
  const [status, setStatus] = useState('Ready')
  const validation = validateEditorBlockPageDraft(page)
  const historyStatus = getPageEditorHistoryStatus(history, HARNESS_PAGE_KEY)
  const blockCount = collectBlockOutlineEntries(page.blocks).filter((entry) => entry.kind === 'block').length
  const dirty = JSON.stringify(page) !== savedSnapshot

  function applyDraftChange(nextDraftOrUpdater) {
    const previousDraft = pageRef.current
    const nextDraft = typeof nextDraftOrUpdater === 'function' ? nextDraftOrUpdater(previousDraft) : nextDraftOrUpdater

    setHistory((current) =>
      recordPageEditorHistory(current, {
        activeKey: HARNESS_PAGE_KEY,
        nextDraft,
        previousDraft,
      }),
    )
    pageRef.current = nextDraft
    setPage(nextDraft)
    setStatus('Unsaved changes')
  }

  function updateDraftPath(path, nextValue) {
    applyDraftChange((currentDraft) => updateValueAtPath(currentDraft, path, nextValue))
  }

  function handleNewPage() {
    applyDraftChange(createBlankPage())
    setPreviewMode(false)
    setSelectedBlockId('')
    setContextView('')
    setLayoutMetrics(EMPTY_LAYOUT_METRICS)
    setStatus('New unsaved page')
  }

  function handleSave() {
    const snapshot = JSON.stringify(pageRef.current)
    window.sessionStorage.setItem(HARNESS_STORAGE_KEY, snapshot)
    setSavedSnapshot(snapshot)
    setStatus('Saved for this test session')
  }

  function handleReloadSaved() {
    const savedPage = readSavedPage()

    if (!savedPage) {
      setStatus('No saved fixture')
      return
    }

    const nextPage = cloneValue(savedPage)
    pageRef.current = nextPage
    setPage(nextPage)
    setHistory(resetPageEditorHistory(HARNESS_PAGE_KEY))
    setPreviewMode(false)
    setSelectedBlockId('')
    setContextView('')
    setLayoutMetrics(EMPTY_LAYOUT_METRICS)
    setSavedSnapshot(JSON.stringify(nextPage))
    setStatus('Reloaded saved fixture')
  }

  function applyHistoryResult(result, message) {
    if (!result.changed) {
      return
    }

    pageRef.current = result.draft
    setPage(result.draft)
    setHistory(result.history)
    setSelectedBlockId('')
    setContextView('')
    setLayoutMetrics(EMPTY_LAYOUT_METRICS)
    setStatus(message)
  }

  function handleSelectionChange(selectionId) {
    setSelectedBlockId(selectionId)
    setContextView((currentView) => (selectionId ? (currentView === 'layers' ? 'inspector' : currentView) : ''))
  }

  function openPageSettings() {
    setSelectedBlockId('')
    setContextView('inspector')
  }

  function handleUndo() {
    applyHistoryResult(
      undoPageEditorHistory(history, {
        activeKey: HARNESS_PAGE_KEY,
        currentDraft: pageRef.current,
      }),
      'Undid the last edit',
    )
  }

  function handleRedo() {
    applyHistoryResult(
      redoPageEditorHistory(history, {
        activeKey: HARNESS_PAGE_KEY,
        currentDraft: pageRef.current,
      }),
      'Redid the last edit',
    )
  }

  return (
    <main className="editor-interaction-harness">
      <header className="editor-interaction-harness-header">
        <div>
          <span>Development fixture</span>
          <h1>Page editor interaction harness</h1>
        </div>
        <div className="editor-interaction-harness-actions" aria-label="Fixture commands" role="group">
          <button className="button-link button-link--ghost admin-action" type="button" onClick={handleNewPage}>
            New page
          </button>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={openPageSettings}>
            Page settings
          </button>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={() => setPreviewMode((current) => !current)}>
            {previewMode ? 'Edit' : 'Preview'}
          </button>
          <button className="button-link button-link--ghost admin-action" disabled={!historyStatus.canUndo} type="button" onClick={handleUndo}>
            Undo
          </button>
          <button className="button-link button-link--ghost admin-action" disabled={!historyStatus.canRedo} type="button" onClick={handleRedo}>
            Redo
          </button>
          <button className="button-link button-link--primary admin-submit" disabled={!dirty} type="button" onClick={handleSave}>
            Save fixture
          </button>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={handleReloadSaved}>
            Reload saved
          </button>
        </div>
      </header>

      <div className="editor-interaction-harness-devices" aria-label="Preview device" role="group">
        {['desktop', 'tablet', 'mobile'].map((device) => (
          <button
            aria-pressed={previewDevice === device}
            className={`button-link admin-action ${previewDevice === device ? 'button-link--secondary' : 'button-link--ghost'}`}
            key={device}
            type="button"
            onClick={() => setPreviewDevice(device)}
          >
            {device[0].toUpperCase() + device.slice(1)}
          </button>
        ))}
      </div>

      <div className="editor-interaction-harness-status" role="status">
        <span data-testid="fixture-status">{status}</span>
        <span><strong data-testid="fixture-block-count">{blockCount}</strong> blocks</span>
        <span>{validation.errors.length} errors</span>
        <span>{validation.warnings.length} warnings</span>
        <span data-testid="fixture-dirty-state">{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>

      {previewMode ? (
        <div className="admin-page-editor-shell admin-page-editor-shell--single">
          <div className="admin-page-editor-canvas">
            <AdminPagePreview device={previewDevice} page={page} pageKey={HARNESS_PAGE_KEY} siteShell={HARNESS_SITE_SHELL} />
          </div>
        </div>
      ) : (
        <>
          <EditorContextToolbar activeView={contextView} onViewChange={setContextView} />
          <div className="admin-page-editor-shell">
            <EditorContextPanel activeView={contextView} onViewChange={setContextView}>
              <div className="admin-page-editor-layers-rail admin-page-editor-rail--active" hidden={contextView !== 'layers'}>
                <BlockOutline
                  blocks={page.blocks}
                  headingLevel={2}
                  selectedBlockId={selectedBlockId}
                  validation={validation}
                  onBlocksChange={(nextBlocks) => updateDraftPath(['blocks'], nextBlocks)}
                  onSelectBlock={handleSelectionChange}
                />
              </div>
              <div className="admin-page-editor-layout-rail admin-page-editor-rail--active" hidden={contextView !== 'layout'}>
                <BlockLayoutOutline
                  blocks={page.blocks}
                  headingLevel={2}
                  layoutMetrics={layoutMetrics}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={handleSelectionChange}
                />
              </div>
              <div className="admin-page-editor-inspector-rail admin-page-editor-rail--active" hidden={contextView !== 'inspector'}>
                <BlockInspectorPanel
                  headingLevel={2}
                  page={page}
                  selectedBlockId={selectedBlockId}
                  siteShell={HARNESS_SITE_SHELL}
                  validation={validation}
                  onClearSelection={openPageSettings}
                  onUpdatePath={updateDraftPath}
                />
              </div>
            </EditorContextPanel>

            <div className="admin-page-editor-canvas">
              <AdminPageEditorCanvas
                device={previewDevice}
                onChange={applyDraftChange}
                onLayoutMetricsChange={setLayoutMetrics}
                onSelectedBlockIdChange={handleSelectionChange}
                page={page}
                pageKey={HARNESS_PAGE_KEY}
                selectedBlockId={selectedBlockId}
                siteShell={HARNESS_SITE_SHELL}
              />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
