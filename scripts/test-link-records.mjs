import assert from 'node:assert/strict'
import {
  buildLinkRecord,
  buildRouteOptions,
  detectLinkType,
  normalizeExternalLinkDestination,
  normalizeInternalLinkDestination,
  resolveLinkEditorState,
  resolveLinkRenderConfig,
} from '../src/lib/linkRecords.js'

assert.equal(normalizeInternalLinkDestination('about-us/'), '/about-us')
assert.equal(normalizeInternalLinkDestination('/car-rental-ferry-boat-info/'), '/car-barge-information')
assert.equal(normalizeInternalLinkDestination('/2bedroom/casa-blue/'), '/rental-properties/casa-blue')
assert.equal(normalizeInternalLinkDestination('?tab=pricing'), '?tab=pricing')
assert.equal(normalizeInternalLinkDestination('#details'), '#details')

assert.equal(normalizeExternalLinkDestination('example.com'), 'https://example.com')
assert.equal(normalizeExternalLinkDestination('//example.com/path'), 'https://example.com/path')
assert.equal(normalizeExternalLinkDestination('mailto:booking@example.com'), 'mailto:booking@example.com')
assert.equal(normalizeExternalLinkDestination('tel:+13405551212'), 'tel:+13405551212')
assert.equal(normalizeExternalLinkDestination('javascript:alert(1)'), '')
assert.equal(normalizeExternalLinkDestination('data:text/html,unsafe'), '')

assert.equal(detectLinkType({ path: 'https://www.stjohnhouserentals.com/car-rental-ferry-boat-info/' }, { destinationField: 'path' }), 'internal')
assert.equal(detectLinkType({ href: 'https://example.com' }, { destinationField: 'href' }), 'external')
assert.equal(detectLinkType({ href: 'mailto:booking@example.com' }, { destinationField: 'href' }), 'email')
assert.equal(detectLinkType({ href: 'tel:3405551212' }, { destinationField: 'href' }), 'phone')

const siteRouteConfig = resolveLinkRenderConfig(
  { path: 'https://www.stjohnhouserentals.com/car-rental-ferry-boat-info/' },
  { defaultType: 'internal', destinationField: 'path' },
)

assert.deepEqual(siteRouteConfig, {
  destination: '/car-barge-information',
  href: '',
  isInternal: true,
  rel: undefined,
  target: undefined,
  to: '/car-barge-information',
  type: 'internal',
})

assert.equal(
  resolveLinkEditorState(
    { path: 'https://www.stjohnhouserentals.com/2bedroom/casa-blue/' },
    { defaultType: 'internal', destinationField: 'path' },
  ).internalPath,
  '/rental-properties/casa-blue',
)

const externalRecord = buildLinkRecord(
  {},
  {
    externalUrl: 'example.com/rates',
    openInNewTab: true,
    type: 'external',
  },
)

assert.equal(externalRecord.href, 'https://example.com/rates')
assert.equal(externalRecord.target, '_blank')
assert.equal(externalRecord.rel, 'noreferrer noopener')

const unsafeRecord = buildLinkRecord(
  {},
  {
    externalUrl: 'javascript:alert(1)',
    type: 'external',
  },
)

assert.equal(unsafeRecord.href, '')

const routeOptions = buildRouteOptions([
  { group: 'main', path: '/about-us', routeAliases: ['/about'] },
  { group: 'main', path: '/about-us' },
  { group: 'internal', path: '/admin' },
  { group: 'main', path: '/rental-properties/:slug' },
])

assert.deepEqual(
  routeOptions.map((option) => option.value),
  ['/about-us', '/about'],
)

console.log('Link record tests passed.')
