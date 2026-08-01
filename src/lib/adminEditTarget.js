import { resolvePageSummaryForPath } from './siteContentRepository'

const PROPERTY_PATH_PATTERN = /^\/(?:rental-properties|1bedroom)\/([^/?#]+)/
const CHARTER_PATH_PATTERN = /^\/charter-boat-rentals\/([^/?#]+)/

export function resolveAdminEditTarget(pathname) {
  const normalizedPath = String(pathname ?? '').trim()
  const propertyMatch = normalizedPath.match(PROPERTY_PATH_PATTERN)

  if (propertyMatch) {
    return { tab: 'properties', propertySlug: propertyMatch[1] }
  }

  const charterMatch = normalizedPath.match(CHARTER_PATH_PATTERN)

  if (charterMatch) {
    return { tab: 'charters', charterSlug: charterMatch[1] }
  }

  const pageSummary = resolvePageSummaryForPath(normalizedPath)

  if (pageSummary?.key) {
    return { tab: 'pages', pageKey: pageSummary.key }
  }

  return null
}

export function buildAdminEditorHref(target) {
  if (!target?.tab) {
    return '/admin'
  }

  const params = new URLSearchParams()
  params.set('tab', target.tab)

  if (target.propertySlug) {
    params.set('propertySlug', target.propertySlug)
  }

  if (target.charterSlug) {
    params.set('charterSlug', target.charterSlug)
  }

  if (target.pageKey) {
    params.set('pageKey', target.pageKey)
  }

  return `/admin?${params.toString()}`
}

export function buildAdminEditorHrefForUsageMatch(match) {
  switch (match?.type) {
    case 'property':
      return buildAdminEditorHref({ tab: 'properties', propertySlug: match.slug })
    case 'charter':
      return buildAdminEditorHref({ tab: 'charters', charterSlug: match.slug })
    case 'page':
      return buildAdminEditorHref({ tab: 'pages', pageKey: match.pageKey })
    case 'site-shell':
      return buildAdminEditorHref({ tab: 'site-shell' })
    default:
      return '/admin'
  }
}
