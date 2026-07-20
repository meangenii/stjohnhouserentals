import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ADMIN_FLOATING_PREVIEW_STACK_OFFSET_VAR, ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR } from '../lib/adminFloatingLayout'
import { buildRouteOptions, resolveLinkRenderConfig } from '../lib/linkRecords'
import { getClipboardRichTextHtml, richTextValueToHtml } from '../lib/richTextValue'
import {
  applyRichTextFontSize,
  captureCaretOffset,
  captureRichTextSelectionRange,
  insertLinkAtCollapsedSelection,
  isTightenedBlockSelection,
  placeCaretAtPoint,
  restoreCaretOffset,
  restoreRichTextSelectionRange,
  readRichTextSelectionState,
  tightenOrUntightenSelectedLines,
} from '../lib/richTextFormatting'
import { getEnabledRichTextBlockOptions, getEnabledRichTextFontSizeOptions } from '../lib/editorStyleSettings'
import { SiteContentPreviewContext } from '../lib/siteContentPreview'
import { useEditorStyleSettings } from '../lib/useEditorStyleSettings'
import { AdminLinkFields } from './AdminLinkFields'
import { AdminRichTextMenu } from './AdminRichTextMenu'
import { RichTextFontSizeInput } from './RichTextFontSizeInput'

function ToolbarButton({ active = false, children, disabled, icon = null, onClick }) {
  const label = typeof children === 'string' ? children : undefined

  return (
    <button
      aria-label={icon ? label : undefined}
      className={`button-link button-link--ghost admin-rich-text-button ${icon ? 'admin-rich-text-button--icon' : ''} ${
        active ? 'admin-rich-text-button--active' : ''
      }`.trim()}
      disabled={disabled}
      title={icon ? label : undefined}
      type="button"
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
    >
      {icon ?? children}
    </button>
  )
}

function BoldGlyphIcon() {
  return (
    <span aria-hidden="true" className="admin-rich-text-glyph admin-rich-text-glyph--bold">
      B
    </span>
  )
}

function ItalicGlyphIcon() {
  return (
    <span aria-hidden="true" className="admin-rich-text-glyph admin-rich-text-glyph--italic">
      I
    </span>
  )
}

function UnderlineGlyphIcon() {
  return (
    <span aria-hidden="true" className="admin-rich-text-glyph admin-rich-text-glyph--underline">
      U
    </span>
  )
}

function BulletListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <circle cx="3" cy="5" fill="currentColor" r="1.3" />
      <circle cx="3" cy="10" fill="currentColor" r="1.3" />
      <circle cx="3" cy="15" fill="currentColor" r="1.3" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="5" y2="5" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="10" y2="10" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="15" y2="15" />
    </svg>
  )
}

function NumberedListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <text fill="currentColor" fontSize="6" fontWeight="700" x="0.5" y="7">
        1
      </text>
      <text fill="currentColor" fontSize="6" fontWeight="700" x="0.5" y="12">
        2
      </text>
      <text fill="currentColor" fontSize="6" fontWeight="700" x="0.5" y="17">
        3
      </text>
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="5" y2="5" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="10" y2="10" />
      <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="7.5" x2="17.5" y1="15" y2="15" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 20 20">
      <path d="M8 12l4-4" />
      <path d="M9 6.5l1.2-1.2a3 3 0 0 1 4.2 4.2L13 10.7" />
      <path d="M11 13.5l-1.2 1.2a3 3 0 0 1-4.2-4.2L6.8 9.3" />
    </svg>
  )
}

function ClearFormatIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 20 20">
      <path d="M4 12.5l6-6 5 5-3 3H7l-3-2Z" />
      <path d="M3 16h9" />
    </svg>
  )
}

function LineBreakIcon() {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 20 20">
      <path d="M16 5v5H7" />
      <path d="M10 7.5 7 10l3 2.5" />
    </svg>
  )
}

function isEmptyHtmlValue(value = '') {
  const sourceHtml = String(value ?? '')

  if (/<\s*table\b/i.test(sourceHtml)) {
    return false
  }

  return sourceHtml
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim().length === 0
}

function ensureDefaultParagraphSeparator() {
  try {
    document.execCommand('defaultParagraphSeparator', false, 'p')
  } catch {
    // Browsers that do not support this command still fall back to their native Enter behavior.
  }
}

function getSelectedTableCellElement(root) {
  if (!root || typeof window === 'undefined') {
    return null
  }

  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return null
  }

  let node = selection.getRangeAt(0).commonAncestorContainer

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement
  }

  const cell = node instanceof Element ? node.closest('td, th') : null
  return cell && root.contains(cell) ? cell : null
}

function readEditorSelectionState(editor) {
  return {
    ...readRichTextSelectionState(editor, { defaultBlockTag: 'p' }),
    tableCell: Boolean(getSelectedTableCellElement(editor)),
    tightenedLines: isTightenedBlockSelection(editor),
  }
}

const RICH_TEXT_CONTENT_MODE_CONFIGS = {
  block: {
    blockFormatting: true,
    clearFormatting: true,
    fontSize: true,
    lineBreaks: true,
    lineTightening: true,
    links: true,
    lists: true,
    sourceMode: false,
    spacingHelp: true,
    tables: true,
  },
  inline: {
    blockFormatting: false,
    clearFormatting: true,
    fontSize: true,
    lineBreaks: true,
    lineTightening: false,
    links: true,
    lists: false,
    sourceMode: false,
    spacingHelp: false,
    tables: false,
  },
  lines: {
    blockFormatting: false,
    clearFormatting: true,
    fontSize: true,
    lineBreaks: true,
    lineTightening: false,
    links: true,
    lists: false,
    sourceMode: false,
    spacingHelp: false,
    tables: false,
  },
  paragraphs: {
    blockFormatting: false,
    clearFormatting: true,
    fontSize: true,
    lineBreaks: true,
    lineTightening: false,
    links: true,
    lists: false,
    sourceMode: false,
    spacingHelp: false,
    tables: false,
  },
}

function getRichTextContentModeConfig(contentMode, allowSourceMode) {
  const baseConfig = RICH_TEXT_CONTENT_MODE_CONFIGS[contentMode] ?? RICH_TEXT_CONTENT_MODE_CONFIGS.block

  return {
    ...baseConfig,
    sourceMode: typeof allowSourceMode === 'boolean' ? allowSourceMode : baseConfig.sourceMode,
  }
}

function normalizeSnippetMarkerText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

function createRichTextContainer(html) {
  if (typeof document === 'undefined') {
    return null
  }

  const container = document.createElement('div')
  container.innerHTML = richTextValueToHtml(html)
  return container
}

function getFirstMeaningfulSnippetNode(container) {
  return Array.from(container?.childNodes ?? []).find((node) => {
    if (node.nodeType === 3) {
      return Boolean(node.textContent?.trim())
    }

    return node.nodeType === 1 && Boolean(node.textContent?.trim())
  })
}

function getSnippetSectionStartText(snippet) {
  if (snippet?.sectionStart) {
    return snippet.sectionStart
  }

  const snippetContainer = createRichTextContainer(snippet?.html)
  const firstNode = getFirstMeaningfulSnippetNode(snippetContainer)
  return firstNode?.textContent ?? snippet?.label ?? ''
}

function getSnippetSectionKey(snippet, index) {
  return String(snippet?.sectionKey ?? snippet?.label ?? `snippet-${index}`).trim()
}

function getSectionSnippetItems(snippets = []) {
  return snippets
    .map((snippet, index) => ({
      index,
      key: getSnippetSectionKey(snippet, index),
      marker: normalizeSnippetMarkerText(getSnippetSectionStartText(snippet)),
      snippet,
    }))
    .filter((item) => item.snippet?.insertStrategy === 'section' && item.key && item.marker)
}

function snippetMarkerMatchesText(text, marker) {
  const normalizedText = normalizeSnippetMarkerText(text)
  return Boolean(
    normalizedText &&
      marker &&
      (normalizedText === marker || normalizedText.startsWith(`${marker} `) || normalizedText.endsWith(` ${marker}`)),
  )
}

function nodeMatchesSnippetMarker(node, marker) {
  const emphasizedMarker = node?.querySelector?.('strong, b')?.textContent

  if (snippetMarkerMatchesText(emphasizedMarker, marker)) {
    return true
  }

  const nodeMarker = normalizeSnippetMarkerText(node?.textContent ?? '')
  const isHeadingNode = /^H[1-6]$/i.test(node?.tagName ?? '')

  return Boolean(nodeMarker && marker && (nodeMarker === marker || (isHeadingNode && nodeMarker.startsWith(`${marker} `))))
}

function findSnippetSectionStart(container, item) {
  return Array.from(container?.children ?? []).find((child) => nodeMatchesSnippetMarker(child, item.marker)) ?? null
}

function appendSnippetHtml(sourceHtml, snippetHtml) {
  const normalizedSourceHtml = richTextValueToHtml(sourceHtml).trim()
  const normalizedSnippetHtml = richTextValueToHtml(snippetHtml).trim()

  return [normalizedSourceHtml, normalizedSnippetHtml].filter(Boolean).join('\n')
}

function insertSectionSnippetHtml(sourceHtml, snippet, snippets) {
  const snippetHtml = richTextValueToHtml(snippet?.html)

  if (!snippetHtml) {
    return richTextValueToHtml(sourceHtml)
  }

  const root = createRichTextContainer(sourceHtml)
  const snippetRoot = createRichTextContainer(snippetHtml)

  if (!root || !snippetRoot) {
    return appendSnippetHtml(sourceHtml, snippetHtml)
  }

  const sectionItems = getSectionSnippetItems(snippets)
  const currentKey = getSnippetSectionKey(snippet, -1)
  const currentItem = sectionItems.find((item) => item.snippet === snippet || item.key === currentKey)

  if (!currentItem) {
    return appendSnippetHtml(root.innerHTML, snippetHtml)
  }

  if (findSnippetSectionStart(root, currentItem)) {
    return richTextValueToHtml(root.innerHTML)
  }

  const followingMarkers = sectionItems.filter((item) => item.index > currentItem.index).map((item) => item.marker)
  const followingSectionStart =
    Array.from(root.children).find((child) => followingMarkers.some((marker) => nodeMatchesSnippetMarker(child, marker))) ?? null
  const fragment = document.createDocumentFragment()

  Array.from(snippetRoot.childNodes).forEach((child) => {
    fragment.append(child)
  })

  if (followingSectionStart) {
    root.insertBefore(fragment, followingSectionStart)
  } else {
    root.append(fragment)
  }

  return richTextValueToHtml(root.innerHTML)
}

function getInsertedLinkText(renderConfig) {
  const destination = String(renderConfig?.destination || renderConfig?.href || renderConfig?.to || '').trim()

  if (renderConfig?.type === 'email') {
    return destination.replace(/^mailto:/i, '').split('?')[0] || destination
  }

  if (renderConfig?.type === 'phone') {
    return destination.replace(/^tel:/i, '') || destination
  }

  return destination
}

export function AdminRichTextEditor({
  allowSourceMode = undefined,
  collapsedFontSizeBehavior = 'selection',
  compact = false,
  contentMode = 'block',
  disabled = false,
  headerActions = null,
  helperText = '',
  hideLabel = false,
  label,
  onChange,
  onSanitizedPaste = null,
  placeholder = 'Start typing the page content here.',
  snippets = [],
  sourceRows = undefined,
  value,
}) {
  const editorShellRef = useRef(null)
  const editorRef = useRef(null)
  const toolbarShellRef = useRef(null)
  const toolbarRef = useRef(null)
  const selectionRangeRef = useRef(null)
  const linkEditorPanelRef = useRef(null)
  const [mode, setMode] = useState('visual')
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [toolbarLayout, setToolbarLayout] = useState(() => ({
    floating: false,
    height: 0,
    left: 0,
    width: 0,
  }))
  const [linkEditorState, setLinkEditorState] = useState(null)
  const [selectionState, setSelectionState] = useState(() => ({
    blockTag: 'p',
    bold: false,
    fontSize: 'default',
    italic: false,
    tableCell: false,
    tightenedLines: false,
    underline: false,
  }))
  const editorStyleSettings = useEditorStyleSettings()
  const previewState = useContext(SiteContentPreviewContext)
  const routeOptions = buildRouteOptions(Array.isArray(previewState?.routeInventory) ? previewState.routeInventory : [])
  const blockStyleOptions = getEnabledRichTextBlockOptions(editorStyleSettings)
  const fontSizeOptions = getEnabledRichTextFontSizeOptions(editorStyleSettings)
  const contentModeConfig = getRichTextContentModeConfig(contentMode, allowSourceMode)
  const activeMode = contentModeConfig.sourceMode ? mode : 'visual'
  const htmlSourceRows = Number(sourceRows) > 0 ? Number(sourceRows) : compact ? 8 : 14
  const renderedValue = richTextValueToHtml(value)
  const lastPublishedHtmlRef = useRef(renderedValue)

  useLayoutEffect(() => {
    if (activeMode !== 'visual' || !editorRef.current) {
      return
    }

    const editor = editorRef.current
    const nextHtml = isEmptyHtmlValue(renderedValue) ? '' : renderedValue

    if (editor.innerHTML === nextHtml) {
      lastPublishedHtmlRef.current = nextHtml
      return
    }

    if (document.activeElement === editor && nextHtml === lastPublishedHtmlRef.current) {
      return
    }

    const isFocused = document.activeElement === editor
    const caretOffsets = isFocused ? captureCaretOffset(editor) : null

    editor.innerHTML = nextHtml

    if (isFocused) {
      restoreCaretOffset(editor, caretOffsets)
    }

    lastPublishedHtmlRef.current = nextHtml
  }, [activeMode, renderedValue])

  useEffect(() => {
    if (activeMode !== 'visual' || typeof document === 'undefined') {
      return undefined
    }

    function updateSelectionState({ preserveWhenMissing = true } = {}) {
      const editor = editorRef.current

      if (!editor) {
        return
      }

      const nextRange = captureRichTextSelectionRange(editor)

      if (nextRange) {
        selectionRangeRef.current = nextRange
        setSelectionState(readEditorSelectionState(editor))
        return
      }

      if (!preserveWhenMissing) {
        setSelectionState(readEditorSelectionState(editor))
      }
    }

    updateSelectionState({ preserveWhenMissing: false })
    document.addEventListener('selectionchange', updateSelectionState)

    return () => {
      document.removeEventListener('selectionchange', updateSelectionState)
    }
  }, [activeMode])

  useEffect(() => {
    if (!linkEditorState || typeof document === 'undefined') {
      return undefined
    }

    function handlePointerDown(event) {
      if (!linkEditorPanelRef.current || linkEditorPanelRef.current.contains(event.target)) {
        return
      }

      setLinkEditorState(null)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setLinkEditorState(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [linkEditorState])

  useLayoutEffect(() => {
    if (!toolbarVisible || activeMode !== 'visual' || typeof window === 'undefined') {
      return undefined
    }

    let animationFrameId = 0

    function updateToolbarLayout() {
      const editorShell = editorShellRef.current
      const toolbarShell = toolbarShellRef.current
      const toolbar = toolbarRef.current

      if (!editorShell || !toolbarShell || !toolbar) {
        return
      }

      const editorShellBounds = editorShell.getBoundingClientRect()
      const toolbarShellBounds = toolbarShell.getBoundingClientRect()
      const toolbarHeight = toolbar.offsetHeight
      const margin = 14
      const nextWidth = Math.min(toolbarShellBounds.width, Math.max(0, window.innerWidth - margin * 2))
      const maxLeft = Math.max(margin, window.innerWidth - nextWidth - margin)
      const canFloatWithinEditor = editorShellBounds.bottom - margin >= toolbarHeight + margin
      const shouldFloat = toolbarShellBounds.top <= margin && canFloatWithinEditor

      setToolbarLayout((currentLayout) => {
        const nextLayout = shouldFloat
          ? {
              floating: true,
              height: toolbarHeight,
              left: Math.min(Math.max(margin, toolbarShellBounds.left), maxLeft),
              width: nextWidth,
            }
          : {
              floating: false,
              height: toolbarHeight,
              left: 0,
              width: 0,
            }

        if (
          currentLayout.floating === nextLayout.floating &&
          currentLayout.height === nextLayout.height &&
          currentLayout.left === nextLayout.left &&
          currentLayout.width === nextLayout.width
        ) {
          return currentLayout
        }

        return nextLayout
      })
    }

    function scheduleToolbarLayoutUpdate() {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(updateToolbarLayout)
    }

    scheduleToolbarLayoutUpdate()
    window.addEventListener('resize', scheduleToolbarLayoutUpdate)
    window.addEventListener('scroll', scheduleToolbarLayoutUpdate, true)

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId)
      }

      window.removeEventListener('resize', scheduleToolbarLayoutUpdate)
      window.removeEventListener('scroll', scheduleToolbarLayoutUpdate, true)
    }
  }, [activeMode, toolbarVisible])

  function syncValue({ cleanDom = true } = {}) {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const normalizedHtml = (() => {
      const nextHtml = isEmptyHtmlValue(editor.innerHTML) ? '' : richTextValueToHtml(editor.innerHTML)

      if (!cleanDom || editor.innerHTML === nextHtml) {
        return nextHtml
      }

      const isFocused = document.activeElement === editor
      const caretOffsets = isFocused ? captureCaretOffset(editor) : null

      editor.innerHTML = nextHtml

      if (isFocused) {
        restoreCaretOffset(editor, caretOffsets)
      }

      return nextHtml
    })()

    const nextRange = captureRichTextSelectionRange(editor)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }

    lastPublishedHtmlRef.current = normalizedHtml
    onChange(normalizedHtml)
    setSelectionState(readEditorSelectionState(editor))
  }

  function rememberSelection() {
    const nextRange = captureRichTextSelectionRange(editorRef.current)

    if (nextRange) {
      selectionRangeRef.current = nextRange
    }
  }

  function focusEditorSelection() {
    if (!editorRef.current) {
      return false
    }

    if (restoreRichTextSelectionRange(editorRef.current, selectionRangeRef.current)) {
      return true
    }

    editorRef.current.focus()
    return true
  }

  function applyCommand(command, commandValue = null) {
    if (disabled || !editorRef.current || !focusEditorSelection()) {
      return
    }

    document.execCommand(command, false, commandValue)
    syncValue()
  }

  function publishHtmlValue(nextHtml) {
    const normalizedHtml = isEmptyHtmlValue(nextHtml) ? '' : richTextValueToHtml(nextHtml)

    lastPublishedHtmlRef.current = normalizedHtml
    onChange(normalizedHtml)

    if (activeMode === 'visual' && editorRef.current && editorRef.current.innerHTML !== normalizedHtml) {
      editorRef.current.innerHTML = normalizedHtml
    }

    if (activeMode === 'visual') {
      setSelectionState(readEditorSelectionState(editorRef.current))
    }
  }

  function handleBlockTagChange(nextValue) {
    const nextTag = String(nextValue ?? 'p').trim().toLowerCase()

    if (!nextTag) {
      return
    }

    applyCommand('formatBlock', `<${nextTag}>`)
  }

  function handleFontSizeChange(nextValue) {
    if (disabled || !editorRef.current || !focusEditorSelection()) {
      return
    }

    if (applyRichTextFontSize(editorRef.current, nextValue, { collapsedBehavior: collapsedFontSizeBehavior })) {
      syncValue()
    }
  }

  function getSelectedAnchorElement() {
    const editor = editorRef.current

    if (!editor || typeof window === 'undefined') {
      return null
    }

    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return null
    }

    let node = selection.getRangeAt(0).commonAncestorContainer

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement
    }

    const anchorElement = node instanceof Element ? node.closest('a') : null
    return anchorElement && editor.contains(anchorElement) ? anchorElement : null
  }

  function openLinkEditor() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    const existingAnchor = getSelectedAnchorElement()

    setLinkEditorState({
      hasExistingLink: Boolean(existingAnchor),
      link: existingAnchor
        ? {
            href: existingAnchor.getAttribute('href') || '',
            openInNewTab: existingAnchor.getAttribute('target') === '_blank',
          }
        : {},
    })
  }

  function closeLinkEditor() {
    setLinkEditorState(null)
  }

  function applyLinkDraft() {
    if (disabled || !editorRef.current || !linkEditorState || !focusEditorSelection()) {
      return
    }

    const renderConfig = resolveLinkRenderConfig(linkEditorState.link, { defaultType: 'external', destinationField: 'href' })
    const href = renderConfig.destination

    if (!href) {
      return
    }

    const existingAnchorElement = getSelectedAnchorElement()
    const insertedAnchorElement = existingAnchorElement
      ? null
      : insertLinkAtCollapsedSelection(editorRef.current, href, getInsertedLinkText(renderConfig))

    if (!insertedAnchorElement) {
      document.execCommand('createLink', false, href)
    }

    const anchorElement = insertedAnchorElement || getSelectedAnchorElement()

    if (anchorElement) {
      anchorElement.setAttribute('href', href)

      if (renderConfig.target) {
        anchorElement.setAttribute('target', renderConfig.target)
        anchorElement.setAttribute('rel', renderConfig.rel || 'noreferrer noopener')
      } else {
        anchorElement.removeAttribute('target')
        anchorElement.removeAttribute('rel')
      }
    }

    syncValue()
    closeLinkEditor()
  }

  function removeLink() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    document.execCommand('unlink', false, null)
    syncValue()
    closeLinkEditor()
  }

  function getSelectedTableCell() {
    return getSelectedTableCellElement(editorRef.current)
  }

  function insertTable() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    document.execCommand(
      'insertHTML',
      false,
      '<table><tbody><tr><th>Heading</th><th>Heading</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br /></p>',
    )
    syncValue()
  }

  function addTableRow() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    const cell = getSelectedTableCell()
    const currentRow = cell?.closest('tr')

    if (!currentRow) {
      return
    }

    const newRow = currentRow.cloneNode(true)
    Array.from(newRow.children).forEach((rowCell) => {
      rowCell.innerHTML = '&nbsp;'
    })

    currentRow.after(newRow)
    syncValue()
  }

  function addTableColumn() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    const cell = getSelectedTableCell()
    const currentRow = cell?.closest('tr')
    const table = cell?.closest('table')

    if (!cell || !currentRow || !table) {
      return
    }

    const cellIndex = Array.from(currentRow.children).indexOf(cell)

    if (cellIndex < 0) {
      return
    }

    Array.from(table.querySelectorAll('tr')).forEach((row) => {
      const referenceCell = row.children[cellIndex] ?? row.lastElementChild
      const tagName = referenceCell?.tagName?.toLowerCase() === 'th' ? 'th' : 'td'
      const newCell = document.createElement(tagName)

      newCell.innerHTML = '&nbsp;'

      if (referenceCell) {
        referenceCell.after(newCell)
      } else {
        row.append(newCell)
      }
    })

    syncValue()
  }

  function removeTableRow() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    const cell = getSelectedTableCell()
    const currentRow = cell?.closest('tr')
    const table = cell?.closest('table')

    if (!currentRow || !table) {
      return
    }

    currentRow.remove()

    if (table.querySelectorAll('tr').length === 0) {
      table.remove()
    }

    syncValue()
  }

  function removeTableColumn() {
    if (disabled || !focusEditorSelection()) {
      return
    }

    const cell = getSelectedTableCell()
    const currentRow = cell?.closest('tr')
    const table = cell?.closest('table')

    if (!cell || !currentRow || !table) {
      return
    }

    const cellIndex = Array.from(currentRow.children).indexOf(cell)

    if (cellIndex < 0) {
      return
    }

    Array.from(table.querySelectorAll('tr')).forEach((row) => {
      row.children[cellIndex]?.remove()
    })

    if (!Array.from(table.querySelectorAll('tr')).some((row) => row.children.length > 0)) {
      table.remove()
    }

    syncValue()
  }

  function tightenSelectedLines() {
    const editor = editorRef.current

    if (disabled || !editor || !focusEditorSelection()) {
      return
    }

    if (tightenOrUntightenSelectedLines(editor)) {
      syncValue()
    }
  }

  function handleCanvasKeyDown(event) {
    if (disabled || event.key !== 'Enter' || !event.shiftKey) {
      if (!disabled && event.key === 'Enter') {
        ensureDefaultParagraphSeparator()
      }

      return
    }

    event.preventDefault()
    document.execCommand('insertHTML', false, '<br />')
    syncValue()
  }

  function insertSnippet(snippet) {
    const html = typeof snippet === 'string' ? snippet : snippet?.html

    if (disabled || !html) {
      return
    }

    if (snippet?.insertStrategy === 'section') {
      const sourceHtml = activeMode === 'visual' && editorRef.current ? editorRef.current.innerHTML : value
      publishHtmlValue(insertSectionSnippetHtml(sourceHtml, snippet, snippets))
      return
    }

    if (activeMode === 'html') {
      const normalizedValue = String(value ?? '').trim()
      const separator = normalizedValue ? '\n' : ''
      onChange(`${normalizedValue}${separator}${html}`.trim())
      return
    }

    applyCommand('insertHTML', html)
  }

  function showToolbar() {
    if (!disabled) {
      ensureDefaultParagraphSeparator()
      setToolbarVisible(true)
    }
  }

  function handlePaste(event) {
    if (disabled) {
      return
    }

    const pastedHtml = getClipboardRichTextHtml(event.clipboardData, { inline: !contentModeConfig.blockFormatting })

    if (!pastedHtml) {
      return
    }

    event.preventDefault()

    if (onSanitizedPaste?.(pastedHtml) === true) {
      return
    }

    document.execCommand('insertHTML', false, pastedHtml)
    syncValue()
  }

  function handleDrop(event) {
    if (disabled) {
      return
    }

    const droppedHtml = getClipboardRichTextHtml(event.dataTransfer, { inline: !contentModeConfig.blockFormatting })

    event.preventDefault()

    if (!droppedHtml) {
      return
    }

    if (onSanitizedPaste?.(droppedHtml) === true) {
      return
    }

    if (!placeCaretAtPoint(editorRef.current, event.clientX, event.clientY)) {
      return
    }

    document.execCommand('insertHTML', false, droppedHtml)
    syncValue()
  }

  function handleSourcePaste(event) {
    if (disabled) {
      return
    }

    const pastedHtml = getClipboardRichTextHtml(event.clipboardData, { inline: !contentModeConfig.blockFormatting })

    if (!pastedHtml) {
      return
    }

    event.preventDefault()

    if (onSanitizedPaste?.(pastedHtml) === true) {
      return
    }

    const textarea = event.currentTarget
    const currentValue = String(value ?? '')
    const selectionStart = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : currentValue.length
    const selectionEnd = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : selectionStart
    const nextValue = `${currentValue.slice(0, selectionStart)}${pastedHtml}${currentValue.slice(selectionEnd)}`

    onChange(nextValue)
  }

  function handleEditorShellBlur(event) {
    const nextFocusedElement = event.relatedTarget

    if (
      editorShellRef.current &&
      nextFocusedElement instanceof Node &&
      editorShellRef.current.contains(nextFocusedElement)
    ) {
      return
    }

    setToolbarVisible(false)
  }

  const toolbarFloating = toolbarVisible && activeMode === 'visual' && toolbarLayout.floating
  const toolbarStyle = toolbarFloating
    ? {
        left: `${toolbarLayout.left}px`,
        top: `calc(var(--admin-floating-base-top, 1rem) + var(${ADMIN_FLOATING_SAVE_STACK_OFFSET_VAR}, 0px) + var(${ADMIN_FLOATING_PREVIEW_STACK_OFFSET_VAR}, 0px))`,
        width: `${toolbarLayout.width}px`,
      }
    : undefined

  return (
    <div
      ref={editorShellRef}
      className={`admin-rich-text-editor${compact ? ' admin-rich-text-editor--compact' : ''}${
        toolbarVisible ? ' admin-rich-text-editor--toolbar-visible' : ''
      }`.trim()}
      onBlur={handleEditorShellBlur}
    >
      <div className={`admin-rich-text-header${hideLabel ? ' admin-rich-text-header--actions-only' : ''}`.trim()}>
        {hideLabel ? null : <span>{label}</span>}
        <div className="admin-rich-text-header-actions">
          {headerActions}
          {contentModeConfig.sourceMode ? (
            <div className="admin-inline-actions">
              <ToolbarButton disabled={disabled || mode === 'visual'} onClick={() => setMode('visual')}>
                Visual
              </ToolbarButton>
              <ToolbarButton disabled={disabled || mode === 'html'} onClick={() => setMode('html')}>
                Source
              </ToolbarButton>
            </div>
          ) : null}
        </div>
      </div>

      {activeMode === 'visual' ? (
        <>
          <div
            ref={toolbarShellRef}
            className={`admin-rich-text-toolbar-shell${toolbarFloating ? ' admin-rich-text-toolbar-shell--floating' : ''}`.trim()}
            style={toolbarFloating ? { minHeight: `${toolbarLayout.height}px` } : undefined}
          >
            <div ref={toolbarRef} className="admin-rich-text-toolbar" style={toolbarStyle}>
              {contentModeConfig.blockFormatting ? (
                <AdminRichTextMenu
                  disabled={disabled}
                  label="Tag"
                  onBeforeOpen={rememberSelection}
                  onSelect={handleBlockTagChange}
                  options={blockStyleOptions}
                  value={selectionState.blockTag}
                />
              ) : null}
              {contentModeConfig.fontSize ? (
                <AdminRichTextMenu
                  disabled={disabled}
                  footer={<RichTextFontSizeInput disabled={disabled} onApply={handleFontSizeChange} />}
                  label="Size"
                  onBeforeOpen={rememberSelection}
                  onSelect={handleFontSizeChange}
                  options={fontSizeOptions}
                  value={selectionState.fontSize}
                />
              ) : null}
              <ToolbarButton
                active={selectionState.bold}
                disabled={disabled}
                icon={<BoldGlyphIcon />}
                onClick={() => applyCommand('bold')}
              >
                Bold
              </ToolbarButton>
              <ToolbarButton
                active={selectionState.italic}
                disabled={disabled}
                icon={<ItalicGlyphIcon />}
                onClick={() => applyCommand('italic')}
              >
                Italic
              </ToolbarButton>
              <ToolbarButton
                active={selectionState.underline}
                disabled={disabled}
                icon={<UnderlineGlyphIcon />}
                onClick={() => applyCommand('underline')}
              >
                Underline
              </ToolbarButton>
              {contentModeConfig.lineBreaks ? (
                <ToolbarButton disabled={disabled} icon={<LineBreakIcon />} onClick={() => applyCommand('insertHTML', '<br />')}>
                  Line Break
                </ToolbarButton>
              ) : null}
              {contentModeConfig.lineTightening ? (
                <ToolbarButton disabled={disabled} onClick={tightenSelectedLines}>
                  {selectionState.tightenedLines ? 'Untighten Lines' : 'Tighten Lines'}
                </ToolbarButton>
              ) : null}
              {contentModeConfig.lists ? (
                <>
                  <ToolbarButton disabled={disabled} icon={<BulletListIcon />} onClick={() => applyCommand('insertUnorderedList')}>
                    Bullet List
                  </ToolbarButton>
                  <ToolbarButton disabled={disabled} icon={<NumberedListIcon />} onClick={() => applyCommand('insertOrderedList')}>
                    Numbered List
                  </ToolbarButton>
                </>
              ) : null}
              {contentModeConfig.tables ? (
                <>
                  <ToolbarButton disabled={disabled} onClick={insertTable}>
                    Insert Table
                  </ToolbarButton>
                  <ToolbarButton disabled={disabled || !selectionState.tableCell} onClick={addTableRow}>
                    Add Row
                  </ToolbarButton>
                  <ToolbarButton disabled={disabled || !selectionState.tableCell} onClick={addTableColumn}>
                    Add Column
                  </ToolbarButton>
                  <ToolbarButton disabled={disabled || !selectionState.tableCell} onClick={removeTableRow}>
                    Delete Row
                  </ToolbarButton>
                  <ToolbarButton disabled={disabled || !selectionState.tableCell} onClick={removeTableColumn}>
                    Delete Column
                  </ToolbarButton>
                </>
              ) : null}
              {contentModeConfig.links ? (
                <ToolbarButton active={Boolean(linkEditorState)} disabled={disabled} icon={<LinkIcon />} onClick={openLinkEditor}>
                  Link
                </ToolbarButton>
              ) : null}
              {contentModeConfig.clearFormatting ? (
                <ToolbarButton disabled={disabled} icon={<ClearFormatIcon />} onClick={() => applyCommand('removeFormat')}>
                  Clear Formatting
                </ToolbarButton>
              ) : null}
            </div>
          </div>

          {contentModeConfig.spacingHelp ? (
            <p className="admin-note admin-rich-text-linebreak-hint">
              Press <strong>Enter</strong> for a new paragraph (adds spacing). Press <strong>Shift+Enter</strong> or click{' '}
              <strong>Line Break</strong> to start a new line without extra spacing. Select a few lines and click{' '}
              <strong>Tighten Lines</strong> to remove extra spacing. Select tightened text and click <strong>Untighten Lines</strong>{' '}
              to restore paragraph spacing.
            </p>
          ) : null}

          {linkEditorState ? (
            <div className="admin-rich-text-link-editor-shell" role="presentation">
              <div aria-label="Link" className="admin-rich-text-link-editor" ref={linkEditorPanelRef} role="dialog">
                <AdminLinkFields
                  defaultType="external"
                  destinationField="href"
                  destinationLabel="Link"
                  disabled={disabled}
                  link={linkEditorState.link}
                  routeOptions={routeOptions}
                  onChange={(nextLink) => setLinkEditorState((currentState) => ({ ...currentState, link: nextLink }))}
                />
                <div className="admin-inline-actions">
                  <ToolbarButton disabled={disabled} onClick={applyLinkDraft}>
                    Apply link
                  </ToolbarButton>
                  {linkEditorState.hasExistingLink ? (
                    <ToolbarButton disabled={disabled} onClick={removeLink}>
                      Remove link
                    </ToolbarButton>
                  ) : null}
                  <ToolbarButton disabled={disabled} onClick={closeLinkEditor}>
                    Cancel
                  </ToolbarButton>
                </div>
              </div>
            </div>
          ) : null}

          {snippets.length > 0 ? (
            <div className="admin-rich-text-snippets">
              <span>Quick Insert</span>
              <div className="admin-inline-actions">
                {snippets.map((snippet) => (
                  <ToolbarButton disabled={disabled} key={snippet.label} onClick={() => insertSnippet(snippet)}>
                    {snippet.label}
                  </ToolbarButton>
                ))}
              </div>
            </div>
          ) : null}

          {helperText ? <p className="admin-note admin-rich-text-help">{helperText}</p> : null}

          <div
            ref={editorRef}
            aria-label={label}
            className={`admin-rich-text-canvas ${compact ? 'admin-rich-text-canvas--compact' : ''} ${
              disabled ? 'admin-rich-text-canvas--disabled' : ''
            }`.trim()}
            contentEditable={!disabled}
            data-placeholder={placeholder}
            suppressContentEditableWarning
            onBlur={syncValue}
            onDrop={handleDrop}
            onFocus={showToolbar}
            onInput={() => syncValue({ cleanDom: false })}
            onKeyDown={handleCanvasKeyDown}
            onPaste={handlePaste}
          />
        </>
      ) : (
        <>
          {snippets.length > 0 ? (
            <div className="admin-rich-text-snippets">
              <span>Quick Insert</span>
              <div className="admin-inline-actions">
                {snippets.map((snippet) => (
                  <ToolbarButton disabled={disabled} key={snippet.label} onClick={() => insertSnippet(snippet)}>
                    {snippet.label}
                  </ToolbarButton>
                ))}
              </div>
            </div>
          ) : null}

          {helperText ? <p className="admin-note admin-rich-text-help">{helperText}</p> : null}

          <label className="admin-field admin-field--wide">
            <span>HTML Source</span>
            <textarea
              disabled={disabled}
              rows={htmlSourceRows}
              value={value ?? ''}
              onChange={(event) => onChange(event.target.value)}
              onFocus={showToolbar}
              onPaste={handleSourcePaste}
            />
          </label>
        </>
      )}
    </div>
  )
}
