const assert = require('node:assert/strict')
const { normalizeAnalyticsDateRange } = require('../src/analyticsRepository')
const { _test: invoiceTest } = require('../src/invoiceRepository')

function assertHttpError(callback, expectedMessage) {
  assert.throws(callback, (error) => error?.status === 400 && error.message === expectedMessage)
}

assert.deepEqual(normalizeAnalyticsDateRange(), { startDate: '30daysAgo', endDate: 'today' })
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
  analyticsStartDate: '2026-08-01',
  analyticsEndDate: '2026-08-31',
  lineItems: [{ description: 'Annual listing', amount: '$500.00' }],
  notes: 'Thank you.',
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
})

assert.deepEqual(normalizedDraft.propertySlugs, ['villa-one'])
assert.equal(normalizedDraft.analyticsSnapshots[0].metrics.views, 125)
assert.equal(normalizedDraft.analyticsSnapshots[0].sources[0].sessions, 50)
assert.equal(normalizedDraft.analyticsSnapshots[0].status, 'ready')

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

console.log('Invoice analytics contract checks passed.')
