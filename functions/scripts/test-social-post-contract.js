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
  assert.equal(
    socialTest.postMentionsProperty(
      { caption: 'A fresh look at Villa One on St. John.', permalink: 'https://www.instagram.com/p/example/' },
      ['villa one'],
    ),
    true,
  )
  const solLaVieTerms = socialTest.getPropertyMatchTerms({ name: 'Sol La Vie', slug: 'sol-la-vie', path: '/rental-properties/sol-la-vie' })
  assert.equal(solLaVieTerms.includes('sol la vie'), true)
  assert.equal(solLaVieTerms.includes('sol-la-vie'), true)
  assert.equal(solLaVieTerms.includes('sollavie'), true)
  assert.equal(solLaVieTerms.includes('rentalpropertiessollavie'), true)
  assert.equal(
    socialTest.postMentionsProperty(
      { caption: 'Sunset season at #SolLaVie in Coral Bay.' },
      socialTest.getPropertyMatchTerms({ name: 'Sol La Vie', slug: 'sol-la-vie' }),
    ),
    true,
  )
  assert.equal(
    socialTest.postMentionsProperty(
      { message: 'See the listing: https://www.stjohnhouserentals.com/rental-properties/sol-la-vie' },
      socialTest.getPropertyMatchTerms({ name: 'Sol La Vie', slug: 'sol-la-vie' }),
    ),
    true,
  )
  assert.equal(
    socialTest.postIsWithinDateRange(
      { timestamp: '2026-08-31T23:59:59+0000' },
      { startDate: '2026-08-01', endDate: '2026-08-31' },
    ),
    true,
  )
  assert.equal(
    socialTest.postIsWithinDateRange(
      { timestamp: '2026-09-01T00:00:00+0000' },
      { startDate: '2026-08-01', endDate: '2026-08-31' },
    ),
    false,
  )
  assert.equal(
    socialTest.postIsWithinDateRange(
      { createdAt: '2026-08-15T12:00:00.000Z' },
      { startDate: '2026-08-01', endDate: '2026-08-31' },
    ),
    true,
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
