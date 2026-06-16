import { useEffect, useRef } from 'react'
import { richTextValueToPlainText } from './richTextValue'

export const SITE_TITLE = 'St. John House Rentals'
export const DEFAULT_SITE_DESCRIPTION =
  'Browse St. John vacation rentals, ferry information, charter boats, and island travel resources.'

const documentMetaEntries = new Map()
let documentMetaSequence = 0

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeMetaText(value) {
  const plainTextValue = richTextValueToPlainText(value)

  if (plainTextValue) {
    return normalizeText(plainTextValue)
  }

  return normalizeText(value)
}

function getActiveDocumentMetaEntry() {
  let activeEntry = null

  documentMetaEntries.forEach((entry) => {
    if (!activeEntry) {
      activeEntry = entry
      return
    }

    if (entry.priority > activeEntry.priority) {
      activeEntry = entry
      return
    }

    if (entry.priority === activeEntry.priority && entry.sequence > activeEntry.sequence) {
      activeEntry = entry
    }
  })

  return activeEntry
}

function applyActiveDocumentMetaEntry() {
  if (typeof document === 'undefined') {
    return
  }

  const activeEntry = getActiveDocumentMetaEntry()
  const title = activeEntry?.title ?? ''
  const description = activeEntry?.description ?? DEFAULT_SITE_DESCRIPTION

  document.title = buildDocumentTitle(title)
  setMetaDescription(description)
}

function setMetaDescription(description) {
  if (typeof document === 'undefined') {
    return
  }

  const head = document.head ?? document.querySelector('head')

  if (!head) {
    return
  }

  let descriptionTag = document.querySelector('meta[name="description"]')

  if (!descriptionTag) {
    descriptionTag = document.createElement('meta')
    descriptionTag.setAttribute('name', 'description')
    head.append(descriptionTag)
  }

  descriptionTag.setAttribute('content', normalizeMetaText(description) || DEFAULT_SITE_DESCRIPTION)
}

export function buildDocumentTitle(title = '') {
  const normalizedTitle = normalizeMetaText(title)

  if (!normalizedTitle || normalizedTitle.toLowerCase() === SITE_TITLE.toLowerCase()) {
    return SITE_TITLE
  }

  if (normalizedTitle.toLowerCase().includes(SITE_TITLE.toLowerCase())) {
    return normalizedTitle
  }

  return `${normalizedTitle} | ${SITE_TITLE}`
}

export function useDocumentMeta({ title = '', description = DEFAULT_SITE_DESCRIPTION, priority = 0 }) {
  const entryIdRef = useRef(Symbol('document-meta-entry'))

  useEffect(() => {
    const entryId = entryIdRef.current

    documentMetaEntries.set(entryId, {
      title,
      description,
      priority,
      sequence: ++documentMetaSequence,
    })
    applyActiveDocumentMetaEntry()

    return () => {
      documentMetaEntries.delete(entryId)
      applyActiveDocumentMetaEntry()
    }
  }, [description, priority, title])
}
