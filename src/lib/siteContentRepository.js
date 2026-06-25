import { deleteJson, getJson, postJson } from './api'
import { resolveContentAssets } from './contentAssets'

const siteContentSource = import.meta.env.VITE_SITE_CONTENT_SOURCE ?? 'firebase'
const apiBackedContentSources = new Set(['api', 'firebase'])
let liveSiteShellPromise = null
let liveSiteShellCache = null
let liveStructuredPageDirectoryPromise = null
let liveStructuredPageDirectoryCache = null
const liveStructuredPagePromises = new Map()
const liveStructuredPageCache = new Map()

function isManagedImageLike(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value.kind === 'image' ||
      Object.prototype.hasOwnProperty.call(value, 'url') ||
      Object.prototype.hasOwnProperty.call(value, 'src') ||
      Object.prototype.hasOwnProperty.call(value, 'assetId'))
  )
}

function sanitizeDraftImages(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDraftImages(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const sanitizedEntries = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, sanitizeDraftImages(entry)]),
  )

  if (!isManagedImageLike(sanitizedEntries)) {
    return sanitizedEntries
  }

  const sanitizedImage = { ...sanitizedEntries }
  delete sanitizedImage.assetId
  delete sanitizedImage.src
  return sanitizedImage
}

function normalizePathname(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return '/'
  }

  const withoutOrigin = candidate.replace(/^[a-z]+:\/\/[^/]+/i, '')
  const withoutQueryOrHash = withoutOrigin.split(/[?#]/, 1)[0] || '/'
  const normalizedPath = withoutQueryOrHash.startsWith('/') ? withoutQueryOrHash : `/${withoutQueryOrHash}`

  return normalizedPath !== '/' ? normalizedPath.replace(/\/+$/, '') || '/' : '/'
}

function normalizeStructuredPageDirectory(directory = {}) {
  return {
    source: String(directory?.source ?? 'firestore').trim() || 'firestore',
    checkedAt: directory?.checkedAt ?? null,
    pages: Array.isArray(directory?.pages) ? directory.pages : [],
    inventory: Array.isArray(directory?.inventory) ? directory.inventory : [],
  }
}

function normalizePublicationState(publication) {
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    return null
  }

  return {
    hasUnpublishedChanges: publication.hasUnpublishedChanges === true,
    savedAt: publication.savedAt ?? null,
    savedBy: String(publication.savedBy ?? '').trim(),
    publishedAt: publication.publishedAt ?? null,
    publishedBy: String(publication.publishedBy ?? '').trim(),
  }
}

function normalizeAdminSiteShellPayload(payload = {}) {
  return {
    siteShell: resolveContentAssets(payload?.siteShell ?? {}),
    publication: normalizePublicationState(payload?.publication),
  }
}

function normalizeLiveSiteShellPayload(payload = {}) {
  const candidate =
    payload?.siteShell && typeof payload.siteShell === 'object' && !Array.isArray(payload.siteShell)
      ? payload.siteShell
      : payload
  const siteShell = resolveContentAssets(candidate)

  if (
    !siteShell ||
    typeof siteShell !== 'object' ||
    Array.isArray(siteShell) ||
    !siteShell.header ||
    typeof siteShell.header !== 'object' ||
    Array.isArray(siteShell.header) ||
    !siteShell.footer ||
    typeof siteShell.footer !== 'object' ||
    Array.isArray(siteShell.footer) ||
    !Array.isArray(siteShell.header.primaryNav) ||
    !Array.isArray(siteShell.footer.primaryNav) ||
    !Array.isArray(siteShell.footer.legalNav)
  ) {
    throw new Error('Live site shell content is incomplete.')
  }

  return siteShell
}

function normalizeAdminStructuredPagePayload(payload = {}) {
  return {
    page: payload?.page ? resolveContentAssets(payload.page) : null,
    publication: normalizePublicationState(payload?.publication),
  }
}

function getStructuredPagePathCandidates(page = {}) {
  return [page.path, ...(Array.isArray(page.routeAliases) ? page.routeAliases : [])]
    .map((path) => normalizePathname(path))
    .filter(Boolean)
}

function resolveStructuredPageKeyForPath(pathname, pages = readStructuredPageSummaries()) {
  const normalizedPath = normalizePathname(pathname)
  const matchingPage = pages.find((page) => getStructuredPagePathCandidates(page).includes(normalizedPath))

  return String(matchingPage?.key ?? '').trim()
}

function getLiveStructuredPageCacheKey(key) {
  return `${siteContentSource}:${String(key ?? '').trim()}`
}

function readLiveSiteShellCache() {
  return liveSiteShellCache
}

function readLiveStructuredPageDirectoryCache() {
  return liveStructuredPageDirectoryCache
}

function readLiveStructuredPageCache(key) {
  return liveStructuredPageCache.get(getLiveStructuredPageCacheKey(key)) ?? null
}

function storeLiveSiteShellCache(content) {
  liveSiteShellCache = content ?? null
  return liveSiteShellCache
}

function storeLiveStructuredPageDirectoryCache(directory) {
  liveStructuredPageDirectoryCache = normalizeStructuredPageDirectory(directory)
  return liveStructuredPageDirectoryCache
}

function storeLiveStructuredPageCache(key, content) {
  const cacheKey = getLiveStructuredPageCacheKey(key)

  if (!cacheKey.endsWith(':')) {
    liveStructuredPageCache.set(cacheKey, content ?? null)
  }

  return liveStructuredPageCache.get(cacheKey) ?? null
}

function requireLiveSiteContentSource() {
  if (!isApiBackedSiteContentSource()) {
    throw new Error('Site content must be delivered from api or firebase.')
  }
}

async function fetchApiContent(path) {
  requireLiveSiteContentSource()

  try {
    const payload = await getJson(`/content/${path}`)
    return resolveContentAssets(payload)
  } catch {
    throw new Error(`Live site content request failed for /content/${path}.`)
  }
}

async function fetchStructuredPageDirectory() {
  requireLiveSiteContentSource()

  const cachedDirectory = readLiveStructuredPageDirectoryCache()

  if (cachedDirectory) {
    return cachedDirectory
  }

  if (!liveStructuredPageDirectoryPromise) {
    liveStructuredPageDirectoryPromise = getJson('/content/pages')
      .then((directory) => storeLiveStructuredPageDirectoryCache(directory))
      .catch(() => {
        liveStructuredPageDirectoryPromise = null
        throw new Error('Live site content request failed for /content/pages.')
      })
      .finally(() => {
        liveStructuredPageDirectoryPromise = null
      })
  }

  return liveStructuredPageDirectoryPromise
}

function requireLiveSiteContentEditing() {
  if (!isSiteContentEditingEnabled()) {
    throw new Error('Site shell and structured page editing require VITE_SITE_CONTENT_SOURCE to be api or firebase.')
  }
}

function getAdminPagePath(key) {
  return `/admin/content/pages/${encodeURIComponent(String(key ?? '').trim())}`
}

export function getSiteContentSourceMode() {
  return siteContentSource
}

export function isApiBackedSiteContentSource() {
  return apiBackedContentSources.has(siteContentSource)
}

export function isSiteContentEditingEnabled() {
  return apiBackedContentSources.has(siteContentSource)
}

export function readSiteShellContent() {
  return readLiveSiteShellCache()
}

export function readStructuredPageContent(key) {
  return readLiveStructuredPageCache(key)
}

export function readPageInventory() {
  return readLiveStructuredPageDirectoryCache()?.inventory ?? []
}

export function readStructuredPageSummaries() {
  return readLiveStructuredPageDirectoryCache()?.pages ?? []
}

export function readLegacySnapshotPageSummaries() {
  return []
}

export async function fetchSiteShellContent() {
  requireLiveSiteContentSource()

  const cachedContent = readLiveSiteShellCache()

  if (cachedContent) {
    return cachedContent
  }

  if (!liveSiteShellPromise) {
    liveSiteShellPromise = fetchApiContent('site-shell')
      .then((content) => normalizeLiveSiteShellPayload(content))
      .then((content) => storeLiveSiteShellCache(content))
      .catch((error) => {
        liveSiteShellPromise = null
        throw error
      })
      .finally(() => {
        liveSiteShellPromise = null
      })
  }

  return liveSiteShellPromise
}

export async function fetchStructuredPageContent(key) {
  requireLiveSiteContentSource()

  const normalizedKey = String(key ?? '').trim()
  const cachedContent = readLiveStructuredPageCache(normalizedKey)

  if (cachedContent) {
    return cachedContent
  }

  if (!liveStructuredPagePromises.has(normalizedKey)) {
    liveStructuredPagePromises.set(
      normalizedKey,
      fetchApiContent(`pages/${normalizedKey}`)
        .then((content) => storeLiveStructuredPageCache(normalizedKey, content))
        .finally(() => {
          liveStructuredPagePromises.delete(normalizedKey)
        }),
    )
  }

  return liveStructuredPagePromises.get(normalizedKey)
}

export async function fetchAdminSiteShellContent(options = {}) {
  requireLiveSiteContentSource()
  return getJson('/admin/content/site-shell', options).then((payload) => normalizeAdminSiteShellPayload(payload))
}

export async function fetchAdminStructuredPageContent(key, options = {}) {
  requireLiveSiteContentSource()
  return getJson(`/admin/content/pages/${encodeURIComponent(String(key ?? '').trim())}`, options).then((payload) =>
    normalizeAdminStructuredPagePayload(payload),
  )
}

export async function fetchAdminStructuredPageDirectory(options = {}) {
  requireLiveSiteContentSource()
  return getJson('/admin/content/pages', options).then((payload) => normalizeStructuredPageDirectory(payload))
}

export async function saveAdminSiteShellContent(draft, options = {}) {
  requireLiveSiteContentEditing()
  const payload = await postJson('/admin/content/site-shell', { draft: sanitizeDraftImages(draft) }, options)
  return normalizeAdminSiteShellPayload(payload)
}

export async function publishAdminSiteShellContent(options = {}) {
  requireLiveSiteContentEditing()
  const payload = await postJson('/admin/content/site-shell/publish', {}, options)
  const normalized = normalizeAdminSiteShellPayload(payload)

  if (normalized.siteShell) {
    storeLiveSiteShellCache(normalized.siteShell)
  }

  return normalized
}

export async function resetAdminSiteShellContent(options = {}) {
  requireLiveSiteContentEditing()
  const payload = await deleteJson('/admin/content/site-shell', options)

  if (payload?.siteShell) {
    storeLiveSiteShellCache(resolveContentAssets(payload.siteShell))
  }

  return normalizeAdminSiteShellPayload(payload)
}

export async function saveAdminStructuredPageContent(key, draft, options = {}) {
  requireLiveSiteContentEditing()
  const normalizedKey = String(key ?? '').trim()
  const payload = await postJson(getAdminPagePath(normalizedKey), { draft: sanitizeDraftImages(draft) }, options)
  return normalizeAdminStructuredPagePayload(payload)
}

export async function publishAdminStructuredPageContent(key, options = {}) {
  requireLiveSiteContentEditing()
  const normalizedKey = String(key ?? '').trim()
  const payload = await postJson(`${getAdminPagePath(normalizedKey)}/publish`, {}, options)
  const normalized = normalizeAdminStructuredPagePayload(payload)

  liveStructuredPageDirectoryCache = null

  if (normalized.page) {
    storeLiveStructuredPageCache(normalizedKey, normalized.page)
  }

  return normalized
}

export async function resetAdminStructuredPageContent(key, options = {}) {
  requireLiveSiteContentEditing()
  const normalizedKey = String(key ?? '').trim()
  const payload = await deleteJson(getAdminPagePath(normalizedKey), options)

  if (payload?.page) {
    storeLiveStructuredPageCache(normalizedKey, resolveContentAssets(payload.page))
  }

  liveStructuredPageDirectoryCache = null

  return normalizeAdminStructuredPagePayload(payload)
}

export function peekPreloadedSiteShellContent() {
  return readLiveSiteShellCache()
}

export function peekPreloadedStructuredPageContent(key) {
  return readLiveStructuredPageCache(key)
}

export function isRouteSiteContentPreloaded(pathname) {
  if (!isApiBackedSiteContentSource()) {
    return false
  }

  if (!readLiveSiteShellCache()) {
    return false
  }

  const directory = readLiveStructuredPageDirectoryCache()

  if (!directory) {
    return false
  }

  const pageKey = resolveStructuredPageKeyForPath(pathname, directory.pages)

  if (!pageKey) {
    return true
  }

  return Boolean(readLiveStructuredPageCache(pageKey))
}

export async function preloadRouteSiteContent(pathname) {
  requireLiveSiteContentSource()

  const [siteShell, directory] = await Promise.all([fetchSiteShellContent(), fetchStructuredPageDirectory()])
  const pageKey = resolveStructuredPageKeyForPath(pathname, directory.pages)
  const page = pageKey ? await fetchStructuredPageContent(pageKey) : null

  return {
    page,
    pageKey,
    siteShell,
  }
}
