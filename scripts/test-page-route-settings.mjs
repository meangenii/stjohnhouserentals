import assert from 'node:assert/strict'
import { MAX_PAGE_ROUTE_ALIASES, normalizePageRoutePath, validatePageRouteSettings } from '../src/lib/pageRouteSettings.js'

function makePage(overrides = {}) {
  return {
    blocks: [],
    contentModel: 'block-page',
    group: 'custom',
    key: 'future-page',
    navLabel: 'Future Page',
    path: '/future-page',
    routeAliases: [],
    ...overrides,
  }
}

function assertIssue(validation, code, path = '') {
  assert.ok(
    [...validation.errors, ...validation.warnings].some(
      (issue) => issue.code === code && (!path || issue.path.join('.') === path),
    ),
    `Expected page route issue "${code}"${path ? ` at ${path}` : ''}.`,
  )
}

assert.equal(normalizePageRoutePath(' Future/Page/ '), '/future/page')
assert.equal(normalizePageRoutePath('https://example.com/future'), '')

const ownRoute = validatePageRouteSettings(makePage(), {
  activeKey: 'future-page',
  routeInventory: [{ key: 'future-page', path: '/future-page', source: 'structured' }],
  structuredPages: [{ key: 'future-page', path: '/future-page' }],
})
assert.equal(ownRoute.valid, true)

const staticConflict = validatePageRouteSettings(makePage({ path: '/about-us' }), {
  routeInventory: [{ key: 'about', path: '/about-us', source: 'static' }],
})
assertIssue(staticConflict, 'page-route-conflict', 'path')

const aliasConflict = validatePageRouteSettings(makePage({ routeAliases: ['/legacy-contact'] }), {
  structuredPages: [{ key: 'contact', path: '/contact', routeAliases: ['/legacy-contact'] }],
})
assertIssue(aliasConflict, 'page-route-conflict', 'routeAliases.0')

assertIssue(validatePageRouteSettings(makePage({ path: '/admin/future' })), 'reserved-page-route', 'path')
assertIssue(validatePageRouteSettings(makePage({ path: '/api/future' })), 'reserved-page-route', 'path')
assertIssue(validatePageRouteSettings(makePage({ path: '/future_page' })), 'invalid-page-route', 'path')
assertIssue(validatePageRouteSettings(makePage({ path: '/future-page?preview=true' })), 'invalid-page-route', 'path')
assertIssue(validatePageRouteSettings(makePage({ routeAliases: [''] })), 'missing-page-route', 'routeAliases.0')
assertIssue(validatePageRouteSettings(makePage({ routeAliases: '/legacy' })), 'invalid-page-route-aliases', 'routeAliases')
assertIssue(validatePageRouteSettings(makePage({ routeAliases: ['/future-page'] })), 'duplicate-page-route', 'routeAliases.0')
assertIssue(
  validatePageRouteSettings(
    makePage({ routeAliases: Array.from({ length: MAX_PAGE_ROUTE_ALIASES + 1 }, (_, index) => `/legacy-${index + 1}`) }),
  ),
  'too-many-page-route-aliases',
  'routeAliases',
)
assertIssue(validatePageRouteSettings(makePage({ group: '' })), 'missing-page-group', 'group')
assertIssue(validatePageRouteSettings(makePage({ navLabel: '' })), 'missing-navigation-label', 'navLabel')
assertIssue(validatePageRouteSettings(makePage({ navLabel: 'N'.repeat(81) })), 'long-navigation-label', 'navLabel')
assert.equal(validatePageRouteSettings({ contentModel: 'rich-content-page' }).applies, false)

console.log('Page route settings tests passed.')
