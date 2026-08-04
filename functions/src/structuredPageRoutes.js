const MAX_PAGE_ROUTE_ALIASES = 20
const RESERVED_PAGE_ROUTE_PREFIXES = ['/admin', '/api', '/rental-properties', '/1bedroom', '/charter-boat-rentals']
const ROUTE_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExternalOrigin(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')
}

function normalizeStructuredPageRoutePath(value = '') {
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

function isReservedStructuredPageRoutePath(value = '') {
  const path = normalizeStructuredPageRoutePath(value)

  if (!path || path === '/') {
    return true
  }

  return RESERVED_PAGE_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

function isValidStructuredPageRoutePath(value = '') {
  const path = normalizeStructuredPageRoutePath(value)

  if (!path || path === '/' || path.length > 180) {
    return false
  }

  return path
    .split('/')
    .filter(Boolean)
    .every((segment) => ROUTE_SEGMENT_PATTERN.test(segment))
}

function addIssue(issues, path, code, message) {
  issues.push({ code, message, path })
}

function validateRouteValue({ errors, label, path, seenPageRoutes, value }) {
  const rawValue = String(value ?? '').trim()

  if (!rawValue) {
    addIssue(errors, path, 'missing-page-route', `${label} is required.`)
    return ''
  }

  if (hasExternalOrigin(rawValue) || /[?#\\]/.test(rawValue) || /\s/.test(rawValue)) {
    addIssue(errors, path, 'invalid-page-route', `${label} must be a site path without a domain, query, hash, spaces, or backslashes.`)
    return ''
  }

  const normalizedPath = normalizeStructuredPageRoutePath(rawValue)

  if (!isValidStructuredPageRoutePath(normalizedPath)) {
    addIssue(errors, path, 'invalid-page-route', `${label} must use lowercase URL segments containing letters, numbers, and single hyphens.`)
    return normalizedPath
  }

  if (isReservedStructuredPageRoutePath(normalizedPath)) {
    addIssue(errors, path, 'reserved-page-route', `${label} uses a URL reserved by the site.`)
  }

  if (seenPageRoutes.has(normalizedPath)) {
    addIssue(errors, path, 'duplicate-page-route', `${label} duplicates another URL on this page.`)
  } else {
    seenPageRoutes.add(normalizedPath)
  }

  return normalizedPath
}

function validateStructuredPageRouteSettings(page) {
  const errors = []

  if (!isPlainObject(page) || String(page.contentModel ?? '').trim() !== 'block-page') {
    return { applies: false, errors, normalizedPage: page, valid: true }
  }

  const normalizedPage = { ...page }
  const seenPageRoutes = new Set()
  normalizedPage.path = validateRouteValue({
    errors,
    label: 'Page URL',
    path: 'page.path',
    seenPageRoutes,
    value: page.path,
  })

  if (page.routeAliases != null && !Array.isArray(page.routeAliases)) {
    addIssue(errors, 'page.routeAliases', 'invalid-page-route-aliases', 'URL aliases must be a list.')
  }

  const aliases = Array.isArray(page.routeAliases) ? page.routeAliases : []

  if (aliases.length > MAX_PAGE_ROUTE_ALIASES) {
    addIssue(errors, 'page.routeAliases', 'too-many-page-route-aliases', `Pages can have at most ${MAX_PAGE_ROUTE_ALIASES} URL aliases.`)
  }

  normalizedPage.routeAliases = aliases.map((alias, index) =>
    validateRouteValue({
      errors,
      label: `URL alias ${index + 1}`,
      path: `page.routeAliases[${index}]`,
      seenPageRoutes,
      value: alias,
    }),
  )

  const navLabel = String(page.navLabel ?? '').trim()
  const group = String(page.group ?? '').trim()

  if (!navLabel) {
    addIssue(errors, 'page.navLabel', 'missing-navigation-label', 'Navigation label is required.')
  }

  if (!group) {
    addIssue(errors, 'page.group', 'missing-page-group', 'Navigation group is required.')
  } else if (!ROUTE_SEGMENT_PATTERN.test(group)) {
    addIssue(errors, 'page.group', 'invalid-page-group', 'Navigation group must contain lowercase letters, numbers, and single hyphens.')
  }

  return {
    applies: true,
    errors,
    normalizedPage,
    valid: errors.length === 0,
  }
}

function collectStructuredPageRoutePaths(page = {}) {
  return [page.path, ...(Array.isArray(page.routeAliases) ? page.routeAliases : [])]
    .map((path) => normalizeStructuredPageRoutePath(path))
    .filter(Boolean)
}

function findStructuredPageRouteConflict(existingPages, nextPage) {
  const nextKey = String(nextPage?.key ?? '').trim()
  const nextPaths = new Set(collectStructuredPageRoutePaths(nextPage))

  for (const page of Array.isArray(existingPages) ? existingPages : []) {
    if (!isPlainObject(page) || (nextKey && String(page.key ?? '').trim() === nextKey)) {
      continue
    }

    const conflictPath = collectStructuredPageRoutePaths(page).find((path) => nextPaths.has(path))

    if (conflictPath) {
      return { page, path: conflictPath }
    }
  }

  return null
}

function formatStructuredPageRouteValidationErrors(errors = []) {
  const details = errors
    .slice(0, 8)
    .map((error) => `${error.path}: ${error.message}`)
    .join(' ')
  const overflow = errors.length > 8 ? ` ${errors.length - 8} more error(s) were omitted.` : ''

  return `Block page route settings failed validation.${details ? ` ${details}` : ''}${overflow}`
}

module.exports = {
  MAX_PAGE_ROUTE_ALIASES,
  collectStructuredPageRoutePaths,
  findStructuredPageRouteConflict,
  formatStructuredPageRouteValidationErrors,
  isReservedStructuredPageRoutePath,
  normalizeStructuredPageRoutePath,
  validateStructuredPageRouteSettings,
}
