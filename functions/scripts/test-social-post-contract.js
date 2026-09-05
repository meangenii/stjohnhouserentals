const assert = require('node:assert/strict')
const { createSocialPost, _test: socialTest } = require('../src/socialPostRepository')

function assertHttpError(callback, expectedStatus, expectedMessage) {
  assert.throws(callback, (error) => error?.status === expectedStatus && error.message === expectedMessage)
}

async function assertAsyncHttpError(callback, expectedStatus, expectedMessage) {
  await assert.rejects(callback, (error) => error?.status === expectedStatus && error.message === expectedMessage)
}

async function main() {
  assert.deepEqual(socialTest.normalizePlatforms(['facebook', 'FACEBOOK', 'instagram', 'unsupported']), ['facebook', 'instagram'])
  assertHttpError(
    () => socialTest.normalizePlatforms([]),
    400,
    'Select at least one platform to post to (Facebook and/or Instagram).',
  )
  assert.deepEqual(socialTest.normalizePublishedProperty({ slug: 'desert-rose-villa', name: 'Desert Rose Villa' }), {
    slug: 'desert-rose-villa',
    name: 'Desert Rose Villa',
  })
  assert.deepEqual(socialTest.normalizePublishedProperty({ slug: 'villa-without-name' }), {
    slug: 'villa-without-name',
    name: 'villa-without-name',
  })
  assertHttpError(() => socialTest.normalizePublishedProperty(null), 400, 'A property is required.')
  assert.deepEqual(
    socialTest.normalizeSummaryDateRange({ startDate: '2026-01-01', endDate: '2026-03-31' }),
    { startDate: '2026-01-01', endDate: '2026-03-31' },
  )

  // An unconfigured platform is a setup issue, not a publish failure - it must not
  // be reported the same way as an actual Graph API failure.
  assert.equal(socialTest.computePostStatus([{ status: 'published' }, { status: 'not_connected' }]), 'published')
  assert.equal(socialTest.computePostStatus([{ status: 'not_connected' }, { status: 'not_connected' }]), 'not_connected')
  assert.equal(socialTest.computePostStatus([{ status: 'failed' }, { status: 'not_connected' }]), 'failed')
  assert.equal(socialTest.computePostStatus([{ status: 'failed' }]), 'failed')

  await assertAsyncHttpError(
    () =>
      createSocialPost(
        {
          propertySlug: 'client-supplied-slug',
          propertyName: 'Client Supplied Name',
          message: 'Caption',
          platforms: ['facebook'],
        },
        { email: 'admin@example.com' },
      ),
    400,
    'A property is required.',
  )
  await assertAsyncHttpError(
    () => createSocialPost({ message: 'Caption', platforms: [] }, { email: 'admin@example.com' }, { slug: 'villa-one', name: 'Villa One' }),
    400,
    'Select at least one platform to post to (Facebook and/or Instagram).',
  )

  console.log('Social post contract checks passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
