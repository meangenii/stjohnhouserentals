export const MAX_PAGE_ROUTE_ALIASES = 20

const RESERVED_PAGE_ROUTE_PREFIXES = ['/admin', '/api', '/rental-properties', '/1bedroom', '/charter-boat-rentals']
const ROUTE_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function addIssue(issues, path, code, message) {
  issues.push({ code, message, path })
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExternalOrigin(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')
}

export function normalizePageRoutePath(value = '') {
  const candidate = String(value ?? '').trim()

  if (!candidate || hasExternalOrigin(candidate)) {
    return ''
  }

  const withoutQueryOrHash = candidate.split(/[?#]/, 1)[0]
  const withLeadingSlash = withoutQueryOrHash.startsWith('/') ? withoutQueryOrHash : `/${withoutQueryOrHash}`
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/')
  const withoutTrailingSlash = collapsed === '/' ? '/' : collapsed.replace(/\/+$/, '')

  return withoutTrailingSlash.toLowerCase()
}

export function isReservedPageRoutePath(value = '') {
  const path = normalizePageRoutePath(value)

  if (!path || path === '/') {
    return true
  }

  return RESERVED_PAGE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function isValidPageRoutePath(value = '') {
  const path = normalizePageRoutePath(value)

  if (!path || path === '/' || path.length > 180) {
    return false
  }

  return path
    .split('/')
    .filter(Boolean)
    .every((segment) => ROUTE_SEGMENT_PATTERN.test(segment))
}

function getRouteCandidates(record = {}) {
  return [record.path, ...(Array.isArray(record.routeAliases) ? record.routeAliases : [])]
    .map((value) => normalizePageRoutePath(value))
    .filter((value) => value && !value.includes('/:'))
}

function getRouteOwnerKey(record = {}) {
  return String(record.key ?? record.pageKey ?? '').trim()
}

function buildOwnedRouteMap({ activeKey = '', routeInventory = [], structuredPages = [] } = {}) {
  const ownedRoutes = new Map()
  const normalizedActiveKey = String(activeKey ?? '').trim()
  const records = [...(Array.isArray(routeInventory) ? routeInventory : []), ...(Array.isArray(structuredPages) ? structuredPages : [])]

  records.forEach((record) => {
    if (!isPlainObject(record) || (normalizedActiveKey && getRouteOwnerKey(record) === normalizedActiveKey)) {
      return
    }

    getRouteCandidates(record).forEach((path) => {
      if (!ownedRoutes.has(path)) {
        ownedRoutes.set(path, record)
      }
    })
  })

  return ownedRoutes
}

function validateRouteValue({ errors, label, ownedRoutes, path, seenPageRoutes, value }) {
  const rawValue = String(value ?? '').trim()

  if (!rawValue) {
    addIssue(errors, path, 'missing-page-route', `${label} is required.`)
    return ''
  }

  if (hasExternalOrigin(rawValue) || /[?#\\]/.test(rawValue) || /\s/.test(rawValue)) {
    addIssue(errors, path, 'invalid-page-route', `${label} must be a site path without a domain, query, hash, spaces, or backslashes.`)
    return ''
  }

  const normalizedPath = normalizePageRoutePath(rawValue)

  if (!isValidPageRoutePath(normalizedPath)) {
    addIssue(errors, path, 'invalid-page-route', `${label} must use lowercase URL segments containing letters, numbers, and single hyphens.`)
    return normalizedPath
  }

  if (isReservedPageRoutePath(normalizedPath)) {
    addIssue(errors, path, 'reserved-page-route', `${label} uses a URL reserved by the site.`)
  }

  if (seenPageRoutes.has(normalizedPath)) {
    addIssue(errors, path, 'duplicate-page-route', `${label} duplicates another URL on this page.`)
  } else {
    seenPageRoutes.add(normalizedPath)
  }

  if (ownedRoutes.has(normalizedPath)) {
    addIssue(errors, path, 'page-route-conflict', `${label} is already used by another site page.`)
  }

  return normalizedPath
}

export function validatePageRouteSettings(page, options = {}) {
  const errors = []
  const warnings = []

  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== 'block-page') {
    return { applies: false, errors, normalizedPage: page, valid: true, warnings }
  }

  const normalizedPage = { ...page }
  const ownedRoutes = buildOwnedRouteMap(options)
  const seenPageRoutes = new Set()
  normalizedPage.path = validateRouteValue({
    errors,
    label: 'Page URL',
    ownedRoutes,
    path: ['path'],
    seenPageRoutes,
    value: page.path,
  })

  if (page.routeAliases != null && !Array.isArray(page.routeAliases)) {
    addIssue(errors, ['routeAliases'], 'invalid-page-route-aliases', 'URL aliases must be a list.')
  }

  const aliases = Array.isArray(page.routeAliases) ? page.routeAliases : []

  if (aliases.length > MAX_PAGE_ROUTE_ALIASES) {
    addIssue(errors, ['routeAliases'], 'too-many-page-route-aliases', `Pages can have at most ${MAX_PAGE_ROUTE_ALIASES} URL aliases.`)
  }

  normalizedPage.routeAliases = aliases.map((alias, index) =>
    validateRouteValue({
      errors,
      label: `URL alias ${index + 1}`,
      ownedRoutes,
      path: ['routeAliases', index],
      seenPageRoutes,
      value: alias,
    }),
  )

  const navLabel = String(page.navLabel ?? '').trim()
  const group = String(page.group ?? '').trim()

  if (!navLabel) {
    addIssue(errors, ['navLabel'], 'missing-navigation-label', 'Navigation label is required.')
  } else if (navLabel.length > 80) {
    addIssue(warnings, ['navLabel'], 'long-navigation-label', 'Navigation label is longer than 80 characters.')
  }

  if (!group) {
    addIssue(errors, ['group'], 'missing-page-group', 'Navigation group is required.')
  } else if (!ROUTE_SEGMENT_PATTERN.test(group)) {
    addIssue(errors, ['group'], 'invalid-page-group', 'Navigation group must contain lowercase letters, numbers, and single hyphens.')
  }

  return {
    applies: true,
    errors,
    normalizedPage,
    valid: errors.length === 0,
    warnings,
  }
}
