import { useEffect, useRef } from 'react'
import { richTextValueToPlainText } from './richTextValue'
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  buildCanonicalUrl,
  buildSeoTitle,
  buildSiteJsonLd,
  buildWebPageJsonLd,
  getCanonicalPath,
  toAbsoluteUrl,
} from '../../shared/seoMetadata.js'

export const SITE_TITLE = SITE_NAME
export { DEFAULT_SITE_DESCRIPTION }

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
  const canonicalPath = activeEntry?.canonicalPath ?? getCanonicalPath(window.location.pathname)
  const canonicalUrl = activeEntry?.canonicalUrl ?? buildCanonicalUrl(canonicalPath)
  const image = activeEntry?.image ?? DEFAULT_SOCIAL_IMAGE
  const imageUrl = getMetaImageUrl(image) || DEFAULT_SOCIAL_IMAGE
  const imageAlt = normalizeMetaText(activeEntry?.imageAlt) || SITE_TITLE
  const robots = activeEntry?.robots ?? (canonicalPath.startsWith('/admin') ? 'noindex, nofollow' : 'index, follow')
  const type = activeEntry?.type ?? 'website'
  const documentTitle = buildDocumentTitle(title)
  const documentDescription = normalizeMetaText(description) || DEFAULT_SITE_DESCRIPTION

  document.title = documentTitle
  setCanonicalUrl(canonicalUrl)
  setNamedMeta('description', documentDescription)
  setNamedMeta('robots', robots)
  setNamedMeta('theme-color', '#f5f1e8')
  setPropertyMeta('og:site_name', SITE_TITLE)
  setPropertyMeta('og:type', type)
  setPropertyMeta('og:title', documentTitle)
  setPropertyMeta('og:description', documentDescription)
  setPropertyMeta('og:url', canonicalUrl)
  setPropertyMeta('og:image', imageUrl)
  setPropertyMeta('og:image:alt', imageAlt)
  setNamedMeta('twitter:card', 'summary_large_image')
  setNamedMeta('twitter:title', documentTitle)
  setNamedMeta('twitter:description', documentDescription)
  setNamedMeta('twitter:image', imageUrl)
  setStructuredData([
    ...buildSiteJsonLd(),
    buildWebPageJsonLd({
      title: documentTitle,
      description: documentDescription,
      canonicalUrl,
      image: imageUrl,
    }),
    ...normalizeStructuredData(activeEntry?.structuredData),
  ])
}

function getHeadElement() {
  if (typeof document === 'undefined') {
    return null
  }

  return document.head ?? document.querySelector('head')
}

function getMetaImageUrl(image) {
  if (typeof image === 'string') {
    return toAbsoluteUrl(image)
  }

  return toAbsoluteUrl(image?.url || image?.src)
}

function getOrCreateHeadElement(selector, createElement) {
  const head = getHeadElement()

  if (!head) {
    return null
  }

  let element = document.querySelector(selector)

  if (!element) {
    element = createElement()
    head.append(element)
  }

  return element
}

function setNamedMeta(name, content) {
  const normalizedContent = normalizeMetaText(content)
  const tag = getOrCreateHeadElement(`meta[name="${name}"]`, () => {
    const element = document.createElement('meta')
    element.setAttribute('name', name)
    return element
  })

  tag?.setAttribute('content', normalizedContent)
}

function setPropertyMeta(property, content) {
  const normalizedContent = normalizeMetaText(content)
  const tag = getOrCreateHeadElement(`meta[property="${property}"]`, () => {
    const element = document.createElement('meta')
    element.setAttribute('property', property)
    return element
  })

  tag?.setAttribute('content', normalizedContent)
}

function setCanonicalUrl(canonicalUrl) {
  const tag = getOrCreateHeadElement('link[rel="canonical"]', () => {
    const element = document.createElement('link')
    element.setAttribute('rel', 'canonical')
    return element
  })

  tag?.setAttribute('href', canonicalUrl)
}

function normalizeStructuredData(value) {
  if (!value) {
    return []
  }

  return (Array.isArray(value) ? value : [value]).filter(Boolean)
}

function setStructuredData(structuredData) {
  const head = getHeadElement()

  if (!head) {
    return
  }

  let script = document.querySelector('script[data-site-structured-data="true"]')

  if (!script) {
    script = document.createElement('script')
    script.setAttribute('type', 'application/ld+json')
    script.setAttribute('data-site-structured-data', 'true')
    head.append(script)
  }

  script.textContent = JSON.stringify(structuredData.filter(Boolean))
}

export function buildDocumentTitle(title = '') {
  return buildSeoTitle(normalizeMetaText(title))
}

export function useDocumentMeta({
  canonicalPath,
  canonicalUrl,
  description = DEFAULT_SITE_DESCRIPTION,
  image,
  imageAlt,
  priority = 0,
  robots,
  structuredData,
  title = '',
  type,
}) {
  const entryIdRef = useRef(Symbol('document-meta-entry'))

  useEffect(() => {
    const entryId = entryIdRef.current

    documentMetaEntries.set(entryId, {
      canonicalPath,
      canonicalUrl,
      title,
      description,
      image,
      imageAlt,
      priority,
      robots,
      sequence: ++documentMetaSequence,
      structuredData,
      type,
    })
    applyActiveDocumentMetaEntry()

    return () => {
      documentMetaEntries.delete(entryId)
      applyActiveDocumentMetaEntry()
    }
  }, [canonicalPath, canonicalUrl, description, image, imageAlt, priority, robots, structuredData, title, type])
}
