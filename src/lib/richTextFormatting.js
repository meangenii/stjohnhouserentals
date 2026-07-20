export const RICH_TEXT_BLOCK_OPTIONS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'H1', value: 'h1' },
  { label: 'H2', value: 'h2' },
  { label: 'H3', value: 'h3' },
  { label: 'H4', value: 'h4' },
  { label: 'H5', value: 'h5' },
  { label: 'H6', value: 'h6' },
]

const REM_TO_PX = 16
const PX_TO_PT = 72 / 96
const MIN_RICH_TEXT_FONT_SIZE_PX = 8
const MAX_RICH_TEXT_FONT_SIZE_PX = 96
const RICH_TEXT_FONT_SIZE_VALUE_PATTERN = /^(\d+(?:\.\d+)?)(px|rem|em|pt)$/

function formatFontSizeOptionLabel(label, value) {
  const pt = formatPointValue(estimateFontSizePt(value))
  return `${label} (${pt}pt)`
}

function estimateFontSizePx(value) {
  const match = String(value ?? '').match(RICH_TEXT_FONT_SIZE_VALUE_PATTERN)

  if (!match) {
    return 0
  }

  const numericValue = Number(match[1])
  const unit = match[2]

  if (unit === 'px') {
    return numericValue
  }

  if (unit === 'pt') {
    return numericValue * (96 / 72)
  }

  return numericValue * REM_TO_PX
}

function estimateFontSizePt(value) {
  return estimateFontSizePx(value) * PX_TO_PT
}

function formatPointValue(value) {
  const roundedValue = Math.round(value * 100) / 100
  return Number.isInteger(roundedValue) ? String(roundedValue) : String(roundedValue).replace(/0+$/, '').replace(/\.$/, '')
}

export const RICH_TEXT_FONT_SIZE_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Small', value: '10.5pt' },
  { label: 'Body', value: '12pt' },
  { label: 'Large', value: '13.5pt' },
  { label: 'XL', value: '15pt' },
  { label: '2XL', value: '18pt' },
  { label: '3XL', value: '22.5pt' },
  { label: '4XL', value: '27pt' },
].map((option) => ({
  ...option,
  label: option.value === 'default' ? option.label : formatFontSizeOptionLabel(option.label, option.value),
}))

function unwrapElement(element) {
  const parent = element.parentNode

  if (!parent) {
    return
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }

  parent.removeChild(element)
}

export function normalizeRichTextFontSize(value = '') {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  const match = normalizedValue.match(RICH_TEXT_FONT_SIZE_VALUE_PATTERN)

  if (!match) {
    return ''
  }

  const numericValue = Number(match[1])
  const unit = match[2]
  const approximatePx = estimateFontSizePx(normalizedValue)

  if (!Number.isFinite(numericValue) || numericValue <= 0 || approximatePx < MIN_RICH_TEXT_FONT_SIZE_PX || approximatePx > MAX_RICH_TEXT_FONT_SIZE_PX) {
    return ''
  }

  return `${numericValue}${unit}`
}

export function normalizeRichTextFontSizeAsPoints(value = '') {
  const normalizedValue = normalizeRichTextFontSize(value)

  if (!normalizedValue) {
    return ''
  }

  return `${formatPointValue(estimateFontSizePt(normalizedValue))}pt`
}

function getNodeOwnerElement(node) {
  if (!node) {
    return null
  }

  return node.nodeType === 1 ? node : node.parentElement
}

function isRangeWithinRoot(root, range) {
  if (!root || !range) {
    return false
  }

  const startElement = getNodeOwnerElement(range.startContainer)
  const endElement = getNodeOwnerElement(range.endContainer)

  return startElement instanceof Element && endElement instanceof Element && root.contains(startElement) && root.contains(endElement)
}

function getSelectionRangeInRoot(root) {
  if (!root || typeof window === 'undefined') {
    return null
  }

  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  const commonAncestor =
    range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement

  if (!(commonAncestor instanceof Element) || !root.contains(commonAncestor)) {
    return null
  }

  return range
}

function getSelectionElement(root) {
  const range = getSelectionRangeInRoot(root)

  if (!range) {
    return null
  }

  const selectionNode =
    range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement

  return selectionNode instanceof Element && root.contains(selectionNode) ? selectionNode : null
}

export function elementIntersectsRange(element, range) {
  const elementRange = document.createRange()
  elementRange.selectNodeContents(element)

  return (
    range.compareBoundaryPoints(Range.END_TO_START, elementRange) === -1 &&
    range.compareBoundaryPoints(Range.START_TO_END, elementRange) === 1
  )
}

function selectNodeContents(node) {
  if (!node || typeof window === 'undefined') {
    return
  }

  const selection = window.getSelection()

  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getSelectionBlockElement(root) {
  const selectionElement = getSelectionElement(root)

  if (!selectionElement) {
    return null
  }

  const blockElement = selectionElement.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6')
  return blockElement instanceof HTMLElement && root.contains(blockElement) ? blockElement : null
}

export function captureRichTextSelectionRange(root) {
  const range = getSelectionRangeInRoot(root)
  return range ? range.cloneRange() : null
}

export function getSelectedBlockElements(root, range) {
  if (!root || !range) {
    return []
  }

  const selectedBlocks = Array.from(root.children).filter((child) => elementIntersectsRange(child, range))

  if (selectedBlocks.length > 0 || !range.collapsed) {
    return selectedBlocks
  }

  const selectionBlock = getSelectionBlockElement(root)
  return selectionBlock?.parentElement === root ? [selectionBlock] : []
}

export function blockHasLineBreak(block) {
  return Boolean(block?.querySelector?.('br'))
}

function splitNodesAtLineBreaks(nodes) {
  const groupedNodes = [[]]

  Array.from(nodes).forEach((node) => {
    if (node.nodeName === 'BR') {
      groupedNodes.push([])
      return
    }

    if (node.querySelector?.('br')) {
      const childGroups = splitNodesAtLineBreaks(node.childNodes)

      childGroups.forEach((childGroup, index) => {
        if (index > 0) {
          groupedNodes.push([])
        }

        if (childGroup.length === 0) {
          return
        }

        const wrapper = node.cloneNode(false)
        childGroup.forEach((childNode) => wrapper.append(childNode))
        groupedNodes[groupedNodes.length - 1].push(wrapper)
      })
      return
    }

    groupedNodes[groupedNodes.length - 1].push(node.cloneNode(true))
  })

  return groupedNodes
}

function cloneBlockShell(block) {
  const nextBlock = document.createElement(block.tagName.toLowerCase())

  Array.from(block.attributes).forEach((attribute) => {
    if (attribute.name !== 'id') {
      nextBlock.setAttribute(attribute.name, attribute.value)
    }
  })

  return nextBlock
}

export function splitBlockAtLineBreaks(block) {
  if (!blockHasLineBreak(block)) {
    return []
  }

  const groupedNodes = splitNodesAtLineBreaks(block.childNodes)
  const fragment = document.createDocumentFragment()
  const nextBlocks = groupedNodes.map((nodes) => {
    const nextBlock = cloneBlockShell(block)

    if (nodes.length > 0) {
      nodes.forEach((node) => nextBlock.append(node))
    } else {
      nextBlock.append(document.createElement('br'))
    }

    fragment.append(nextBlock)
    return nextBlock
  })

  block.replaceWith(fragment)
  return nextBlocks
}

// Resolves a collapsed range's caret to the specific node it sits on/in, so it can be
// matched against original (pre-clone) nodes during the recursive split below.
function resolveCollapsedAnchorNode(range) {
  const container = range.startContainer

  if (container.nodeType === 3) {
    return container
  }

  const index = Math.min(range.startOffset, Math.max(container.childNodes.length - 1, 0))
  return container.childNodes[index] ?? container
}

function nodeIntersectsRange(node, range) {
  const nodeRange = document.createRange()
  nodeRange.selectNode(node)

  return (
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) === -1 &&
    range.compareBoundaryPoints(Range.START_TO_END, nodeRange) === 1
  )
}

// Same recursive grouping as splitNodesAtLineBreaks (splits at every <br>, including ones
// nested inside inline wrappers like a font-size <span>, by cloning and re-splitting the
// wrapper per line) - but alongside each cloned line it also flags whether the selection
// touches that line, checked against the ORIGINAL (pre-clone) nodes so nesting depth can't
// throw off the check.
function splitNodesAtLineBreaksWithSelection(nodes, range, collapsedAnchorNode) {
  const groups = [[]]
  const selectedFlags = [false]

  Array.from(nodes).forEach((node) => {
    if (node.nodeName === 'BR') {
      groups.push([])
      selectedFlags.push(false)
      return
    }

    if (node.querySelector?.('br')) {
      const child = splitNodesAtLineBreaksWithSelection(node.childNodes, range, collapsedAnchorNode)

      child.groups.forEach((childGroup, index) => {
        if (index > 0) {
          groups.push([])
          selectedFlags.push(false)
        }

        if (childGroup.length === 0) {
          return
        }

        const wrapper = node.cloneNode(false)
        childGroup.forEach((childNode) => wrapper.append(childNode))
        groups[groups.length - 1].push(wrapper)

        if (child.selectedFlags[index]) {
          selectedFlags[selectedFlags.length - 1] = true
        }
      })
      return
    }

    groups[groups.length - 1].push(node.cloneNode(true))

    const isMatch = range.collapsed
      ? node === collapsedAnchorNode || node.contains(collapsedAnchorNode)
      : nodeIntersectsRange(node, range)

    if (isMatch) {
      selectedFlags[selectedFlags.length - 1] = true
    }
  })

  return { groups, selectedFlags }
}

function buildLineBlockFromGroup(block, nodes) {
  const nextBlock = cloneBlockShell(block)

  if (nodes.length > 0) {
    nodes.forEach((node) => nextBlock.append(node))
  } else {
    nextBlock.append(document.createElement('br'))
  }

  return nextBlock
}

function buildJoinedBlockFromGroups(block, groupsSlice) {
  const nextBlock = cloneBlockShell(block)

  groupsSlice.forEach((nodes, index) => {
    if (index > 0) {
      nextBlock.append(document.createElement('br'))
    }

    nodes.forEach((node) => nextBlock.append(node))
  })

  return nextBlock
}

// Splits only the line(s) touched by the selection out of a <br>-joined block, leaving the
// rest of the block's lines joined together exactly as they were - regardless of whether any
// of the block's <br>s are nested inside inline formatting (bold, links, font-size spans).
export function splitBlockAtLineBreaksInSelection(block, range) {
  if (!blockHasLineBreak(block)) {
    return []
  }

  const collapsedAnchorNode = range.collapsed ? resolveCollapsedAnchorNode(range) : null
  const { groups, selectedFlags } = splitNodesAtLineBreaksWithSelection(block.childNodes, range, collapsedAnchorNode)

  const selectedIndexes = selectedFlags.map((flag, index) => (flag ? index : -1)).filter((index) => index !== -1)

  if (selectedIndexes.length === 0) {
    // The selection couldn't be resolved to a specific line (e.g. a collapsed caret sitting
    // exactly on a <br>) - isolate just the first line rather than blowing up the whole block.
    selectedIndexes.push(0)
  }

  const minIndex = Math.min(...selectedIndexes)
  const maxIndex = Math.max(...selectedIndexes)

  const fragment = document.createDocumentFragment()
  const nextBlocks = []

  if (minIndex > 0) {
    const beforeBlock = buildJoinedBlockFromGroups(block, groups.slice(0, minIndex))
    fragment.append(beforeBlock)
    nextBlocks.push(beforeBlock)
  }

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const lineBlock = buildLineBlockFromGroup(block, groups[index])
    fragment.append(lineBlock)
    nextBlocks.push(lineBlock)
  }

  if (maxIndex < groups.length - 1) {
    const afterBlock = buildJoinedBlockFromGroups(block, groups.slice(maxIndex + 1))
    fragment.append(afterBlock)
    nextBlocks.push(afterBlock)
  }

  block.replaceWith(fragment)
  return nextBlocks
}

// Whether the current selection sits entirely inside a single block that already
// contains manual line breaks - i.e. whether "Tighten Lines" would currently act as
// "Untighten Lines". Works with both a real text selection and a plain collapsed
// cursor placed inside the block, since untightening a single block doesn't need a
// multi-character selection to know what to do.
export function isTightenedBlockSelection(root) {
  const range = captureRichTextSelectionRange(root)

  if (!range) {
    return false
  }

  const selectedBlocks = getSelectedBlockElements(root, range)
  return selectedBlocks.length === 1 && blockHasLineBreak(selectedBlocks[0])
}

// Applies "Tighten Lines" (merge 2+ selected blocks into one, joined by <br>) or
// "Untighten Lines" (split only the selected line(s) of a <br>-joined block back
// out into separate blocks, leaving the rest of the block's lines joined), picking
// whichever applies to the current selection. Returns true if it changed anything,
// so the caller knows whether to sync/publish the new value.
export function tightenOrUntightenSelectedLines(root) {
  const range = captureRichTextSelectionRange(root)

  if (!range) {
    return false
  }

  const selectedBlocks = getSelectedBlockElements(root, range)

  if (selectedBlocks.length === 1 && blockHasLineBreak(selectedBlocks[0])) {
    return splitBlockAtLineBreaksInSelection(selectedBlocks[0], range).length > 0
  }

  if (range.collapsed || selectedBlocks.length < 2) {
    return false
  }

  const anchorBlock = selectedBlocks[0]

  selectedBlocks.slice(1).forEach((block) => {
    anchorBlock.append(document.createElement('br'))

    while (block.firstChild) {
      anchorBlock.append(block.firstChild)
    }

    block.remove()
  })

  return true
}

function collectTextOffset(root, target, targetOffset) {
  let consumed = 0
  let found = false
  let resolvedOffset = 0

  function walk(node) {
    if (found) {
      return
    }

    if (node === target) {
      resolvedOffset = consumed + targetOffset
      found = true
      return
    }

    if (node.nodeType === 3) {
      consumed += node.textContent.length
      return
    }

    Array.from(node.childNodes).forEach(walk)
  }

  walk(root)
  return found ? resolvedOffset : consumed
}

export function captureCaretOffset(root) {
  const range = getSelectionRangeInRoot(root)

  if (!range) {
    return null
  }

  return {
    start: collectTextOffset(root, range.startContainer, range.startOffset),
    end: collectTextOffset(root, range.endContainer, range.endOffset),
  }
}

function locatePointAtOffset(root, offset) {
  let remaining = offset
  let lastTextNode = null

  function walk(node) {
    if (node.nodeType === 3) {
      lastTextNode = node

      if (remaining <= node.textContent.length) {
        return { node, offset: remaining }
      }

      remaining -= node.textContent.length
      return null
    }

    for (const child of Array.from(node.childNodes)) {
      const result = walk(child)

      if (result) {
        return result
      }
    }

    return null
  }

  const point = walk(root)

  if (point) {
    return point
  }

  if (lastTextNode) {
    return { node: lastTextNode, offset: lastTextNode.textContent.length }
  }

  return { node: root, offset: 0 }
}

export function restoreCaretOffset(root, caretOffsets) {
  if (!root || !caretOffsets || typeof window === 'undefined') {
    return false
  }

  const selection = window.getSelection()

  if (!selection) {
    return false
  }

  try {
    const startPoint = locatePointAtOffset(root, caretOffsets.start)
    const endPoint = locatePointAtOffset(root, caretOffsets.end)
    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    selection.removeAllRanges()
    selection.addRange(range)
    return true
  } catch {
    return false
  }
}

export function restoreRichTextSelectionRange(root, savedRange) {
  if (!root || !savedRange || typeof window === 'undefined' || !isRangeWithinRoot(root, savedRange)) {
    return false
  }

  const selection = window.getSelection()

  if (!selection) {
    return false
  }

  try {
    if (typeof root.focus === 'function') {
      root.focus()
    }

    selection.removeAllRanges()
    selection.addRange(savedRange.cloneRange())
    return true
  } catch {
    return false
  }
}

export function insertLinkAtCollapsedSelection(root, href, text = '') {
  const normalizedHref = String(href ?? '').trim()
  const normalizedText = String(text ?? '').trim() || normalizedHref
  const range = getSelectionRangeInRoot(root)

  if (!root || !normalizedHref || !range || !range.collapsed || typeof window === 'undefined') {
    return null
  }

  const anchor = document.createElement('a')
  anchor.setAttribute('href', normalizedHref)
  anchor.textContent = normalizedText
  range.insertNode(anchor)
  range.setStartAfter(anchor)
  range.collapse(true)

  const selection = window.getSelection()

  if (selection) {
    selection.removeAllRanges()
    selection.addRange(range)
  }

  return anchor
}

export function placeCaretAtPoint(root, clientX, clientY) {
  if (!root || typeof document === 'undefined' || typeof window === 'undefined') {
    return false
  }

  let range = null

  if (typeof document.caretRangeFromPoint === 'function') {
    range = document.caretRangeFromPoint(clientX, clientY)
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const caretPosition = document.caretPositionFromPoint(clientX, clientY)

    if (caretPosition?.offsetNode) {
      range = document.createRange()
      range.setStart(caretPosition.offsetNode, caretPosition.offset)
      range.collapse(true)
    }
  }

  if (!range || !isRangeWithinRoot(root, range)) {
    const bounds = typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null
    const pointIsInsideRoot =
      bounds && clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom

    if (pointIsInsideRoot) {
      if (typeof root.focus === 'function') {
        root.focus()
      }

      selectNodeContents(root)
      return true
    }

    return false
  }

  const selection = window.getSelection()

  if (!selection) {
    return false
  }

  if (typeof root.focus === 'function') {
    root.focus()
  }

  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

function surroundRangeWithElement(range, wrapper) {
  try {
    range.surroundContents(wrapper)
  } catch {
    const fragment = range.extractContents()
    wrapper.appendChild(fragment)
    range.insertNode(wrapper)
  }
}

function cleanupFontSizeSpans(root) {
  Array.from(root.querySelectorAll('span[style]')).forEach((span) => {
    const normalizedSize = normalizeRichTextFontSize(span.style.fontSize)

    if (normalizedSize) {
      span.style.fontSize = normalizedSize
    } else {
      span.style.removeProperty('font-size')
    }

    if (!span.getAttribute('style')) {
      span.removeAttribute('style')
    }

    if (span.attributes.length === 0) {
      unwrapElement(span)
    }
  })
}

function clearRichTextFontSize(root, range) {
  let changed = false
  const selectedSpans = Array.from(root.querySelectorAll('span[style]')).filter(
    (span) => normalizeRichTextFontSize(span.style.fontSize) && elementIntersectsRange(span, range),
  )
  const anchorElement = getSelectionElement(root)
  const anchorSizedSpan = anchorElement?.closest?.('span[style]')

  if (selectedSpans.length === 0 && anchorSizedSpan instanceof HTMLElement && root.contains(anchorSizedSpan)) {
    selectedSpans.push(anchorSizedSpan)
  }

  selectedSpans.forEach((span) => {
    span.style.removeProperty('font-size')

    if (!span.getAttribute('style')) {
      span.removeAttribute('style')
    }

    if (span.attributes.length === 0) {
      unwrapElement(span)
    }

    changed = true
  })

  if (changed) {
    cleanupFontSizeSpans(root)
  }

  return changed
}

export function readRichTextSelectionState(root, { defaultBlockTag = 'p', fixedBlockTag = '' } = {}) {
  const formattingState = {
    blockTag: fixedBlockTag || defaultBlockTag,
    bold: false,
    fontSize: 'default',
    italic: false,
    underline: false,
  }

  const range = getSelectionRangeInRoot(root)

  if (!range) {
    return formattingState
  }

  try {
    formattingState.bold = typeof document.queryCommandState === 'function' ? document.queryCommandState('bold') : false
    formattingState.italic = typeof document.queryCommandState === 'function' ? document.queryCommandState('italic') : false
    formattingState.underline = typeof document.queryCommandState === 'function' ? document.queryCommandState('underline') : false
  } catch {
    formattingState.bold = false
    formattingState.italic = false
    formattingState.underline = false
  }

  const selectionElement = getSelectionElement(root)

  if (!selectionElement) {
    return formattingState
  }

  if (!fixedBlockTag) {
    const blockElement = selectionElement.closest('p, h1, h2, h3, h4, h5, h6')

    if (blockElement && root.contains(blockElement)) {
      formattingState.blockTag = blockElement.tagName.toLowerCase()
    }
  }

  const sizedSpan = selectionElement.closest('span[style]')

  if (sizedSpan && root.contains(sizedSpan)) {
    const normalizedSize = normalizeRichTextFontSize(sizedSpan.style.fontSize)

    if (normalizedSize) {
      formattingState.fontSize = normalizedSize
    }
  }

  return formattingState
}

export function applyRichTextFontSize(root, nextValue, { collapsedBehavior = 'selection' } = {}) {
  if (!root) {
    return false
  }

  const range = getSelectionRangeInRoot(root)

  if (!range) {
    return false
  }

  if (nextValue === 'default') {
    return clearRichTextFontSize(root, range)
  }

  const normalizedValue = normalizeRichTextFontSize(nextValue)

  if (!normalizedValue) {
    return false
  }

  const wrapper = document.createElement('span')
  wrapper.style.fontSize = normalizedValue

  if (range.collapsed) {
    const anchorElement = getSelectionElement(root)
    const anchorSizedSpan = anchorElement?.closest?.('span[style]')

    if (!(anchorSizedSpan instanceof HTMLElement) || !root.contains(anchorSizedSpan)) {
      if (collapsedBehavior === 'block') {
        const blockElement = getSelectionBlockElement(root)

        if (!(blockElement instanceof HTMLElement)) {
          return false
        }

        const blockWrapper = document.createElement('span')
        blockWrapper.style.fontSize = normalizedValue

        while (blockElement.firstChild) {
          blockWrapper.appendChild(blockElement.firstChild)
        }

        blockElement.appendChild(blockWrapper)
        cleanupFontSizeSpans(root)
        selectNodeContents(blockWrapper)
        return true
      }

      if (collapsedBehavior !== 'root') {
        return false
      }

      if (!root.firstChild) {
        return false
      }

      const wrapperAtRoot = document.createElement('span')
      wrapperAtRoot.style.fontSize = normalizedValue

      while (root.firstChild) {
        wrapperAtRoot.appendChild(root.firstChild)
      }

      root.appendChild(wrapperAtRoot)
      cleanupFontSizeSpans(root)
      selectNodeContents(wrapperAtRoot)
      return true
    }

    anchorSizedSpan.style.fontSize = normalizedValue
    cleanupFontSizeSpans(root)
    return true
  }

  surroundRangeWithElement(range, wrapper)
  cleanupFontSizeSpans(root)
  selectNodeContents(wrapper)
  return true
}
