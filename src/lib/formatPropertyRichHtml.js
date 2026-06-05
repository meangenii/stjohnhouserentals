import { normalizeSiteHtml } from './normalizeSiteHtml'

const PROPERTY_COMPACT_BLOCK_MARKERS = [
  /base nightly rates vary/i,
  /please visit vrbo/i,
  /to view more information, photos and reviews/i,
  /to book direct/i,
]

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

export function formatPropertyRichHtml(html, { compactTail = false, listSections = false } = {}) {
  const normalizedHtml = normalizeSiteHtml(html)

  if ((!compactTail && !listSections) || !normalizedHtml.trim() || typeof DOMParser === 'undefined') {
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
