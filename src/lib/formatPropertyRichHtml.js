import { normalizeSiteHtml } from './normalizeSiteHtml'

const PROPERTY_COMPACT_BLOCK_MARKERS = [
  /base nightly rates vary/i,
  /please visit vrbo/i,
  /to view more information, photos and reviews/i,
  /to book direct/i,
]
const REVIEW_TITLE_WRAPPER_TAGS = new Set(['A', 'B', 'EM', 'I', 'SPAN', 'STRONG'])

function createCompactLine(documentNode, element) {
  const line = documentNode.createElement('div')
  line.className = 'property-compact-line'

  while (element.firstChild) {
    line.append(element.firstChild)
  }

  return line
}

function createCompactGroup(documentNode, className = '') {
  const group = documentNode.createElement('div')
  group.className = ['property-compact-group', className].filter(Boolean).join(' ')
  return group
}

function getElementTextContent(element) {
  return element.textContent.replace(/\s+/g, ' ').trim()
}

function getMeaningfulChildNodes(node) {
  return Array.from(node.childNodes).filter((childNode) => {
    if (childNode.nodeType === 3) {
      return childNode.textContent.trim().length > 0
    }

    return childNode.nodeType === 1
  })
}

function isVrboIntroLine(textContent) {
  return /to view more information, photos and reviews/i.test(textContent) || /please visit vrbo/i.test(textContent)
}

function isDirectBookingIntroLine(textContent) {
  return /to book direct/i.test(textContent)
}

function getCompactBlockStartIndex(elements) {
  return elements.findIndex((element) => {
    if (element.tagName !== 'P') {
      return false
    }

    const textContent = getElementTextContent(element)

    if (!textContent) {
      return false
    }

    if (PROPERTY_COMPACT_BLOCK_MARKERS.some((pattern) => pattern.test(textContent))) {
      return true
    }

    return Boolean(element.querySelector('a[href*="vrbo.com"], a[href^="mailto:"]'))
  })
}

function moveElementContents(sourceElement, targetElement) {
  while (sourceElement.firstChild) {
    targetElement.append(sourceElement.firstChild)
  }
}

function unwrapReviewTitleFormatting(titleElement) {
  titleElement.querySelectorAll('strong, b').forEach((wrapper) => {
    const parent = wrapper.parentNode

    if (!parent) {
      return
    }

    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper)
    }

    wrapper.remove()
  })
}

function isReviewSeparatorElement(element) {
  return element?.tagName === 'P' && !getElementTextContent(element)
}

function hasTitleWrapperStructure(node) {
  const meaningfulChildNodes = getMeaningfulChildNodes(node)

  if (meaningfulChildNodes.length === 0) {
    return false
  }

  return meaningfulChildNodes.every((childNode) => {
    if (childNode.nodeType === 3) {
      return childNode.textContent.trim().length > 0
    }

    if (!REVIEW_TITLE_WRAPPER_TAGS.has(childNode.tagName)) {
      return false
    }

    return hasTitleWrapperStructure(childNode)
  })
}

function isReviewTitleParagraph(element) {
  if (element?.tagName !== 'P' || !getElementTextContent(element)) {
    return false
  }

  const meaningfulChildNodes = getMeaningfulChildNodes(element)

  if (meaningfulChildNodes.length !== 1 || meaningfulChildNodes[0].nodeType !== 1) {
    return false
  }

  return hasTitleWrapperStructure(element)
}

function isReviewTitleElement(element) {
  if (!element) {
    return false
  }

  if (/^H[4-6]$/i.test(element.tagName)) {
    return true
  }

  return isReviewTitleParagraph(element)
}

function flushReviewEntry(reviewList, entry) {
  if (!entry) {
    return null
  }

  if (entry.querySelector('.property-review-title, .property-review-body')) {
    reviewList.append(entry)
  }

  return null
}

function transformPropertyReviews(root, documentNode) {
  const elements = Array.from(root.children)

  if (!elements.length) {
    return
  }

  const reviewList = documentNode.createElement('div')
  reviewList.className = 'property-review-list'
  let currentEntry = null

  elements.forEach((element) => {
    if (!element) {
      return
    }

    if (isReviewSeparatorElement(element)) {
      currentEntry = flushReviewEntry(reviewList, currentEntry)
      element.remove()
      return
    }

    if (isReviewTitleElement(element)) {
      currentEntry = flushReviewEntry(reviewList, currentEntry)
      currentEntry = documentNode.createElement('article')
      currentEntry.className = 'property-review-entry'

      const title = documentNode.createElement('h3')
      title.className = 'property-review-title'
      moveElementContents(element, title)
      unwrapReviewTitleFormatting(title)
      currentEntry.append(title)
      element.remove()
      return
    }

    if (element.tagName === 'P') {
      currentEntry ??= documentNode.createElement('article')
      currentEntry.className = 'property-review-entry'

      const body = documentNode.createElement('p')
      body.className = 'property-review-body'
      moveElementContents(element, body)
      currentEntry.append(body)
      element.remove()
      return
    }

    currentEntry ??= documentNode.createElement('article')
    currentEntry.className = 'property-review-entry'

    const body = documentNode.createElement('div')
    body.className = 'property-review-body'
    moveElementContents(element, body)
    currentEntry.append(body)
    element.remove()
  })

  flushReviewEntry(reviewList, currentEntry)

  if (!reviewList.childElementCount) {
    return
  }

  root.innerHTML = ''
  root.append(reviewList)
}

function transformPropertySectionLists(root, documentNode) {
  const elements = Array.from(root.children)

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]

    if (!element || !/^H[34]$/i.test(element.tagName)) {
      continue
    }

    const listItems = []
    let scanIndex = index + 1

    while (scanIndex < elements.length) {
      const candidate = elements[scanIndex]

      if (!candidate) {
        scanIndex += 1
        continue
      }

      if (/^H[1-6]$/i.test(candidate.tagName)) {
        break
      }

      if (candidate.tagName !== 'P') {
        break
      }

      const textContent = getElementTextContent(candidate)

      if (!textContent && !candidate.querySelector('a, strong, em, span, br')) {
        candidate.remove()
        scanIndex += 1
        continue
      }

      listItems.push(candidate)
      scanIndex += 1
    }

    if (!listItems.length) {
      continue
    }

    const list = documentNode.createElement('ul')
    list.className = 'property-section-list'

    listItems.forEach((item) => {
      const listItem = documentNode.createElement('li')

      while (item.firstChild) {
        listItem.append(item.firstChild)
      }

      item.replaceWith(listItem)
      list.append(listItem)
    })

    element.after(list)
  }
}

export function formatPropertyRichHtml(html, { compactTail = false, listSections = false, reviewEntries = false } = {}) {
  const normalizedHtml = normalizeSiteHtml(html)

  if ((!compactTail && !listSections && !reviewEntries) || !normalizedHtml.trim() || typeof DOMParser === 'undefined') {
    return normalizedHtml
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return normalizedHtml
  }

  if (listSections) {
    transformPropertySectionLists(root, documentNode)
  }

  if (reviewEntries) {
    transformPropertyReviews(root, documentNode)
  }

  if (!compactTail) {
    return root.innerHTML
  }

  const elements = Array.from(root.children)
  const compactStartIndex = getCompactBlockStartIndex(elements)

  if (compactStartIndex === -1 || compactStartIndex >= elements.length - 1) {
    return normalizedHtml
  }

  const compactBlock = documentNode.createElement('div')
  compactBlock.className = 'property-compact-block'
  const tailElements = elements.slice(compactStartIndex)

  for (let index = 0; index < tailElements.length; index += 1) {
    const currentElement = tailElements[index]

    if (!currentElement || currentElement.tagName !== 'P') {
      if (currentElement?.parentNode === root) {
        compactBlock.append(currentElement)
      }
      continue
    }

    const textContent = getElementTextContent(currentElement)
    const nextElement = tailElements[index + 1]

    if ((isVrboIntroLine(textContent) || isDirectBookingIntroLine(textContent)) && nextElement?.tagName === 'P') {
      const group = createCompactGroup(documentNode, 'property-compact-group--pair')
      group.append(createCompactLine(documentNode, currentElement))
      currentElement.remove()
      group.append(createCompactLine(documentNode, nextElement))
      nextElement.remove()
      compactBlock.append(group)
      index += 1
      continue
    }

    const group = createCompactGroup(documentNode, 'property-compact-group--single')
    group.append(createCompactLine(documentNode, currentElement))
    currentElement.remove()
    compactBlock.append(group)
  }

  root.append(compactBlock)
  return root.innerHTML
}
