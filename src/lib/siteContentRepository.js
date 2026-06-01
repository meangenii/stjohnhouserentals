import {
  getSiteShellContent,
  getStructuredPageContent,
  listLegacySnapshotPages,
  listPageInventory,
  listStructuredPages,
} from '../../shared/siteContent.js'
import { getJson } from './api'
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
    resolvedSiteShellSeed = resolveSeedContent(getSiteShellContent())
  }

  return resolvedSiteShellSeed
}

function getResolvedStructuredPageSeed(key) {
  if (!resolvedStructuredPageCache.has(key)) {
    const page = getStructuredPageContent(key)
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

export function getSiteContentSourceMode() {
  return siteContentSource
}

export function isApiBackedSiteContentSource() {
  return apiBackedContentSources.has(siteContentSource)
}

export function readSiteShellContent() {
  return getResolvedSiteShellSeed()
}

export function readStructuredPageContent(key) {
  return getResolvedStructuredPageSeed(key)
}

export function readPageInventory() {
  return listPageInventory()
}

export function readStructuredPageSummaries() {
  return listStructuredPages()
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
