import { useRef, useState } from 'react'
import { Eye, LayoutPanelTop, SlidersHorizontal } from 'lucide-react'
import { AdminPageEditorCanvas, AdminPagePreview } from '../components/AdminPagePreview'
import { AdminPreviewModeSplitButton } from '../components/AdminPreviewModeSplitButton'
import { BlockInspectorPanel } from '../components/BlockInspectorPanel'
import { BlockLayoutOutline, BlockOutline } from '../components/BlockOutline'
import { EditorIconButton } from '../components/EditorIconButton'
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
  const canvasView = contextView === 'layout' ? 'layout' : 'visual'
  const pageSettingsOpen = contextView === 'settings'

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
    setContextView((currentView) => (selectionId ? (currentView === 'layout' ? 'layout' : '') : ''))
  }

  function openPageSettings() {
    setSelectedBlockId('')
    setContextView('settings')
  }

  function clearSelection() {
    setSelectedBlockId('')
    setContextView('')
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
          <AdminPreviewModeSplitButton
            device={previewDevice}
            mode={previewMode ? 'preview' : 'edit'}
            onDeviceChange={setPreviewDevice}
            onModeChange={(nextMode) => setPreviewMode(nextMode === 'preview')}
          />
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
        <div className="admin-page-editor-shell">
          <aside className="admin-page-editor-layers-rail" aria-label="Page layers">
            <BlockOutline
              blocks={page.blocks}
              headingLevel={2}
              pageSelected={pageSettingsOpen}
              selectedBlockId={selectedBlockId}
              validation={validation}
              onBlocksChange={(nextBlocks) => updateDraftPath(['blocks'], nextBlocks)}
              onSelectBlock={handleSelectionChange}
              onSelectPage={openPageSettings}
            />
          </aside>

          <div className="admin-page-editor-main">
            <div className="admin-page-editor-canvas-toolbar">
              <div aria-label="Canvas view" className="admin-page-editor-view-toggle" role="group">
                <button
                  aria-pressed={canvasView === 'visual'}
                  className={`admin-page-editor-view-toggle-button${
                    canvasView === 'visual' ? ' admin-page-editor-view-toggle-button--active' : ''
                  }`}
                  type="button"
                  onClick={() => setContextView('')}
                >
                  <Eye aria-hidden="true" size={16} strokeWidth={2} />
                  <span>Visual</span>
                </button>
                <button
                  aria-pressed={canvasView === 'layout'}
                  className={`admin-page-editor-view-toggle-button${
                    canvasView === 'layout' ? ' admin-page-editor-view-toggle-button--active' : ''
                  }`}
                  type="button"
                  onClick={() => setContextView('layout')}
                >
                  <LayoutPanelTop aria-hidden="true" size={16} strokeWidth={2} />
                  <span>Layout</span>
                </button>
              </div>
              <EditorIconButton
                aria-pressed={pageSettingsOpen}
                className={pageSettingsOpen ? 'editor-icon-button--active' : ''}
                icon={SlidersHorizontal}
                label="Page settings"
                onClick={() => {
                  if (pageSettingsOpen) {
                    setContextView('')
                  } else {
                    openPageSettings()
                  }
                }}
              />
            </div>

            {pageSettingsOpen ? (
              <div className="admin-page-editor-page-settings">
                <BlockInspectorPanel
                  headingLevel={2}
                  page={page}
                  selectedBlockId=""
                  siteShell={HARNESS_SITE_SHELL}
                  validation={validation}
                  onClearSelection={clearSelection}
                  onUpdatePath={updateDraftPath}
                />
              </div>
            ) : null}

            <div className="admin-page-editor-canvas">
              {canvasView === 'layout' ? (
                <div className="admin-page-editor-layout-view">
                  <BlockLayoutOutline
                    blocks={page.blocks}
                    headingLevel={2}
                    layoutMetrics={layoutMetrics}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={handleSelectionChange}
                  />
                </div>
              ) : (
                <AdminPageEditorCanvas
                  device={previewDevice}
                  renderSelectionInspector={(selectionId) => (
                    <BlockInspectorPanel
                      headingLevel={2}
                      page={page}
                      selectedBlockId={selectionId}
                      siteShell={HARNESS_SITE_SHELL}
                      validation={validation}
                      onClearSelection={clearSelection}
                      onUpdatePath={updateDraftPath}
                    />
                  )}
                  onChange={applyDraftChange}
                  onLayoutMetricsChange={setLayoutMetrics}
                  onSelectedBlockIdChange={handleSelectionChange}
                  page={page}
                  pageKey={HARNESS_PAGE_KEY}
                  selectedBlockId={selectedBlockId}
                  siteShell={HARNESS_SITE_SHELL}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
