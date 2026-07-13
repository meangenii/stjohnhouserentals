import { normalizeSiteHtml } from './normalizeSiteHtml'

const PROPERTY_COMPACT_BLOCK_MARKERS = [
  /base nightly rates vary/i,
  /booking contact/i,
  /please visit vrbo/i,
  /rental and cancellation policy/i,
  /to view more information, photos and reviews/i,
  /to book direct/i,
]
const PROPERTY_BOOKING_START_PATTERNS = [/booking contact/i, /to book direct/i, /to view more information, photos and reviews/i, /please visit vrbo/i]
const PROPERTY_BOOKING_DETAIL_PATTERNS = [
  /email us/i,
  /call us/i,
  /office\/reservations/i,
  /toll-?free/i,
  /\bfax\b/i,
  /\bavailability\b/i,
  /booking questions/i,
  /desired schedule/i,
  /holiday rates/i,
  /^po box\b/i,
]
const PROPERTY_POLICY_HEADING_PATTERNS = [/rental and cancellation policy/i]
const REVIEW_TITLE_WRAPPER_TAGS = new Set(['A', 'B', 'EM', 'I', 'SPAN', 'STRONG'])
const RATE_TITLE_LINE_PATTERN = /\brates?\b/i
const RATE_TITLE_LINE_EXCLUSIONS = [
  /rates are based/i,
  /subject to change/i,
  /base nightly rates vary/i,
  /rental and cancellation policy/i,
  /booking contact/i,
]
const RATE_SECTION_END_PATTERNS = [/booking contact/i, /rental and cancellation policy/i]
const RATE_PRIMARY_HEADING_PATTERNS = [
  /season/i,
  /^summer(?:\/fall)?$/i,
  /^winter(?:\/spring)?$/i,
  /^spring$/i,
  /^fall$/i,
  /^winter$/i,
  /^summer$/i,
  /^off-?season$/i,
  /^holidays?$/i,
  /^holiday rates$/i,
  /^holiday season$/i,
]
const RATE_HEADING_WORD_PATTERNS = [
  /thanksgiving/i,
  /christmas/i,
  /new year/i,
  /presidents?/i,
  /easter/i,
  /suite/i,
  /entire villa/i,
  /whole house/i,
]
const RATE_DATE_LINE_PATTERN =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|aug|sept|oct|nov|dec)\b/i

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

function endsWithColon(textContent) {
  return /:\s*$/.test(textContent)
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

function mergePropertyLeadInLinkParagraphs(root, documentNode) {
  const elements = Array.from(root.children)

  for (let index = 0; index < elements.length - 1; index += 1) {
    const currentElement = elements[index]
    const nextElement = elements[index + 1]

    if (currentElement?.tagName !== 'P' || nextElement?.tagName !== 'P') {
      continue
    }

    const currentText = getElementTextContent(currentElement)

    if (!endsWithColon(currentText) || !nextElement.querySelector('a[href]')) {
      continue
    }

    currentElement.append(documentNode.createElement('br'))
    moveElementContents(nextElement, currentElement)
    nextElement.remove()
    elements[index + 1] = currentElement
  }
}

function unwrapFormatting(element, selectors = 'strong, b') {
  element.querySelectorAll(selectors).forEach((wrapper) => {
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

function unwrapReviewTitleFormatting(titleElement) {
  unwrapFormatting(titleElement)
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
  transformEmbeddedPropertySectionParagraphs(root, documentNode)
  const elements = Array.from(root.children)

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]

    if (!element || !/^H[2-4]$/i.test(element.tagName)) {
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

      item.remove()
      list.append(listItem)
    })

    element.after(list)
  }

  wrapPropertyParagraphRunsAsLists(root, documentNode)
}

function extractLineNodesFromElement(element, documentNode) {
  const lines = []
  let line = documentNode.createElement('div')

  while (element.firstChild) {
    const childNode = element.firstChild

    if (childNode.nodeType === 1 && childNode.tagName === 'BR') {
      if (line.childNodes.length > 0) {
        lines.push(line)
      }

      line = documentNode.createElement('div')
      childNode.remove()
      continue
    }

    line.append(childNode)
  }

  if (line.childNodes.length > 0) {
    lines.push(line)
  }

  return lines
}

function cloneLineNodesFromElement(element, documentNode) {
  const clone = element.cloneNode(true)
  return extractLineNodesFromElement(clone, documentNode)
}

function isRateTitleLine(textContent) {
  return RATE_TITLE_LINE_PATTERN.test(textContent) && !RATE_TITLE_LINE_EXCLUSIONS.some((pattern) => pattern.test(textContent))
}

function isRateSectionEndLine(textContent) {
  return RATE_SECTION_END_PATTERNS.some((pattern) => pattern.test(textContent))
}

function isRateDateLine(textContent) {
  return RATE_DATE_LINE_PATTERN.test(textContent)
}

function isRateMinimumLine(textContent) {
  return /night minimum/i.test(textContent)
}

function isRateFeeLine(textContent) {
  return /^\+/.test(textContent) || /(cleaning fee|security deposit|service fee|reservation fee|hotel tax|property insurance fee|short stay fee)/i.test(textContent)
}

function isRateNoteLine(textContent) {
  return /(subject to change|until confirmed|bookings are|no arrivals|stays of less than)/i.test(textContent)
}

function isRatePriceLine(textContent) {
  return /\$/.test(textContent) && !isRateFeeLine(textContent)
}

function isRatePrimaryHeadingLine(textContent) {
  return RATE_PRIMARY_HEADING_PATTERNS.some((pattern) => pattern.test(textContent))
}

function isRateHeadingLine(textContent, isEmphasized) {
  if (isRateTitleLine(textContent) || isRateDateLine(textContent) || isRateMinimumLine(textContent) || isRatePriceLine(textContent) || isRateFeeLine(textContent) || isRateNoteLine(textContent)) {
    return false
  }

  return isEmphasized || RATE_HEADING_WORD_PATTERNS.some((pattern) => pattern.test(textContent))
}

function createParagraphFromLineNodes(lineNodes, documentNode) {
  const paragraph = documentNode.createElement('p')

  lineNodes.forEach((lineNode, lineIndex) => {
    while (lineNode.firstChild) {
      paragraph.append(lineNode.firstChild)
    }

    if (lineIndex < lineNodes.length - 1) {
      paragraph.append(documentNode.createElement('br'))
      paragraph.append(documentNode.createElement('br'))
    }
  })

  return paragraph
}

function createRateLineElement(documentNode, className, sourceLine) {
  const lineElement = documentNode.createElement('div')
  lineElement.className = ['property-rate-line', className].filter(Boolean).join(' ')
  moveElementContents(sourceLine, lineElement)
  return lineElement
}

function createPropertySectionList(documentNode, items) {
  const list = documentNode.createElement('ul')
  list.className = 'property-section-list'

  items.forEach((item) => {
    const listItem = documentNode.createElement('li')
    moveElementContents(item, listItem)
    list.append(listItem)
  })

  return list
}

function transformEmbeddedPropertySectionParagraphs(root, documentNode) {
  const elements = Array.from(root.children)

  elements.forEach((element) => {
    if (!element || element.tagName !== 'P') {
      return
    }

    const lineNodes = cloneLineNodesFromElement(element, documentNode)

    if (lineNodes.length < 2) {
      return
    }

    const headingLine = lineNodes[0]
    const headingText = getElementTextContent(headingLine)

    if (!headingText || !headingLine.querySelector('strong, b')) {
      return
    }

    const heading = documentNode.createElement('h3')
    moveElementContents(headingLine, heading)
    unwrapFormatting(heading)

    const listItemNodes = lineNodes.slice(1).filter((lineNode) => getElementTextContent(lineNode))

    if (!listItemNodes.length) {
      return
    }

    const listItems = listItemNodes.map((lineNode) => {
      const listItem = documentNode.createElement('p')
      moveElementContents(lineNode, listItem)
      return listItem
    })

    const list = createPropertySectionList(documentNode, listItems)
    element.replaceWith(heading)
    heading.after(list)
  })
}

function wrapPropertyParagraphRunsAsLists(root, documentNode) {
  const elements = Array.from(root.children)
  let paragraphRun = []

  const flushRun = () => {
    if (!paragraphRun.length) {
      return
    }

    const anchor = paragraphRun[0]
    const list = createPropertySectionList(documentNode, paragraphRun)
    anchor.before(list)
    paragraphRun.forEach((paragraph) => paragraph.remove())
    paragraphRun = []
  }

  elements.forEach((element) => {
    if (element?.tagName === 'P' && getElementTextContent(element)) {
      paragraphRun.push(element)
      return
    }

    flushRun()
  })

  flushRun()
}

function transformPropertyRateSections(root, documentNode) {
  const elements = Array.from(root.children)
  let startIndex = -1
  let startLineIndex = -1
  let endIndex = elements.length

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]

    if (!element || !/^P$/i.test(element.tagName)) {
      continue
    }

    const lineNodes = cloneLineNodesFromElement(element, documentNode)
    const lineTexts = lineNodes.map((lineNode) => getElementTextContent(lineNode)).filter(Boolean)

    if (startIndex === -1) {
      const rateTitleLineIndex = lineTexts.findIndex((textContent) => isRateTitleLine(textContent))

      if (rateTitleLineIndex !== -1) {
        startIndex = index
        startLineIndex = rateTitleLineIndex
      }

      continue
    }

    if (lineTexts.some((textContent) => isRateSectionEndLine(textContent))) {
      endIndex = index
      break
    }
  }

  if (startIndex === -1) {
    return
  }

  const insertBeforeNode = endIndex < elements.length ? elements[endIndex] : null
  const collectedLines = []

  for (let index = startIndex; index < endIndex; index += 1) {
    const element = elements[index]

    if (!element || !/^P$/i.test(element.tagName)) {
      continue
    }

    const lineNodes = extractLineNodesFromElement(element, documentNode)
    const relevantLines = index === startIndex ? lineNodes.slice(startLineIndex) : lineNodes
    const prefixLines = index === startIndex ? lineNodes.slice(0, startLineIndex) : []

    if (prefixLines.length > 0) {
      element.before(createParagraphFromLineNodes(prefixLines, documentNode))
    }

    relevantLines.forEach((lineNode) => {
      const textContent = getElementTextContent(lineNode)

      if (!textContent) {
        return
      }

      collectedLines.push({
        lineNode,
        textContent,
        isEmphasized: Boolean(lineNode.querySelector('strong, b')),
      })
    })

    element.remove()
  }

  if (!collectedLines.length) {
    return
  }

  const rateBlock = documentNode.createElement('div')
  rateBlock.className = 'property-rate-block'

  const titleLine = collectedLines.shift()

  if (!titleLine) {
    return
  }

  const titleElement = createRateLineElement(documentNode, 'property-rate-line--title', titleLine.lineNode)
  rateBlock.append(titleElement)

  let currentGroup = null
  let currentSubgroup = null
  let footerGroup = null

  const ensureGroup = () => {
    if (!currentGroup) {
      currentGroup = documentNode.createElement('div')
      currentGroup.className = 'property-rate-group'
      rateBlock.append(currentGroup)
    }

    return currentGroup
  }

  const ensureSubgroup = () => {
    if (!currentSubgroup) {
      currentSubgroup = documentNode.createElement('div')
      currentSubgroup.className = 'property-rate-subgroup'
      ensureGroup().append(currentSubgroup)
    }

    return currentSubgroup
  }

  const ensureFooter = () => {
    if (!footerGroup) {
      footerGroup = documentNode.createElement('div')
      footerGroup.className = 'property-rate-footer'
      rateBlock.append(footerGroup)
    }

    return footerGroup
  }

  collectedLines.forEach(({ lineNode, textContent, isEmphasized }) => {
    if (isRatePrimaryHeadingLine(textContent) || (isRateHeadingLine(textContent, isEmphasized) && (!currentGroup || currentGroup.dataset.kind !== 'holiday'))) {
      currentGroup = documentNode.createElement('div')
      currentGroup.className = 'property-rate-group'
      currentGroup.dataset.kind = /holidays?/i.test(textContent) ? 'holiday' : 'season'
      currentSubgroup = null
      currentGroup.append(createRateLineElement(documentNode, 'property-rate-line--heading', lineNode))
      rateBlock.append(currentGroup)
      return
    }

    if (isRateHeadingLine(textContent, isEmphasized)) {
      currentSubgroup = null
      ensureSubgroup().append(createRateLineElement(documentNode, 'property-rate-line--heading', lineNode))
      return
    }

    if (isRateDateLine(textContent)) {
      const target = currentSubgroup || ensureGroup()
      target.append(createRateLineElement(documentNode, 'property-rate-line--date', lineNode))
      return
    }

    if (isRateMinimumLine(textContent)) {
      const target = currentSubgroup || ensureGroup()
      target.append(createRateLineElement(documentNode, 'property-rate-line--minimum', lineNode))
      return
    }

    if (isRateFeeLine(textContent) || isRateNoteLine(textContent)) {
      currentSubgroup = null
      ensureFooter().append(
        createRateLineElement(
          documentNode,
          isRateNoteLine(textContent) ? 'property-rate-line--note' : 'property-rate-line--fee',
          lineNode,
        ),
      )
      return
    }

    const target = currentSubgroup || ensureGroup()
    target.append(createRateLineElement(documentNode, 'property-rate-line--price', lineNode))
  })

  if (insertBeforeNode?.parentNode === root) {
    root.insertBefore(rateBlock, insertBeforeNode)
    return
  }

  root.append(rateBlock)
}

function isPolicyHeadingText(textContent) {
  return PROPERTY_POLICY_HEADING_PATTERNS.some((pattern) => pattern.test(textContent))
}

function isBookingStartText(textContent) {
  return PROPERTY_BOOKING_START_PATTERNS.some((pattern) => pattern.test(textContent))
}

function hasBookingLink(element) {
  return Boolean(element?.querySelector('a[href*="vrbo.com"], a[href^="mailto:"], a[href^="tel:"], a[href*="availability"]'))
}

function isLikelyContactName(textContent) {
  return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.&/'-]+){0,6}$/.test(textContent) && !/^location:/i.test(textContent)
}

function isBookingContentElement(element, textContent) {
  if (!textContent) {
    return false
  }

  if (isBookingStartText(textContent) || hasBookingLink(element)) {
    return true
  }

  if (PROPERTY_BOOKING_DETAIL_PATTERNS.some((pattern) => pattern.test(textContent))) {
    return true
  }

  return isLikelyContactName(textContent)
}

function isStandalonePropertySectionHeading(element, textContent, matcher) {
  if (!element || element.tagName !== 'P' || !matcher(textContent) || element.querySelector('a')) {
    return false
  }

  return getMeaningfulChildNodes(element).every((childNode) => {
    if (childNode.nodeType === 3) {
      return childNode.textContent.trim().length === 0
    }

    return childNode.tagName === 'STRONG' || childNode.tagName === 'B'
  })
}

function isRateElement(element, textContent) {
  if (element?.classList?.contains('property-rate-block')) {
    return true
  }

  if (!textContent) {
    return false
  }

  if (/base nightly rates vary/i.test(textContent)) {
    return true
  }

  return (
    isRateTitleLine(textContent) ||
    isRatePrimaryHeadingLine(textContent) ||
    isRateHeadingLine(textContent, Boolean(element?.querySelector('strong, b'))) ||
    isRateDateLine(textContent) ||
    isRateMinimumLine(textContent) ||
    isRatePriceLine(textContent) ||
    isRateFeeLine(textContent) ||
    isRateNoteLine(textContent)
  )
}

function isMeaningfulPropertyElement(element) {
  return Boolean(element && (getElementTextContent(element) || element.querySelector('a, br, strong, b, em, i, span')))
}

function createSectionRoot(documentNode) {
  return {
    description: documentNode.createElement('div'),
    rates: documentNode.createElement('div'),
    booking: documentNode.createElement('div'),
    policy: documentNode.createElement('div'),
    details: documentNode.createElement('div'),
  }
}

export function extractPropertyTemplateSections(html) {
  const normalizedHtml = normalizeSiteHtml(html)

  if (!normalizedHtml.trim() || typeof DOMParser === 'undefined') {
    return {
      descriptionHtml: normalizedHtml,
      ratesHtml: '',
      bookingHtml: '',
      policyHtml: '',
      detailsHtml: '',
    }
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return {
      descriptionHtml: normalizedHtml,
      ratesHtml: '',
      bookingHtml: '',
      policyHtml: '',
      detailsHtml: '',
    }
  }

  transformPropertyRateSections(root, documentNode)

  const sections = createSectionRoot(documentNode)
  let activeSection = 'description'

  Array.from(root.children).forEach((element) => {
    if (!isMeaningfulPropertyElement(element)) {
      return
    }

    const textContent = getElementTextContent(element)

    if (isStandalonePropertySectionHeading(element, textContent, isPolicyHeadingText)) {
      activeSection = 'policy'
      return
    }

    if (isPolicyHeadingText(textContent)) {
      activeSection = 'policy'
      sections.policy.append(element)
      return
    }

    if (isRateElement(element, textContent)) {
      activeSection = 'rates'
      sections.rates.append(element)
      return
    }

    if (isStandalonePropertySectionHeading(element, textContent, isBookingStartText)) {
      activeSection = 'booking'
      return
    }

    if (isBookingContentElement(element, textContent)) {
      activeSection = 'booking'
      sections.booking.append(element)
      return
    }

    if (activeSection === 'policy') {
      sections.policy.append(element)
      return
    }

    if (activeSection === 'rates') {
      sections.details.append(element)
      return
    }

    if (activeSection === 'booking') {
      sections.details.append(element)
      return
    }

    sections.description.append(element)
  })

  return {
    descriptionHtml: sections.description.innerHTML.trim(),
    ratesHtml: sections.rates.innerHTML.trim(),
    bookingHtml: sections.booking.innerHTML.trim(),
    policyHtml: sections.policy.innerHTML.trim(),
    detailsHtml: sections.details.innerHTML.trim(),
  }
}

export function formatPropertyRichHtml(
  html,
  { compactTail = false, listSections = false, reviewEntries = false, mergeLeadInLinkParagraphs = true } = {},
) {
  const normalizedHtml = normalizeSiteHtml(html)

  if (
    (!compactTail && !listSections && !reviewEntries && !mergeLeadInLinkParagraphs) ||
    !normalizedHtml.trim() ||
    typeof DOMParser === 'undefined'
  ) {
    return normalizedHtml
  }

  const parser = new DOMParser()
  const documentNode = parser.parseFromString(`<div>${normalizedHtml}</div>`, 'text/html')
  const root = documentNode.body.firstElementChild

  if (!root) {
    return normalizedHtml
  }

  if (mergeLeadInLinkParagraphs) {
    mergePropertyLeadInLinkParagraphs(root, documentNode)
  }

  if (listSections) {
    transformPropertySectionLists(root, documentNode)
  }

  if (reviewEntries) {
    transformPropertyReviews(root, documentNode)
  }

  if (compactTail) {
    transformPropertyRateSections(root, documentNode)
  }

  if (!compactTail) {
    return root.innerHTML
  }

  const elements = Array.from(root.children)
  const compactStartIndex = getCompactBlockStartIndex(elements)

  if (compactStartIndex === -1 || compactStartIndex >= elements.length - 1) {
    return root.innerHTML
  }

  const compactBlock = documentNode.createElement('div')
  compactBlock.className = 'property-compact-block'
  const tailElements = elements.slice(compactStartIndex)
  let currentGroup = null

  const flushCurrentGroup = () => {
    if (!currentGroup || currentGroup.childElementCount === 0) {
      currentGroup = null
      return
    }

    compactBlock.append(currentGroup)
    currentGroup = null
  }

  const ensureCurrentGroup = (className = 'property-compact-group--single') => {
    if (!currentGroup) {
      currentGroup = createCompactGroup(documentNode, className)
    }

    return currentGroup
  }

  for (let index = 0; index < tailElements.length; index += 1) {
    const currentElement = tailElements[index]

    if (!currentElement || currentElement.tagName !== 'P') {
      flushCurrentGroup()

      if (currentElement?.parentNode === root) {
        compactBlock.append(currentElement)
      }
      continue
    }

    const textContent = getElementTextContent(currentElement)
    const nextElement = tailElements[index + 1]

    if ((isVrboIntroLine(textContent) || isDirectBookingIntroLine(textContent)) && nextElement?.tagName === 'P') {
      flushCurrentGroup()
      const group = createCompactGroup(documentNode, 'property-compact-group--pair')
      group.append(createCompactLine(documentNode, currentElement))
      currentElement.remove()
      group.append(createCompactLine(documentNode, nextElement))
      nextElement.remove()
      compactBlock.append(group)
      index += 1
      continue
    }

    if (
      isStandalonePropertySectionHeading(currentElement, textContent, isBookingStartText) ||
      isStandalonePropertySectionHeading(currentElement, textContent, isPolicyHeadingText)
    ) {
      flushCurrentGroup()
      currentGroup = createCompactGroup(documentNode, 'property-compact-group--section')
    }

    ensureCurrentGroup().append(createCompactLine(documentNode, currentElement))
    currentElement.remove()
  }

  flushCurrentGroup()
  root.append(compactBlock)
  return root.innerHTML
}
