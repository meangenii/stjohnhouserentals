export const RICH_TEXT_BLOCK_OPTIONS = [
  { label: 'Paragraph', value: 'p' },
  { label: 'H1', value: 'h1' },
  { label: 'H2', value: 'h2' },
  { label: 'H3', value: 'h3' },
  { label: 'H4', value: 'h4' },
  { label: 'H5', value: 'h5' },
  { label: 'H6', value: 'h6' },
]

export const RICH_TEXT_FONT_SIZE_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'Small', value: '0.875rem' },
  { label: 'Body', value: '1rem' },
  { label: 'Large', value: '1.125rem' },
  { label: 'XL', value: '1.25rem' },
  { label: '2XL', value: '1.5rem' },
  { label: '3XL', value: '1.875rem' },
  { label: '4XL', value: '2.25rem' },
]

export const ALLOWED_RICH_TEXT_FONT_SIZE_VALUES = new Set(
  RICH_TEXT_FONT_SIZE_OPTIONS.map((option) => option.value).filter((value) => value !== 'default'),
)

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

function normalizeRichTextFontSize(value = '') {
  const normalizedValue = String(value ?? '').trim().toLowerCase()
  return ALLOWED_RICH_TEXT_FONT_SIZE_VALUES.has(normalizedValue) ? normalizedValue : ''
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

function elementIntersectsRange(element, range) {
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

export function captureRichTextSelectionRange(root) {
  const range = getSelectionRangeInRoot(root)
  return range ? range.cloneRange() : null
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
