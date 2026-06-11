import { deleteJson, getJson, postJson } from './api'
import { getRouteSlugVariants } from './routeSlug'
import { isApiBackedSiteContentSource } from './siteContentRepository'

const liveCatalogUrl = '/liveCharterCatalog.json'
const MOCK_STORAGE_KEY = 'charterCatalog'
const charterDataSource = import.meta.env.VITE_CHARTER_DATA_SOURCE ?? 'local'

let localCharterCatalogPromise = null
let remoteCharterCatalogPromise = null
let mockCatalog = null

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeImageAsset(asset) {
  if (!asset?.url) {
    return null
  }

  return {
    url: String(asset.url).trim(),
    alt: String(asset.alt ?? '').trim(),
    title: String(asset.title ?? '').trim(),
    width: asset.width ?? null,
    height: asset.height ?? null,
  }
}

function normalizeExternalLinks(links) {
  return Array.isArray(links)
    ? links
        .map((link) => ({
          href: String(link?.href ?? '').trim(),
          label: String(link?.label ?? '').trim(),
          isMailto: Boolean(link?.isMailto),
          isPhone: Boolean(link?.isPhone),
          isInternal: Boolean(link?.isInternal),
        }))
        .filter((link) => link.href && link.label)
    : []
}

function normalizeCharterRecord(record) {
  if (!record?.slug || !record?.name) {
    return null
  }

  return {
    ...record,
    id: record.id ?? record.slug,
    slug: String(record.slug).trim(),
    adminOriginalSlug: String(record.adminOriginalSlug ?? record.slug).trim(),
    path: String(record.path ?? `/charter-boat-rentals/${record.slug}`).trim(),
    name: String(record.name).trim(),
    active: record.active !== false,
    shortDescription: String(record.shortDescription ?? '').trim(),
    phoneNumber: String(record.phoneNumber ?? '').trim(),
    email: String(record.email ?? '').trim(),
    website: String(record.website ?? '').trim(),
    heroImage: normalizeImageAsset(record.heroImage),
    pageTitle: String(record.pageTitle ?? '').trim(),
    contentHtml: String(record.contentHtml ?? '').trim(),
    externalLinks: normalizeExternalLinks(record.externalLinks),
  }
}

function buildCatalogFromPayload(payload) {
  const charters = Array.isArray(payload?.charters)
    ? payload.charters.map((charter) => normalizeCharterRecord(charter)).filter(Boolean)
    : []
  const index = new Map()

  charters.forEach((charter) => {
    getRouteSlugVariants(charter.slug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, charter)
      }
    })

    getRouteSlugVariants(charter.adminOriginalSlug).forEach((variant) => {
      if (!index.has(variant)) {
        index.set(variant, charter)
      }
    })
  })

  return { charters, index }
}

function fetchCatalog(url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Charter catalog request failed with status ${response.status}`)
      }

      return response.json()
    })
    .then((payload) => buildCatalogFromPayload(payload))
}

function paragraphListToHtml(values) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => `<p>${escapeHtml(value)}</p>`)
    .join('\n')
}

function buildCharterRecordFromAdminDraft(draft, originalSlug = '') {
  const slug = String(draft?.slug ?? '').trim()
  const name = String(draft?.name ?? '').trim()

  if (!slug || !name) {
    throw new Error('Invalid charter data: name and slug are required.')
  }

  const contentParagraphs = Array.isArray(draft?.contentParagraphs)
    ? draft.contentParagraphs.map((paragraph) => String(paragraph).trim()).filter(Boolean)
    : []
  const email = String(draft?.email ?? '').trim()
  const website = String(draft?.website ?? '').trim()
  const phoneNumber = String(draft?.phoneNumber ?? '').trim()
  const externalLinks = []

  if (email) {
    externalLinks.push({
      href: `mailto:${email}`,
      label: 'Email charter',
      isMailto: true,
      isPhone: false,
      isInternal: false,
    })
  }

  if (phoneNumber) {
    externalLinks.push({
      href: `tel:${phoneNumber.replace(/[^\d+]/g, '')}`,
      label: 'Call charter',
      isMailto: false,
      isPhone: true,
      isInternal: false,
    })
  }

  if (website) {
    externalLinks.push({
      href: website,
      label: 'Visit website',
      isMailto: false,
      isPhone: false,
      isInternal: false,
    })
  }

  return normalizeCharterRecord({
    id: slug,
    slug,
    adminOriginalSlug: originalSlug || slug,
    path: `/charter-boat-rentals/${slug}`,
    name,
    active: draft?.active !== false,
    shortDescription: String(draft?.shortDescription ?? '').trim(),
    phoneNumber,
    email,
    website,
    heroImage: normalizeImageAsset(draft?.heroImage),
    pageTitle: name,
    contentHtml: paragraphListToHtml(contentParagraphs),
    externalLinks,
  })
}

function invalidateCharterCaches() {
  remoteCharterCatalogPromise = null
}

async function loadLocalCatalog() {
  if (!localCharterCatalogPromise) {
    localCharterCatalogPromise = fetchCatalog(liveCatalogUrl).catch(() => buildCatalogFromPayload({ charters: [] }))
  }

  return localCharterCatalogPromise
}

async function loadRemoteCatalog() {
  if (!remoteCharterCatalogPromise) {
    remoteCharterCatalogPromise = getJson('/charters')
      .then((payload) => buildCatalogFromPayload(payload))
      .catch((error) => {
        if (isFirebaseCharterData()) {
          throw error
        }

        return loadLocalCatalog()
      })
  }

  return remoteCharterCatalogPromise
}

async function loadMockCatalog() {
  if (!mockCatalog) {
    const stored = localStorage.getItem(MOCK_STORAGE_KEY)

    if (stored) {
      try {
        mockCatalog = buildCatalogFromPayload(JSON.parse(stored))
      } catch {
        mockCatalog = null
      }
    }

    if (!mockCatalog) {
      mockCatalog = await loadLocalCatalog()
    }
  }

  return mockCatalog
}

async function loadCatalog() {
  if (isMockCharterData()) {
    return loadMockCatalog()
  }

  if (isFirebaseCharterData() || isApiCharterData()) {
    return loadRemoteCatalog()
  }

  return isApiBackedSiteContentSource() ? loadRemoteCatalog() : loadLocalCatalog()
}

async function loadAdminRemoteCatalog(options = {}) {
  return getJson('/admin/charters/catalog', options).then((payload) => buildCatalogFromPayload(payload))
}

export function getCharterDataSourceMode() {
  return charterDataSource
}

export function isMockCharterData() {
  return charterDataSource === 'mock'
}

export function isFirebaseCharterData() {
  return charterDataSource === 'firebase'
}

export function isApiCharterData() {
  return charterDataSource === 'api'
}

export function isCharterEditingEnabled() {
  return isMockCharterData() || isFirebaseCharterData()
}

export async function listCharters() {
  const catalog = await loadCatalog()
  return cloneData(catalog.charters.filter((charter) => charter.active !== false))
}

export async function listAllCharters(options = {}) {
  if ((isFirebaseCharterData() || isApiCharterData()) && options.authToken) {
    const catalog = await loadAdminRemoteCatalog(options)
    return cloneData(catalog.charters)
  }

  const catalog = await loadCatalog()
  return cloneData(catalog.charters)
}

export async function getCharterBySlug(slug) {
  const catalog = await loadCatalog()
  const charter = getRouteSlugVariants(slug)
    .map((variant) => catalog.index.get(variant))
    .find(Boolean)

  if (!charter || charter.active === false) {
    return null
  }

  return cloneData(charter)
}

export async function saveAdminCharter(draft, originalSlug, options = {}) {
  if (isMockCharterData()) {
    const catalog = await loadMockCatalog()
    const normalized = buildCharterRecordFromAdminDraft(draft, originalSlug)
    const charters = [...catalog.charters]
    const existingIndex = originalSlug ? charters.findIndex((charter) => charter.slug === originalSlug) : -1
    const conflictingCharter = charters.find((charter) => charter.slug === normalized.slug && charter.slug !== originalSlug)

    if (conflictingCharter) {
      throw new Error(`A charter with slug "${normalized.slug}" already exists.`)
    }

    if (existingIndex >= 0) {
      charters[existingIndex] = normalized
    } else {
      charters.push(normalized)
    }

    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify({ charters }))
    mockCatalog = buildCatalogFromPayload({ charters })

    return cloneData(normalized)
  }

  if (!isFirebaseCharterData()) {
    throw new Error('Charter editing is only available when VITE_CHARTER_DATA_SOURCE=mock or firebase.')
  }

  const payload = await postJson('/admin/charters', { draft, originalSlug }, options)
  invalidateCharterCaches()

  return cloneData(normalizeCharterRecord(payload?.charter))
}

export async function resetAdminCharters(options = {}) {
  if (isMockCharterData()) {
    localStorage.removeItem(MOCK_STORAGE_KEY)
    mockCatalog = null
    localCharterCatalogPromise = null
    return
  }

  if (!isFirebaseCharterData()) {
    return
  }

  await deleteJson('/admin/charters/overrides', options)
  invalidateCharterCaches()
}
