const assert = require('node:assert/strict')
const {
  MAX_PAGE_ROUTE_ALIASES,
  findStructuredPageRouteConflict,
  normalizeStructuredPageRoutePath,
  validateStructuredPageRouteSettings,
} = require('../src/structuredPageRoutes')
const {
  matchAdminStructuredPageDocumentPath,
  matchAdminStructuredPagePublishPath,
  matchAdminStructuredPageRevisionListPath,
} = require('../src/siteApiRoutes')

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

function assertInvalid(page, code) {
  const validation = validateStructuredPageRouteSettings(page)
  assert.equal(validation.valid, false)
  assert.ok(validation.errors.some((error) => error.code === code), `Expected route validation code "${code}".`)
}

assert.equal(normalizeStructuredPageRoutePath(' Future/Page/ '), '/future/page')
assert.equal(normalizeStructuredPageRoutePath('https://example.com/future'), '')

const validPage = validateStructuredPageRouteSettings(makePage({ path: 'Future-Page/', routeAliases: ['/old-future-page/'] }))
assert.equal(validPage.valid, true)
assert.equal(validPage.normalizedPage.path, '/future-page')
assert.deepEqual(validPage.normalizedPage.routeAliases, ['/old-future-page'])

assertInvalid(makePage({ path: '/admin/editor-page' }), 'reserved-page-route')
assertInvalid(makePage({ path: '/api/editor-page' }), 'reserved-page-route')
assertInvalid(makePage({ path: '/future_page' }), 'invalid-page-route')
assertInvalid(makePage({ path: '/future-page?preview=true' }), 'invalid-page-route')
assertInvalid(makePage({ routeAliases: [''] }), 'missing-page-route')
assertInvalid(makePage({ routeAliases: '/legacy' }), 'invalid-page-route-aliases')
assertInvalid(makePage({ routeAliases: ['/future-page'] }), 'duplicate-page-route')
assertInvalid(makePage({ routeAliases: Array.from({ length: MAX_PAGE_ROUTE_ALIASES + 1 }, (_, index) => `/old-page-${index + 1}`) }), 'too-many-page-route-aliases')
assertInvalid(makePage({ group: '' }), 'missing-page-group')
assertInvalid(makePage({ navLabel: '' }), 'missing-navigation-label')

const conflict = findStructuredPageRouteConflict(
  [
    { key: 'existing', path: '/existing-page', routeAliases: ['/legacy-existing'] },
    { key: 'future-page', path: '/future-page' },
  ],
  makePage({ routeAliases: ['/legacy-existing'] }),
)
assert.equal(conflict.path, '/legacy-existing')
assert.equal(findStructuredPageRouteConflict([{ key: 'future-page', path: '/future-page' }], makePage()), null)

assert.equal(matchAdminStructuredPageDocumentPath('admin/content/pages/test'), 'test')
assert.equal(matchAdminStructuredPageDocumentPath('admin/content/pages/test/'), 'test')
assert.equal(matchAdminStructuredPageDocumentPath('admin/content/pages/test/revisions'), null)
assert.equal(matchAdminStructuredPageDocumentPath('admin/content/pages/test%2Frevisions'), null)
assert.equal(matchAdminStructuredPageRevisionListPath('admin/content/pages/test/revisions'), 'test')
assert.equal(matchAdminStructuredPageRevisionListPath('admin/content/pages/test/revisions/'), 'test')
assert.equal(matchAdminStructuredPagePublishPath('admin/content/pages/test/publish'), 'test')
assert.equal(matchAdminStructuredPagePublishPath('admin/content/pages/test/revisions'), null)

console.log('Structured page route tests passed.')
