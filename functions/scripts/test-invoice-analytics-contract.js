const assert = require('node:assert/strict')
const { normalizeAnalyticsDateRange, resolveAnalyticsDateRangeToIsoDates } = require('../src/analyticsRepository')
const { _test: invoiceTest } = require('../src/invoiceRepository')
const { createInvoicePdfBuffer, getInvoicePdfFilename, _test: invoicePdfTest } = require('../src/invoicePdf')
const { normalizeItemId: normalizeTrackableItemId } = require('../src/trackableItem')

function assertHttpError(callback, expectedMessage) {
  assert.throws(callback, (error) => error?.status === 400 && error.message === expectedMessage)
}

assert.deepEqual(normalizeAnalyticsDateRange(), { startDate: '30daysAgo', endDate: 'today' })
assert.deepEqual(
  normalizeAnalyticsDateRange({ startDate: '30daysAgo', endDate: 'today' }),
  { startDate: '30daysAgo', endDate: 'today' },
)
assert.deepEqual(
  normalizeAnalyticsDateRange({ startDate: '2026-01-01', endDate: '2026-12-31' }),
  { startDate: '2026-01-01', endDate: '2026-12-31' },
)
assertHttpError(
  () => normalizeAnalyticsDateRange({ startDate: '2026-02-30', endDate: '2026-03-01' }),
  'Analytics start and end dates must both be valid dates (YYYY-MM-DD).',
)
assertHttpError(
  () => normalizeAnalyticsDateRange({ startDate: '2026-03-02', endDate: '2026-03-01' }),
  'Analytics start date must be on or before the end date.',
)
assertHttpError(
  () => normalizeAnalyticsDateRange({ startDate: '2025-01-01', endDate: '2026-01-02' }),
  'Analytics date range must be 366 days or fewer.',
)

const normalizedDraft = invoiceTest.normalizeInvoiceDraft({
  clientId: 'client-1',
  propertySlugs: ['villa-one', 'villa-one'],
  issueDate: '2026-08-31',
  dueDate: '2026-09-30',
  serviceStartDate: '2026-09-01',
  serviceEndDate: '2027-08-31',
  analyticsStartDate: '2026-08-01',
  analyticsEndDate: '2026-08-31',
  lineItems: [{ description: 'Annual listing', amount: '$500.00' }],
  notes: 'Thank you.',
  socialMarketingReport: {
    dateLabel: 'Marketing Dates TBD',
    views: 'N/A',
    viewers: 'N/A',
    clicks: 'N/A',
    likes: '49',
    comments: '8',
    shares: '3',
  },
  analyticsSnapshots: [
    {
      propertySlug: 'villa-one',
      propertyName: 'Villa One',
      capturedAt: '2026-08-31T12:00:00.000Z',
      report: {
        status: 'ready',
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-31' },
        pagePaths: ['/rental-properties/villa-one'],
        metrics: {
          views: '125',
          activeUsers: '80',
          sessions: '90',
          engagementRate: '0.72',
          averageSessionDuration: '82.5',
        },
        sources: [{ sourceMedium: 'google / organic', sessions: '50' }],
      },
    },
  ],
  facebookPostSnapshots: [
    {
      propertySlug: 'villa-one',
      propertyName: 'Villa One',
      posts: [
        {
          externalId: '155976689882_1234567890123456',
          message: 'Check out Villa One, freshly renovated for the season!',
          permalinkUrl: 'https://www.facebook.com/155976689882/posts/1234567890123456',
          createdTime: '2026-08-15T14:32:10+0000',
          likes: '42',
          comments: '5',
          shares: '3',
        },
        {
          // A post with no externalId isn't a real match/lookup result - drop it
          // rather than store a post nobody can trace back to Facebook.
          message: 'Missing an external id',
        },
      ],
    },
  ],
  socialPostSnapshots: [
    {
      propertySlug: 'villa-one',
      propertyName: 'Villa One',
      posts: [
        {
          platform: 'instagram',
          externalId: '17895695668004550',
          message: 'Villa One from the pool deck.',
          permalinkUrl: 'https://www.instagram.com/p/example/',
          createdTime: '2026-08-16T14:32:10+0000',
          mediaType: 'IMAGE',
          likes: '7',
          comments: '3',
        },
      ],
    },
  ],
})

assert.deepEqual(normalizedDraft.propertySlugs, ['villa-one'])
assert.equal(normalizedDraft.serviceStartDate, '2026-09-01')
assert.equal(normalizedDraft.serviceEndDate, '2027-08-31')
assert.equal(normalizedDraft.analyticsStartDate, '2026-08-01')
assert.equal(normalizedDraft.analyticsEndDate, '2026-08-31')
assert.equal(normalizedDraft.analyticsSnapshots[0].metrics.views, 125)
assert.equal(normalizedDraft.analyticsSnapshots[0].sources[0].sessions, 50)
assert.equal(normalizedDraft.analyticsSnapshots[0].status, 'ready')
assert.equal(normalizedDraft.facebookPostSnapshots.length, 1)
assert.equal(normalizedDraft.facebookPostSnapshots[0].posts.length, 1)
assert.equal(normalizedDraft.facebookPostSnapshots[0].posts[0].likes, 42)
assert.equal(normalizedDraft.facebookPostSnapshots[0].posts[0].comments, 5)
assert.equal(normalizedDraft.facebookPostSnapshots[0].posts[0].shares, 3)
assert.equal(normalizedDraft.socialPostSnapshots.length, 1)
assert.equal(normalizedDraft.socialPostSnapshots[0].posts[0].platform, 'instagram')
assert.equal(normalizedDraft.socialPostSnapshots[0].posts[0].likes, 7)
assert.equal(normalizedDraft.socialMarketingReport.dateLabel, 'Marketing Dates TBD')
assert.equal(normalizedDraft.socialMarketingReport.views, 'N/A')
assert.equal(normalizedDraft.socialMarketingReport.viewers, 'N/A')
assert.equal(normalizedDraft.socialMarketingReport.clicks, 'N/A')
assert.equal(normalizedDraft.socialMarketingReport.likes, '49')
assert.equal(normalizedDraft.socialMarketingReport.comments, '8')
assert.equal(normalizedDraft.socialMarketingReport.shares, '3')

assertHttpError(
  () => invoiceTest.normalizeInvoiceDraft({
    clientId: 'client-1',
    propertySlugs: [],
    issueDate: '2026-08-31',
    lineItems: [{ description: 'Listing', amount: '500' }],
  }),
  'Select at least one property for this invoice.',
)
assertHttpError(
  () => invoiceTest.normalizeInvoiceDraft({
    clientId: 'client-1',
    propertySlugs: ['villa-one'],
    issueDate: '2026-08-31',
    dueDate: '2026-08-30',
    lineItems: [{ description: 'Listing', amount: '500' }],
  }),
  'Due date must be on or after the issue date.',
)

// A non-numeric amount must be rejected rather than silently totaling to $0.
assertHttpError(
  () => invoiceTest.normalizeInvoiceDraft({
    clientId: 'client-1',
    propertySlugs: ['villa-one'],
    issueDate: '2026-08-31',
    lineItems: [{ description: 'Listing', amount: 'abc' }],
  }),
  'Line item amount must be a valid number.',
)
// The default GA-relative date range ('30daysAgo'/'today') must resolve to real
// calendar dates for non-GA consumers (e.g. the engagement summary), not pass through.
const resolvedDefaultRange = resolveAnalyticsDateRangeToIsoDates(normalizeAnalyticsDateRange())
assert.match(resolvedDefaultRange.startDate, /^\d{4}-\d{2}-\d{2}$/)
assert.match(resolvedDefaultRange.endDate, /^\d{4}-\d{2}-\d{2}$/)
assert.deepEqual(
  resolveAnalyticsDateRangeToIsoDates({ startDate: '2026-08-01', endDate: '2026-08-31' }),
  { startDate: '2026-08-01', endDate: '2026-08-31' },
)
assert.equal(normalizeTrackableItemId('palladio%E2%80%99s-view'), 'palladio%E2%80%99s-view')
assert.equal(normalizeTrackableItemId('palladio\u2019s-view'), 'palladio\u2019s-view')
assertHttpError(
  () => normalizeTrackableItemId('rental-properties/palladio%E2%80%99s-view'),
  'A valid item id is required.',
)
assertHttpError(
  () => normalizeTrackableItemId('palladio%ZZs-view'),
  'A valid item id is required.',
)

const rehydratedInvoice = invoiceTest.normalizeStoredInvoiceRecord('invoice-1', {
  invoiceNumber: 'STJHR-2026-002',
  clientId: 'client-1',
  propertySlugs: ['villa-one'],
  lineItems: [{ description: 'Listing', amount: '500' }],
  issueDate: '2026-08-31',
  socialMarketingReport: {
    dateLabel: '',
    views: '100',
    viewers: '',
    clicks: null,
    likes: '12',
    comments: '',
    shares: null,
  },
  facebookPostSnapshots: [
    {
      propertySlug: 'villa-one',
      propertyName: 'Villa One',
      posts: [{ externalId: '155976689882_1234567890123456', likes: 1 }],
    },
  ],
})
assert.equal(rehydratedInvoice.socialMarketingReport.dateLabel, 'Marketing Dates TBD')
assert.equal(rehydratedInvoice.socialMarketingReport.views, '100')
assert.equal(rehydratedInvoice.socialMarketingReport.viewers, 'N/A')
assert.equal(rehydratedInvoice.socialMarketingReport.clicks, 'N/A')
assert.equal(rehydratedInvoice.socialMarketingReport.likes, '12')
assert.equal(rehydratedInvoice.socialMarketingReport.comments, 'N/A')
assert.equal(rehydratedInvoice.socialMarketingReport.shares, 'N/A')
assert.equal(rehydratedInvoice.socialPostSnapshots[0].posts[0].platform, 'facebook')
assert.equal(
  invoicePdfTest.getInvoiceSnapshotForProperty([
    { propertySlug: 'villa-one', metrics: { views: 10 } },
    { propertySlug: 'villa-two', metrics: { views: 20 } },
  ], 'villa-two').metrics.views,
  20,
)
assert.equal(
  invoicePdfTest.getInvoiceSnapshotForProperty([
    { propertySlug: 'villa-one', metrics: { views: 10 } },
    { propertySlug: 'villa-two', metrics: { views: 20 } },
  ], 'missing-villa'),
  null,
)
assert.equal(
  invoicePdfTest.getInvoiceSnapshotForProperty([{ propertySlug: 'legacy-single', metrics: { views: 7 } }], 'missing-villa').metrics.views,
  7,
)
assert.equal(
  invoicePdfTest.getServicePeriod({}, { subscriptionStartAt: '2025-06-01', renewalDueAt: '2026-06-01' }),
  '6-2026\nthrough\n5-2027',
)
assert.equal(
  invoicePdfTest.getServicePeriod({ analyticsStartDate: '2027-06-01', analyticsEndDate: '2028-05-31' }, { renewalDueAt: '2026-06-01' }),
  '6-2027\nthrough\n5-2028',
)
assert.equal(
  invoicePdfTest.getServicePeriod(
    {
      serviceStartDate: '2026-06-01',
      serviceEndDate: '2027-05-31',
      analyticsStartDate: '2025-06-01',
      analyticsEndDate: '2026-05-31',
    },
    { renewalDueAt: '2026-06-01' },
  ),
  '6-2026\nthrough\n5-2027',
)
assert.equal(
  invoicePdfTest.hasMeaningfulWebsiteStats(
    { status: 'ready', metrics: { views: 0, activeUsers: 0, sessions: 0, engagementRate: 0 } },
    { totalEvents: 0, counts: { siteLikes: 0, facebookShareClicks: 0 } },
  ),
  false,
)
assert.equal(
  invoicePdfTest.hasMeaningfulWebsiteStats(
    { status: 'ready', metrics: { views: 1, activeUsers: 0, sessions: 0, engagementRate: 0 } },
    { totalEvents: 0, counts: { siteLikes: 0, facebookShareClicks: 0 } },
  ),
  true,
)

async function assertInvoicePdfGeneration() {
  const invoice = {
    ...normalizedDraft,
    id: 'invoice-1',
    invoiceNumber: 'STJHR-2026-001',
    amountTotal: '500.00',
  }
  const buffer = await createInvoicePdfBuffer({
    invoice,
    client: {
      businessName: 'Villa One LLC',
      contactName: 'Client One',
      email: 'client@example.com',
      phone: '340-555-0100',
      address: 'St. John, VI',
    },
    properties: [
      {
        slug: 'villa-one',
        name: 'Villa One',
        path: '/rental-properties/villa-one',
        subscriptionStartAt: '2026-08-01',
        listingFeeInterval: 'annual',
      },
    ],
  })

  assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  assert.equal(getInvoicePdfFilename(invoice), 'STJHR-2026-001.pdf')
}

assertInvoicePdfGeneration()
  .then(() => {
    console.log('Invoice analytics and PDF contract checks passed.')
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
