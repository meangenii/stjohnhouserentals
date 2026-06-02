import {
  getSiteShellContent as getSiteShellSeed,
  getStructuredPageContent as getStructuredPageSeed,
  listLegacySnapshotPages,
  listPageInventory as listPageInventorySeed,
  listStructuredPages as listStructuredPagesSeed,
} from '../../shared/siteContent.js'
import { deleteJson, getJson, postJson } from './api'
import { resolveContentAssets } from './contentAssets'

const siteContentSource = import.meta.env.VITE_SITE_CONTENT_SOURCE ?? 'local'
const apiBackedContentSources = new Set(['api', 'firebase', 'firebase-preferred'])
const resolvedStructuredPageCache = new Map()
let resolvedSiteShellSeed

function resolveSeedContent(value) {
  return resolveContentAssets(value)
}

function getResolvedSiteShellSeed() {
  if (!resolvedSiteShellSeed) {
    resolvedSiteShellSeed = resolveSeedContent(getSiteShellSeed())
  }

  return resolvedSiteShellSeed
}

function getResolvedStructuredPageSeed(key) {
  if (!resolvedStructuredPageCache.has(key)) {
    const page = getStructuredPageSeed(key)
    resolvedStructuredPageCache.set(key, page ? resolveSeedContent(page) : null)
  }

  return resolvedStructuredPageCache.get(key) ?? null
}

async function fetchApiContent(path, fallback) {
  if (!apiBackedContentSources.has(siteContentSource)) {
    return fallback()
  }

  try {
    const payload = await getJson(`/content/${path}`)
    return resolveContentAssets(payload)
  } catch {
    if (siteContentSource === 'firebase-preferred') {
      return fallback()
    }

    throw new Error(`Live site content request failed for /content/${path}.`)
  }
}

function requireLiveSiteContentEditing() {
  if (!isSiteContentEditingEnabled()) {
    throw new Error(
      'Site shell and structured page editing require VITE_SITE_CONTENT_SOURCE to be api, firebase, or firebase-preferred.',
    )
  }
}

function getRawStructuredPageSeedList() {
  return listStructuredPagesSeed()
}

function getRawPageInventorySeedList() {
  return listPageInventorySeed()
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
  return getResolvedSiteShellSeed()
}

export function readStructuredPageContent(key) {
  return getResolvedStructuredPageSeed(key)
}

export function readPageInventory() {
  return getRawPageInventorySeedList()
}

export function readStructuredPageSummaries() {
  return getRawStructuredPageSeedList()
}

export function readLegacySnapshotPageSummaries() {
  return listLegacySnapshotPages()
}

export async function fetchSiteShellContent() {
  return fetchApiContent('site-shell', readSiteShellContent)
}

export async function fetchStructuredPageContent(key) {
  return fetchApiContent(`pages/${key}`, () => readStructuredPageContent(key))
}

export async function fetchAdminSiteShellContent() {
  if (!isApiBackedSiteContentSource()) {
    return getSiteShellSeed()
  }

  return getJson('/content/site-shell')
}

export async function fetchAdminStructuredPageContent(key) {
  if (!isApiBackedSiteContentSource()) {
    return getStructuredPageSeed(key)
  }

  return getJson(`/content/pages/${encodeURIComponent(String(key ?? '').trim())}`)
}

export async function fetchAdminStructuredPageDirectory() {
  if (!isApiBackedSiteContentSource()) {
    return {
      source: 'local',
      checkedAt: null,
      pages: getRawStructuredPageSeedList(),
      inventory: getRawPageInventorySeedList(),
    }
  }

  return getJson('/content/pages')
}

export async function saveAdminSiteShellContent(draft, options = {}) {
  requireLiveSiteContentEditing()
  const payload = await postJson('/admin/content/site-shell', { draft }, options)
  return payload?.siteShell ?? null
}

export async function resetAdminSiteShellContent(options = {}) {
  requireLiveSiteContentEditing()
  const payload = await deleteJson('/admin/content/site-shell', options)
  return payload?.siteShell ?? null
}

export async function saveAdminStructuredPageContent(key, draft, options = {}) {
  requireLiveSiteContentEditing()
  const payload = await postJson(getAdminPagePath(key), { draft }, options)
  return payload?.page ?? null
}

export async function resetAdminStructuredPageContent(key, options = {}) {
  requireLiveSiteContentEditing()
  const payload = await deleteJson(getAdminPagePath(key), options)
  return payload?.page ?? null
}
