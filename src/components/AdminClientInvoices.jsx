import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAdminIdToken } from '../lib/adminAuth'
import {
  createAdminClientInvoice,
  deleteAdminClientInvoice,
  downloadAdminClientInvoicePdf,
  emailAdminClientInvoicePdf,
  listAdminClientInvoices,
  refreshAdminClientInvoiceSocialMarketing,
  updateAdminClientInvoiceStatus,
} from '../lib/adminClientApi'
import { findAdminSocialPostsForProperty } from '../lib/adminSocialApi'
import { useSiteShellContent } from '../lib/useSiteContent'
import siteLogoFallback from '../content/site_logo.png'
import {
  siteOrigin as SITE_ORIGIN,
  companyName as COMPANY_NAME,
  dbaName as DBA_NAME,
  payeeName as PAYEE_NAME,
  companyAddressLines as COMPANY_ADDRESS_LINES,
  companyEmail as COMPANY_EMAIL,
} from '../../shared/invoiceBranding.json'

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void']
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_ANNUAL_INVOICE_AMOUNT = '300'
const ANNUAL_INVOICE_MONTH_COUNT = 12

function getLocalDateOnly(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function addDays(dateOnly, dayCount) {
  const source = DATE_ONLY_PATTERN.test(String(dateOnly ?? '')) ? `${dateOnly}T12:00:00` : new Date()
  const date = source instanceof Date ? source : new Date(source)
  date.setDate(date.getDate() + dayCount)
  return getLocalDateOnly(date)
}

function addMonths(dateOnly, monthCount) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return ''
  }

  const date = new Date(`${dateOnly}T12:00:00`)
  date.setMonth(date.getMonth() + monthCount)
  return getLocalDateOnly(date)
}

function getAnnualServiceEndDate(startDate) {
  return startDate ? addDays(addMonths(startDate, ANNUAL_INVOICE_MONTH_COUNT), -1) : ''
}

function getAnnualInvoiceAmount(property) {
  const amount = String(property?.listingFeeAmount ?? '').trim()
  return amount || DEFAULT_ANNUAL_INVOICE_AMOUNT
}

function getBillableServicePeriod(property) {
  const renewalStartDate = normalizeDateOnly(property?.renewalDueAt)
  const subscriptionStartDate = normalizeDateOnly(property?.subscriptionStartAt)
  const serviceStartDate = renewalStartDate || subscriptionStartDate

  return {
    startDate: serviceStartDate,
    endDate: getAnnualServiceEndDate(serviceStartDate),
  }
}

function getMarketingStatsPeriod(property) {
  const renewalStartDate = normalizeDateOnly(property?.renewalDueAt)
  const subscriptionStartDate = normalizeDateOnly(property?.subscriptionStartAt)

  if (renewalStartDate) {
    const marketingStartDate = addMonths(renewalStartDate, -ANNUAL_INVOICE_MONTH_COUNT)

    return {
      startDate: marketingStartDate,
      endDate: addDays(renewalStartDate, -1),
    }
  }

  return {
    startDate: subscriptionStartDate,
    endDate: getAnnualServiceEndDate(subscriptionStartDate),
  }
}

function getDerivedInvoiceDates(property) {
  const servicePeriod = getBillableServicePeriod(property)
  const marketingStatsPeriod = getMarketingStatsPeriod(property)
  const issueDate = getLocalDateOnly()

  return {
    issueDate,
    serviceStartDate: servicePeriod.startDate,
    serviceEndDate: servicePeriod.endDate,
    analyticsStartDate: marketingStatsPeriod.startDate,
    analyticsEndDate: marketingStatsPeriod.endDate,
  }
}

function formatDate(dateOnly) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return String(dateOnly ?? '')
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${dateOnly}T00:00:00Z`))
}

function formatInvoiceDate(dateOnly) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return String(dateOnly ?? '')
  }

  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateOnly}T00:00:00Z`))
}

function formatMonthYear(dateOnly) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return ''
  }

  const [year, month] = dateOnly.split('-')
  return `${Number(month)}-${year}`
}

function readAmount(value) {
  const amount = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(readAmount(value))
}

function formatOptionalNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number) : 'N/A'
}

function formatInvoiceStatValue(value) {
  const normalized = String(value ?? '').trim()

  if (!normalized || normalized.toUpperCase() === 'N/A') {
    return 'N/A'
  }

  const number = Number(normalized.replace(/,/g, ''))

  if (Number.isFinite(number) && number <= 0) {
    return 'N/A'
  }

  return normalized
}

function formatInvoiceStatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number) : 'N/A'
}

function hasPositiveInvoiceStatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

function formatInvoiceStatPercent(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(number * 100)}%` : 'N/A'
}

function formatInvoiceCurrency(value) {
  const amount = readAmount(value)

  if (Number.isInteger(amount)) {
    return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`
  }

  return formatCurrency(amount)
}

function getInvoicePdfFallbackFilename(invoice) {
  const invoiceNumber = String(invoice?.invoiceNumber || invoice?.id || 'invoice').trim()
  const safeName = invoiceNumber.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invoice'
  return `${safeName}.pdf`
}

function downloadBlob(blob, filename) {
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
}

function getClientName(client) {
  return client?.businessName || client?.contactName || client?.email || 'Client'
}

function normalizeDateOnly(dateOnly) {
  const normalized = String(dateOnly ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function getPropertyUrl(property, fallbackSlug = '') {
  const rawPath = String(property?.path || (fallbackSlug ? `/rental-properties/${fallbackSlug}` : '')).trim()

  if (!rawPath) {
    return SITE_ORIGIN
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath
  }

  return `${SITE_ORIGIN}${rawPath.startsWith('/') ? rawPath : `/${rawPath}`}`
}

function getPropertyLineDescription(property) {
  return getPropertyUrl(property, property?.slug)
}

function getServicePeriod(invoice, property) {
  const startDate = normalizeDateOnly(invoice?.serviceStartDate)
    || normalizeDateOnly(invoice?.analyticsStartDate)
    || normalizeDateOnly(property?.renewalDueAt)
    || normalizeDateOnly(property?.subscriptionStartAt)
    || normalizeDateOnly(invoice?.issueDate)
  const endDate = normalizeDateOnly(invoice?.serviceEndDate)
    || normalizeDateOnly(invoice?.analyticsEndDate)
    || getAnnualServiceEndDate(startDate)
  const startLabel = formatMonthYear(startDate)
  const endLabel = formatMonthYear(endDate)

  if (startLabel && endLabel && startLabel !== endLabel) {
    return `${startLabel}\nthrough\n${endLabel}`
  }

  return startLabel || ''
}

function getClientInvoiceLines(client) {
  const businessName = String(client?.businessName ?? '').trim()
  const contactName = String(client?.contactName ?? '').trim()
  const phone = String(client?.phone ?? '').trim()
  const address = String(client?.address ?? '').trim()
  const email = String(client?.email ?? '').trim()

  return Array.from(new Set([businessName, contactName, phone, address, email].filter(Boolean)))
}

function getServiceDescriptionLabel(description) {
  const normalized = String(description ?? '').trim().replace(/[\u2013\u2014]/g, '-')

  if (!normalized || /property listing/i.test(normalized) || /^https?:\/\//i.test(normalized) || normalized.startsWith('/')) {
    return 'Website listing services for'
  }

  return normalized
}

function getMarketingDateLabel(dateSource = {}) {
  const startDate = normalizeDateOnly(dateSource.analyticsStartDate)
  const endDate = normalizeDateOnly(dateSource.analyticsEndDate)

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  }

  return 'Marketing Dates TBD'
}

function syncSocialMarketingReportDateLabel(report, dateSource = {}) {
  return {
    ...(report || createSocialMarketingReport()),
    dateLabel: getMarketingDateLabel(dateSource),
  }
}

function createSocialMarketingReport(dateSource = {}) {
  return {
    dateLabel: getMarketingDateLabel(dateSource),
    views: 'N/A',
    viewers: 'N/A',
    clicks: 'N/A',
    likes: 'N/A',
    comments: 'N/A',
    shares: 'N/A',
  }
}

function getInvoiceSnapshotForProperty(snapshots, propertySlug) {
  const normalizedSlug = String(propertySlug ?? '').trim()
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : []
  const exactSnapshot = normalizedSnapshots.find((snapshot) => String(snapshot?.propertySlug ?? '').trim() === normalizedSlug)

  if (exactSnapshot) {
    return exactSnapshot
  }

  return normalizedSnapshots.length === 1 ? normalizedSnapshots[0] : null
}

function sumSocialPostMetric(posts, key) {
  const values = posts
    .map((post) => post?.[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))

  if (values.length === 0) {
    return null
  }

  return values.reduce((sum, value) => sum + value, 0)
}

function formatSocialMetric(value) {
  return formatInvoiceStatNumber(value)
}

function createPlatformSocialMarketingReport(posts, platform) {
  const platformPosts = (Array.isArray(posts) ? posts : [])
    .filter((post) => String(post?.platform ?? '').trim().toLowerCase() === platform)

  return {
    postCount: platformPosts.length,
    views: formatSocialMetric(sumSocialPostMetric(platformPosts, 'views')),
    viewers: formatSocialMetric(sumSocialPostMetric(platformPosts, 'viewers')),
    clicks: formatSocialMetric(sumSocialPostMetric(platformPosts, 'clicks')),
    likes: formatSocialMetric(sumSocialPostMetric(platformPosts, 'likes')),
    comments: formatSocialMetric(sumSocialPostMetric(platformPosts, 'comments')),
    shares: formatSocialMetric(sumSocialPostMetric(platformPosts, 'shares')),
  }
}

function createSocialPlatformReports(posts) {
  return {
    facebook: createPlatformSocialMarketingReport(posts, 'facebook'),
    instagram: createPlatformSocialMarketingReport(posts, 'instagram'),
  }
}

function createSocialMarketingReportFromSocialPosts(posts, dateSource = {}) {
  return {
    dateLabel: getMarketingDateLabel(dateSource),
    views: formatSocialMetric(sumSocialPostMetric(posts, 'views')),
    viewers: formatSocialMetric(sumSocialPostMetric(posts, 'viewers')),
    clicks: formatSocialMetric(sumSocialPostMetric(posts, 'clicks')),
    likes: formatSocialMetric(sumSocialPostMetric(posts, 'likes')),
    comments: formatSocialMetric(sumSocialPostMetric(posts, 'comments')),
    shares: formatSocialMetric(sumSocialPostMetric(posts, 'shares')),
    ...createSocialPlatformReports(posts),
  }
}

function createSocialPostSnapshot(property, posts) {
  const normalizedPosts = Array.isArray(posts) ? posts : []

  if (!property?.slug || normalizedPosts.length === 0) {
    return []
  }

  return [
    {
      propertySlug: property.slug,
      propertyName: property.name || property.slug,
      posts: normalizedPosts,
    },
  ]
}

function createAnalyticsSnapshot(property, report, reportPropertySlug = '') {
  if (!property?.slug || report?.status !== 'ready') {
    return []
  }

  if (reportPropertySlug && reportPropertySlug !== property.slug) {
    return []
  }

  return [
    {
      propertySlug: property.slug,
      propertyName: property.name || property.slug,
      capturedAt: new Date().toISOString(),
      report,
    },
  ]
}

function getSocialPlatformLabel(platform) {
  return platform === 'instagram' ? 'Instagram' : 'Facebook'
}

function getSocialMarketingPlatformRows(report, socialPostSnapshot) {
  const posts = Array.isArray(socialPostSnapshot?.posts) ? socialPostSnapshot.posts : []

  if (posts.length > 0) {
    const platformReports = createSocialPlatformReports(posts)
    return [
      { platform: 'Facebook', ...platformReports.facebook },
      { platform: 'Instagram', ...platformReports.instagram },
    ]
  }

  if (report?.facebook || report?.instagram) {
    return [
      { platform: 'Facebook', ...(report.facebook || createSocialMarketingReport()) },
      { platform: 'Instagram', ...(report.instagram || createSocialMarketingReport()) },
    ]
  }

  return []
}

function formatPostDate(createdTime) {
  return formatDate(normalizeDateOnly(createdTime) || createdTime)
}

function createInvoiceDraft(property) {
  const derivedDates = getDerivedInvoiceDates(property)

  return {
    propertySlug: property?.slug ?? '',
    ...derivedDates,
    lineItems: [
      {
        description: getPropertyLineDescription(property),
        amount: getAnnualInvoiceAmount(property),
      },
    ],
    socialMarketingReport: createSocialMarketingReport(derivedDates),
  }
}

function InvoiceSocialMarketingReport({ report, socialPostSnapshot }) {
  if (!report) {
    return null
  }

  const platformRows = getSocialMarketingPlatformRows(report, socialPostSnapshot)

  return (
    <div className="admin-client-invoice-marketing-report">
      <strong>Facebook and Instagram marketing.</strong>
      <p>Statistics &quot;{report.dateLabel || 'Marketing Dates TBD'}&quot;:</p>
      {platformRows.length > 0 ? platformRows.map((row) => (
        <p key={row.platform}>
          <strong>{row.platform} stats:</strong>{' '}
          Views: {formatInvoiceStatValue(row.views)} Viewers: {formatInvoiceStatValue(row.viewers)} Clicks:{' '}
          {formatInvoiceStatValue(row.clicks)} Likes: {formatInvoiceStatValue(row.likes)} Comments:{' '}
          {formatInvoiceStatValue(row.comments)} Shares: {formatInvoiceStatValue(row.shares)}
        </p>
      )) : (
        <>
          <p>Combined Facebook and Instagram stats:</p>
          <p>
            Views: {formatInvoiceStatValue(report.views)} Viewers: {formatInvoiceStatValue(report.viewers)} Clicks:{' '}
            {formatInvoiceStatValue(report.clicks)}
          </p>
          <p>
            Likes: {formatInvoiceStatValue(report.likes)} Comments: {formatInvoiceStatValue(report.comments)} Shares:{' '}
            {formatInvoiceStatValue(report.shares)}
          </p>
        </>
      )}
    </div>
  )
}

function InvoiceWebsiteStatsReport({ analyticsSnapshot, engagementSnapshot }) {
  const metrics = analyticsSnapshot?.metrics ?? {}
  const counts = engagementSnapshot?.counts ?? {}
  const hasAnalytics = analyticsSnapshot?.status === 'ready'
  const hasEngagementActivity = [
    engagementSnapshot?.totalEvents,
    counts.siteLikes,
    counts.facebookShareClicks,
  ].some(hasPositiveInvoiceStatNumber)

  return (
    <div className="admin-client-invoice-marketing-report admin-client-invoice-website-report">
      <strong>Google Analytics website statistics.</strong>
      <p>
        Views: {hasAnalytics ? formatInvoiceStatNumber(metrics.views) : 'N/A'} Visitors:{' '}
        {hasAnalytics ? formatInvoiceStatNumber(metrics.activeUsers) : 'N/A'} Sessions:{' '}
        {hasAnalytics ? formatInvoiceStatNumber(metrics.sessions) : 'N/A'}
      </p>
      <p>Engagement rate: {hasAnalytics ? formatInvoiceStatPercent(metrics.engagementRate) : 'N/A'}</p>
      {hasEngagementActivity ? (
        <p>
          On-site activity: {formatInvoiceStatNumber(engagementSnapshot.totalEvents)} total /{' '}
          {formatInvoiceStatNumber(counts.siteLikes)} likes / {formatInvoiceStatNumber(counts.facebookShareClicks)} Facebook shares
        </p>
      ) : null}
    </div>
  )
}

function SavedInvoice({
  actionState,
  client,
  invoice,
  expanded,
  logoUrl,
  properties,
  printTarget,
  statusBusy,
  onDeleteInvoice,
  onEmailPdf,
  onPrint,
  onRefreshSocialMarketing,
  onSavePdf,
  onStatusChange,
  onToggle,
}) {
  const propertyNames = invoice.propertySlugs.map((slug) => properties.find((property) => property.slug === slug)?.name || slug)
  const socialMarketingReport = invoice.socialMarketingReport ?? null
  const primaryPropertySlug = invoice.propertySlugs[0] ?? ''
  const primaryProperty = properties.find((property) => property.slug === primaryPropertySlug) ?? null
  const servicePeriod = getServicePeriod(invoice, primaryProperty)
  const clientLines = getClientInvoiceLines(client)
  const clientEmail = String(client?.email ?? '').trim()
  const invoiceAction = actionState?.invoiceId === invoice.id ? actionState : null
  const isPdfBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'save-pdf'
  const isEmailBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'email-pdf'
  const isDeleteBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'delete'
  const isSocialRefreshBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'refresh-social'
  const isActionBusy = isPdfBusy || isEmailBusy || isDeleteBusy || isSocialRefreshBusy
  const isDeletable = invoice.status === 'draft' || invoice.status === 'void'
  const canRefreshSocialMarketing = invoice.status === 'draft' && normalizeDateOnly(invoice.analyticsStartDate) && normalizeDateOnly(invoice.analyticsEndDate)
  const isExpanded = expanded || printTarget
  const documentId = `admin-client-invoice-document-${invoice.id}`

  return (
    <article className={`admin-client-saved-invoice ${printTarget ? 'admin-client-invoice-print-target' : ''}`.trim()}>
      <div className="admin-client-saved-invoice-toolbar admin-client-invoice-no-print">
        <button
          aria-controls={documentId}
          aria-expanded={isExpanded}
          className="admin-client-saved-invoice-toggle"
          type="button"
          onClick={() => onToggle(invoice.id)}
        >
          <span className="admin-client-saved-invoice-toggle-icon" aria-hidden="true">{isExpanded ? 'v' : '>'}</span>
          <strong>{invoice.invoiceNumber}</strong>
        </button>
        <div className="admin-inline-actions">
          <label className="admin-client-invoice-status-field">
            <span className="visually-hidden">Invoice status</span>
            <select
              aria-label={`Status for ${invoice.invoiceNumber}`}
              disabled={statusBusy}
              value={invoice.status}
              onChange={(event) => onStatusChange(invoice.id, event.target.value)}
            >
              {INVOICE_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={() => onPrint(invoice.id)}>
            Print
          </button>
          <button
            className="button-link button-link--ghost admin-action"
            disabled={isActionBusy || !canRefreshSocialMarketing}
            title={
              canRefreshSocialMarketing
                ? 'Refresh Facebook and Instagram stats for this draft invoice.'
                : 'Only draft invoices with a marketing stats period can refresh social stats.'
            }
            type="button"
            onClick={() => onRefreshSocialMarketing(invoice)}
          >
            {isSocialRefreshBusy ? 'Refreshing...' : 'Refresh stats'}
          </button>
          <button
            className="button-link button-link--ghost admin-action"
            disabled={isActionBusy}
            type="button"
            onClick={() => onSavePdf(invoice)}
          >
            {isPdfBusy ? 'Saving...' : 'Save PDF'}
          </button>
          <button
            className="button-link button-link--ghost admin-action"
            disabled={isActionBusy || !clientEmail}
            title={clientEmail ? `Email PDF to ${clientEmail}` : 'Add a client email before emailing this invoice.'}
            type="button"
            onClick={() => onEmailPdf(invoice)}
          >
            {isEmailBusy ? 'Emailing...' : 'Email PDF'}
          </button>
          <button
            className="button-link button-link--ghost admin-action"
            disabled={isActionBusy || !isDeletable}
            title={isDeletable ? undefined : 'Only draft or void invoices can be deleted. Set this invoice to void first to retire it.'}
            type="button"
            onClick={() => onDeleteInvoice(invoice)}
          >
            {isDeleteBusy ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
      {invoiceAction?.message ? (
        <p
          className={`admin-client-invoice-action-feedback admin-client-invoice-no-print admin-feedback admin-feedback--${
            invoiceAction.state === 'error' ? 'error' : 'idle'
          }`}
        >
          {invoiceAction.message}
        </p>
      ) : null}

      {!isExpanded ? (
        <p className="admin-client-saved-invoice-summary admin-client-invoice-no-print">
          <span>{getClientName(client)}</span>
          <span>{propertyNames.join(', ') || primaryPropertySlug}</span>
          <span>{formatDate(invoice.issueDate)}</span>
          <span>{formatCurrency(invoice.amountTotal)}</span>
        </p>
      ) : null}

      {isExpanded ? (
        <div className="admin-client-invoice-document" id={documentId}>
          <header className="admin-client-invoice-document-header">
            <div className="admin-client-invoice-brand">
              <span className="admin-client-invoice-logo-mark" aria-hidden="true"><img alt="" src={logoUrl} /></span>
              <strong aria-label={COMPANY_NAME}>
                <span>St. John House</span>
                <span>Rentals</span>
              </strong>
            </div>
          </header>

          <div className="admin-client-invoice-party-row">
            <section className="admin-client-invoice-client">
              <strong>Client:</strong>
              {clientLines.length > 0 ? clientLines.map((line) => <span key={line}>{line}</span>) : <span>{getClientName(client)}</span>}
            </section>

            <section className="admin-client-invoice-date-block">
              <strong>Invoice Date:</strong>
              <span>{formatInvoiceDate(invoice.issueDate)}</span>
            </section>
          </div>

          <table className="admin-client-invoice-line-table">
            <thead>
              <tr>
                <th>Date of Service</th>
                <th>Service Description</th>
                <th>Amount</th>
                <th>Amount Due</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item, index) => {
                const rowPropertySlug = invoice.propertySlugs[index] ?? primaryPropertySlug
                const rowProperty = properties.find((property) => property.slug === rowPropertySlug) ?? primaryProperty
                const propertyName = rowProperty?.name || propertyNames[index] || propertyNames[0] || rowPropertySlug
                const propertyUrl = getPropertyUrl(rowProperty, rowPropertySlug)
                const rowAnalyticsSnapshot = getInvoiceSnapshotForProperty(invoice.analyticsSnapshots, rowPropertySlug)
                const rowEngagementSnapshot = getInvoiceSnapshotForProperty(invoice.engagementSnapshots, rowPropertySlug)
                const rowSocialPostSnapshot = getInvoiceSnapshotForProperty(invoice.socialPostSnapshots, rowPropertySlug)
                const showPropertyDetails = Boolean(propertyName)

                return (
                  <tr key={`${item.description}-${index}`}>
                    <td className="admin-client-invoice-service-period">{index === 0 ? servicePeriod : ''}</td>
                    <td className="admin-client-invoice-service-description">
                      <p>{getServiceDescriptionLabel(item.description)}</p>
                      {showPropertyDetails ? (
                        <>
                          <strong>{propertyName}</strong>
                          <a href={propertyUrl}>{propertyUrl}</a>
                          <InvoiceWebsiteStatsReport analyticsSnapshot={rowAnalyticsSnapshot} engagementSnapshot={rowEngagementSnapshot} />
                          <InvoiceSocialMarketingReport report={socialMarketingReport} socialPostSnapshot={rowSocialPostSnapshot} />
                        </>
                      ) : null}
                    </td>
                    <td />
                    <td>{formatInvoiceCurrency(item.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <th>Total Due:</th>
                <th>{formatInvoiceCurrency(invoice.amountTotal)}</th>
              </tr>
            </tfoot>
          </table>

          {invoice.notes ? <section className="admin-client-invoice-notes"><p>{invoice.notes}</p></section> : null}

          <section className="admin-client-invoice-payment-copy">
            <p>
              Please contact me with any listing changes, seasonal including rates and dates. Payment is due upon receipt.{' '}
              <strong>Please make checks payable to {PAYEE_NAME}.</strong> Payments can be sent to:
            </p>
            <address>
              <span>{PAYEE_NAME}</span>
              {COMPANY_ADDRESS_LINES.map((line) => <span key={line}>{line}</span>)}
            </address>
          </section>

          <footer className="admin-client-invoice-footer">
            <div>
              <strong>{DBA_NAME}</strong>
              <a href={SITE_ORIGIN}>{SITE_ORIGIN.replace(/^https?:\/\//, '')}</a>
            </div>
            <address>
              {COMPANY_ADDRESS_LINES.map((line) => <span key={line}>{line}</span>)}
              <a href={`mailto:${COMPANY_EMAIL}`}>{COMPANY_EMAIL}</a>
            </address>
          </footer>
        </div>
      ) : null}
    </article>
  )
}

export function AdminClientInvoices({
  authUser,
  client,
  selectedPropertyAnalyticsReport,
  selectedPropertyAnalyticsSlug = '',
  properties,
  selectedPropertySlug,
  onSelectedPropertySlugChange,
}) {
  const siteShell = useSiteShellContent()
  const logoUrl = String(siteShell?.header?.logo?.url ?? '').trim() || siteLogoFallback
  const selectedProperty = properties.find((property) => property.slug === selectedPropertySlug) ?? properties[0] ?? null
  const [draft, setDraft] = useState(() => createInvoiceDraft(selectedProperty))
  const [invoiceState, setInvoiceState] = useState({ state: 'idle', invoices: [], message: '' })
  const [createStatus, setCreateStatus] = useState({ state: 'idle', message: '' })
  const [socialMarketingState, setSocialMarketingState] = useState({ state: 'idle', posts: [], message: '' })
  const [statusBusyId, setStatusBusyId] = useState('')
  const [invoiceActionState, setInvoiceActionState] = useState({ invoiceId: '', action: '', state: 'idle', message: '' })
  const [expandedInvoiceId, setExpandedInvoiceId] = useState('')
  const [printInvoiceId, setPrintInvoiceId] = useState('')
  const createInvoiceRequestIdRef = useRef(0)
  const autoSocialLookupKeyRef = useRef('')
  const socialMarketingRequestIdRef = useRef(0)
  const propertyKey = properties.map((property) => property.slug).join('|')
  const selectedPropertyListingFeeAmount = selectedProperty?.listingFeeAmount
  const selectedPropertyPath = selectedProperty?.path
  const selectedPropertyRenewalDueAt = selectedProperty?.renewalDueAt
  const selectedPropertySlugValue = selectedProperty?.slug
  const selectedPropertySubscriptionStartAt = selectedProperty?.subscriptionStartAt
  const selectedPropertyDraftSource = useMemo(
    () =>
      selectedPropertySlugValue
        ? {
            listingFeeAmount: selectedPropertyListingFeeAmount,
            path: selectedPropertyPath,
            renewalDueAt: selectedPropertyRenewalDueAt,
            slug: selectedPropertySlugValue,
            subscriptionStartAt: selectedPropertySubscriptionStartAt,
          }
        : null,
    [
      selectedPropertyListingFeeAmount,
      selectedPropertyPath,
      selectedPropertyRenewalDueAt,
      selectedPropertySlugValue,
      selectedPropertySubscriptionStartAt,
    ],
  )
  const draftProperty = properties.find((property) => property.slug === draft.propertySlug) ?? null
  const billableServicePeriod = getBillableServicePeriod(draftProperty)
  const billableServiceStartDate = billableServicePeriod.startDate
  const amountTotal = useMemo(() => draft.lineItems.reduce((sum, item) => sum + readAmount(item.amount), 0), [draft.lineItems])
  const invoiceServiceStartDate = normalizeDateOnly(draft.serviceStartDate)
  const invoiceServiceEndDate = normalizeDateOnly(draft.serviceEndDate)
  const marketingStatsStartDate = normalizeDateOnly(draft.analyticsStartDate)
  const marketingStatsEndDate = normalizeDateOnly(draft.analyticsEndDate)
  const serviceDatesAreValid =
    DATE_ONLY_PATTERN.test(invoiceServiceStartDate) &&
    DATE_ONLY_PATTERN.test(invoiceServiceEndDate) &&
    invoiceServiceStartDate <= invoiceServiceEndDate
  const datesAreQueryable =
    DATE_ONLY_PATTERN.test(marketingStatsStartDate) &&
    DATE_ONLY_PATTERN.test(marketingStatsEndDate) &&
    marketingStatsStartDate <= marketingStatsEndDate
  const canGenerateInvoice = Boolean(draft.propertySlug && billableServiceStartDate && serviceDatesAreValid && datesAreQueryable)

  useEffect(() => {
    const nextDraft = createInvoiceDraft(selectedPropertyDraftSource)

    setDraft(nextDraft)
    setCreateStatus({ state: 'idle', message: '' })
    setSocialMarketingState({ state: 'idle', posts: [], message: '' })
  }, [
    propertyKey,
    selectedPropertyDraftSource,
    selectedPropertySlug,
  ])

  useEffect(() => {
    if (!authUser?.uid || !client?.id) {
      setInvoiceState({ state: 'idle', invoices: [], message: '' })
      setExpandedInvoiceId('')
      return undefined
    }

    let cancelled = false

    async function loadInvoices() {
      setInvoiceState({ state: 'loading', invoices: [], message: '' })
      setExpandedInvoiceId('')

      try {
        const authToken = await getAdminIdToken()

        if (!authToken) {
          throw new Error('Sign in to view invoices.')
        }

        const invoices = await listAdminClientInvoices(client.id, { authToken })

        if (!cancelled) {
          setInvoiceState({ state: 'ready', invoices, message: '' })
        }
      } catch (error) {
        if (!cancelled) {
          setInvoiceState({
            state: 'error',
            invoices: [],
            message: error instanceof Error ? error.message : 'Unable to load invoices.',
          })
        }
      }
    }

    loadInvoices()
    return () => { cancelled = true }
  }, [authUser?.uid, client?.id])

  useEffect(() => {
    if (expandedInvoiceId && !invoiceState.invoices.some((invoice) => invoice.id === expandedInvoiceId)) {
      setExpandedInvoiceId('')
    }
  }, [expandedInvoiceId, invoiceState.invoices])

  useEffect(() => {
    function finishPrinting() {
      document.body.classList.remove('admin-invoice-printing')
      setPrintInvoiceId('')
    }

    window.addEventListener('afterprint', finishPrinting)
    return () => {
      window.removeEventListener('afterprint', finishPrinting)
      document.body.classList.remove('admin-invoice-printing')
    }
  }, [])

  function handleIssueDateChange(value) {
    setDraft((current) => ({ ...current, issueDate: value }))
    setCreateStatus({ state: 'idle', message: '' })
  }

  function handleSocialMarketingReportFieldChange(field, value) {
    setDraft((current) => ({
      ...current,
      socialMarketingReport: {
        ...(current.socialMarketingReport || createSocialMarketingReport(current)),
        dateLabel: getMarketingDateLabel(current),
        [field]: value,
      },
    }))
    setCreateStatus({ state: 'idle', message: '' })
  }

  function handlePropertyChange(slug) {
    createInvoiceRequestIdRef.current += 1
    socialMarketingRequestIdRef.current += 1
    autoSocialLookupKeyRef.current = ''
    const property = properties.find((candidate) => candidate.slug === slug)
    const derivedDates = getDerivedInvoiceDates(property)
    const nextDraft = {
      propertySlug: slug,
      ...derivedDates,
      lineItems: [{ description: getPropertyLineDescription(property), amount: getAnnualInvoiceAmount(property) }],
      socialMarketingReport: createSocialMarketingReport(derivedDates),
    }

    setDraft((current) => ({
      ...current,
      ...nextDraft,
    }))
    onSelectedPropertySlugChange?.(property?.slug || slug)
    setCreateStatus({ state: 'idle', message: '' })
    setSocialMarketingState({ state: 'idle', posts: [], message: '' })
  }

  const loadSocialMarketingReportForDraft = useCallback(async ({
    propertySlug = draft.propertySlug,
    analyticsStartDate = draft.analyticsStartDate,
    analyticsEndDate = draft.analyticsEndDate,
    showValidationError = true,
  } = {}) => {
    const queryable =
      DATE_ONLY_PATTERN.test(analyticsStartDate) &&
      DATE_ONLY_PATTERN.test(analyticsEndDate) &&
      analyticsStartDate <= analyticsEndDate

    if (!propertySlug || !queryable) {
      socialMarketingRequestIdRef.current += 1

      if (showValidationError) {
        setSocialMarketingState({ state: 'error', posts: [], message: 'Set a property and marketing stats period first.' })
      }

      return null
    }

    const requestId = socialMarketingRequestIdRef.current + 1
    socialMarketingRequestIdRef.current = requestId
    setSocialMarketingState({ state: 'loading', posts: [], message: '' })
    setCreateStatus({ state: 'idle', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to load social marketing stats.')
      }

      const result = await findAdminSocialPostsForProperty(propertySlug, {
        authToken,
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
      })

      if (requestId !== socialMarketingRequestIdRef.current) {
        return null
      }

      if (result?.status !== 'ready') {
        throw new Error(result?.message || 'Unable to load social marketing stats.')
      }

      const posts = Array.isArray(result.posts) ? result.posts : []
      const dateSource = {
        analyticsStartDate: result.dateRange?.startDate || analyticsStartDate,
        analyticsEndDate: result.dateRange?.endDate || analyticsEndDate,
      }

      setDraft((current) => ({
        ...current,
        socialMarketingReport:
          current.propertySlug === propertySlug &&
          current.analyticsStartDate === analyticsStartDate &&
          current.analyticsEndDate === analyticsEndDate
            ? createSocialMarketingReportFromSocialPosts(posts, dateSource)
            : current.socialMarketingReport,
      }))
      setSocialMarketingState({
        state: 'ready',
        posts,
        message: posts.length > 0 ? `${posts.length} social post${posts.length === 1 ? '' : 's'} loaded.` : 'No matching Facebook or Instagram posts found.',
      })

      return { posts, result }
    } catch (error) {
      if (requestId !== socialMarketingRequestIdRef.current) {
        return null
      }

      setSocialMarketingState({
        state: 'error',
        posts: [],
        message: error instanceof Error ? error.message : 'Unable to load social marketing stats.',
      })

      return null
    }
  }, [draft.analyticsEndDate, draft.analyticsStartDate, draft.propertySlug])

  async function handleLoadSocialMarketingReport() {
    await loadSocialMarketingReportForDraft()
  }

  useEffect(() => {
    const lookupKey = `${authUser?.uid || ''}|${draft.propertySlug}|${draft.analyticsStartDate}|${draft.analyticsEndDate}`

    if (!authUser?.uid || !draft.propertySlug || !datesAreQueryable) {
      autoSocialLookupKeyRef.current = ''
      socialMarketingRequestIdRef.current += 1
      return
    }

    if (autoSocialLookupKeyRef.current === lookupKey) {
      return
    }

    autoSocialLookupKeyRef.current = lookupKey
    loadSocialMarketingReportForDraft({
      propertySlug: draft.propertySlug,
      analyticsStartDate: draft.analyticsStartDate,
      analyticsEndDate: draft.analyticsEndDate,
      showValidationError: false,
    })
  }, [authUser?.uid, datesAreQueryable, draft.analyticsEndDate, draft.analyticsStartDate, draft.propertySlug, loadSocialMarketingReportForDraft])

  async function handleCreateInvoice(event) {
    event.preventDefault()

    if (createStatus.state === 'saving') {
      return
    }

    const requestId = createInvoiceRequestIdRef.current + 1
    createInvoiceRequestIdRef.current = requestId
    const invoiceProperty = properties.find((property) => property.slug === draft.propertySlug) ?? draftProperty
    const subscriptionDates = getDerivedInvoiceDates(invoiceProperty)
    const lineItem = {
      description: getPropertyLineDescription(invoiceProperty),
      amount: getAnnualInvoiceAmount(invoiceProperty),
    }

    if (!getBillableServicePeriod(invoiceProperty).startDate) {
      setCreateStatus({
        state: 'error',
        message: 'Set and save this property\'s subscription or renewal date before generating the annual invoice.',
      })
      return
    }

    if (!DATE_ONLY_PATTERN.test(draft.issueDate)) {
      setCreateStatus({ state: 'error', message: 'Set a valid invoice date before generating this invoice.' })
      return
    }

    setCreateStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to generate an invoice.')
      }

      const invoice = await createAdminClientInvoice(
        client.id,
        {
          propertySlugs: [draft.propertySlug],
          issueDate: draft.issueDate,
          serviceStartDate: subscriptionDates.serviceStartDate,
          serviceEndDate: subscriptionDates.serviceEndDate,
          analyticsStartDate: subscriptionDates.analyticsStartDate,
          analyticsEndDate: subscriptionDates.analyticsEndDate,
          lineItems: [lineItem],
          analyticsSnapshots: createAnalyticsSnapshot(invoiceProperty, selectedPropertyAnalyticsReport, selectedPropertyAnalyticsSlug),
          socialMarketingReport: syncSocialMarketingReportDateLabel(draft.socialMarketingReport, subscriptionDates),
          socialPostSnapshots: createSocialPostSnapshot(invoiceProperty, socialMarketingState.posts),
        },
        { authToken },
      )

      if (requestId !== createInvoiceRequestIdRef.current) {
        return
      }

      if (!invoice?.id) {
        throw new Error('The invoice was generated, but the saved invoice record was not returned. Refresh invoices before generating another.')
      }

      setInvoiceState((current) => ({ state: 'ready', invoices: [invoice, ...current.invoices.filter((item) => item.id !== invoice.id)], message: '' }))
      setExpandedInvoiceId(invoice.id)
      setCreateStatus({ state: 'idle', message: `${invoice.invoiceNumber} generated. Ready to generate another invoice.` })
    } catch (error) {
      if (requestId !== createInvoiceRequestIdRef.current) {
        return
      }

      setCreateStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to generate this invoice.' })
    }
  }

  async function handleStatusChange(invoiceId, status) {
    setStatusBusyId(invoiceId)

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to update this invoice.')
      }

      const saved = await updateAdminClientInvoiceStatus(invoiceId, status, { authToken })
      setInvoiceState((current) => ({
        ...current,
        invoices: current.invoices.map((invoice) => invoice.id === saved.id ? saved : invoice),
        message: '',
      }))
    } catch (error) {
      setInvoiceState((current) => ({
        ...current,
        message: error instanceof Error ? error.message : 'Unable to update invoice status.',
      }))
    } finally {
      setStatusBusyId('')
    }
  }

  function handlePrint(invoiceId) {
    setExpandedInvoiceId(invoiceId)
    setPrintInvoiceId(invoiceId)
    document.body.classList.add('admin-invoice-printing')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
  }

  function handleToggleInvoice(invoiceId) {
    setExpandedInvoiceId((current) => (current === invoiceId ? '' : invoiceId))
  }

  async function handleRefreshInvoiceSocialMarketing(invoice) {
    setInvoiceActionState({ invoiceId: invoice.id, action: 'refresh-social', state: 'working', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to refresh social marketing stats.')
      }

      const invoiceProperties = (Array.isArray(invoice.propertySlugs) ? invoice.propertySlugs : [])
        .map((slug) => properties.find((property) => property.slug === slug))
        .filter(Boolean)

      if (invoiceProperties.length === 0) {
        throw new Error('This invoice does not have a matching property to refresh.')
      }

      const results = await Promise.all(
        invoiceProperties.map((property) =>
          findAdminSocialPostsForProperty(property.slug, {
            authToken,
            startDate: invoice.analyticsStartDate,
            endDate: invoice.analyticsEndDate,
          }),
        ),
      )
      const unavailableMessages = results
        .filter((result) => result?.status && result.status !== 'ready')
        .map((result) => result.message)
        .filter(Boolean)

      if (unavailableMessages.length > 0 && results.every((result) => result?.status !== 'ready')) {
        throw new Error(unavailableMessages.join(' '))
      }

      const posts = results.flatMap((result) => (Array.isArray(result?.posts) ? result.posts : []))
      const dateRange = results.find((result) => result?.dateRange)?.dateRange ?? {}
      const dateSource = {
        analyticsStartDate: dateRange.startDate || invoice.analyticsStartDate,
        analyticsEndDate: dateRange.endDate || invoice.analyticsEndDate,
      }
      const socialMarketingReport = createSocialMarketingReportFromSocialPosts(posts, dateSource)
      const socialPostSnapshots = invoiceProperties.flatMap((property, index) =>
        createSocialPostSnapshot(property, Array.isArray(results[index]?.posts) ? results[index].posts : []),
      )
      const { invoice: refreshedInvoice, result } = await refreshAdminClientInvoiceSocialMarketing(
        invoice.id,
        { socialMarketingReport, socialPostSnapshots },
        { authToken },
      )

      if (!refreshedInvoice) {
        throw new Error('Unable to refresh social marketing stats.')
      }

      setInvoiceState((current) => ({
        ...current,
        invoices: current.invoices.map((existing) => existing.id === refreshedInvoice.id ? refreshedInvoice : existing),
        message: '',
      }))
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'refresh-social',
        state: 'success',
        message:
          Number(result?.postCount) > 0
            ? `${result.postCount} social post${result.postCount === 1 ? '' : 's'} loaded.`
            : 'No matching Facebook or Instagram posts found.',
      })
    } catch (error) {
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'refresh-social',
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to refresh social marketing stats.',
      })
    }
  }

  async function handleSavePdf(invoice) {
    setInvoiceActionState({ invoiceId: invoice.id, action: 'save-pdf', state: 'working', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to save this invoice PDF.')
      }

      const result = await downloadAdminClientInvoicePdf(invoice.id, { authToken })
      const filename = result.filename || getInvoicePdfFallbackFilename(invoice)

      downloadBlob(result.blob, filename)
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'save-pdf',
        state: 'success',
        message: `PDF download started: ${filename}`,
      })
    } catch (error) {
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'save-pdf',
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to save this invoice PDF.',
      })
    }
  }

  async function handleEmailPdf(invoice) {
    const recipientEmail = String(client?.email ?? '').trim()

    if (!recipientEmail) {
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'email-pdf',
        state: 'error',
        message: 'Add a client email before emailing this invoice.',
      })
      return
    }

    const shouldSend = window.confirm(`Email ${invoice.invoiceNumber} as a PDF attachment to ${recipientEmail}?`)
    if (!shouldSend) {
      return
    }

    setInvoiceActionState({ invoiceId: invoice.id, action: 'email-pdf', state: 'working', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to email this invoice PDF.')
      }

      const delivery = await emailAdminClientInvoicePdf(invoice.id, { authToken })

      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'email-pdf',
        state: 'success',
        message: `Invoice PDF emailed to ${delivery?.recipientEmail || recipientEmail}.`,
      })
    } catch (error) {
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'email-pdf',
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to email this invoice PDF.',
      })
    }
  }

  async function handleDeleteInvoice(invoice) {
    const shouldDelete = window.confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)

    if (!shouldDelete) {
      return
    }

    setInvoiceActionState({ invoiceId: invoice.id, action: 'delete', state: 'working', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to delete this invoice.')
      }

      await deleteAdminClientInvoice(invoice.id, { authToken })
      setInvoiceState((current) => ({
        ...current,
        invoices: current.invoices.filter((existing) => existing.id !== invoice.id),
      }))
      setExpandedInvoiceId((current) => (current === invoice.id ? '' : current))
      setInvoiceActionState({ invoiceId: '', action: '', state: 'idle', message: '' })
    } catch (error) {
      setInvoiceActionState({
        invoiceId: invoice.id,
        action: 'delete',
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to delete this invoice.',
      })
    }
  }

  if (properties.length === 0) {
    return (
      <section className="admin-client-invoices" aria-label="Invoices">
        <div className="admin-client-section-header"><h4>Invoices</h4></div>
        <p className="admin-empty">Link a property to this client before generating an invoice.</p>
      </section>
    )
  }

  return (
    <section className="admin-client-invoices" aria-label="Invoices">
      <div className="admin-client-section-header">
        <div><span className="eyebrow">Billing</span><h4>Invoice generator</h4></div>
        <span className="admin-chip">{invoiceState.invoices.length} saved</span>
      </div>

      <form className="admin-client-invoice-form" onSubmit={handleCreateInvoice}>
        <div className="admin-client-invoice-fields">
          <label className="admin-field admin-field--full-width">
            <span>Property</span>
            <select required value={draft.propertySlug} onChange={(event) => handlePropertyChange(event.target.value)}>
              {properties.map((property) => <option key={property.slug} value={property.slug}>{property.name || property.slug}</option>)}
            </select>
          </label>
          <div className="admin-client-invoice-derived-summary admin-field--full-width">
            <div>
              <span>Annual service starts</span>
              <strong>{invoiceServiceStartDate ? formatDate(invoiceServiceStartDate) : 'Calculated from subscription start'}</strong>
            </div>
            <div>
              <span>Annual service through</span>
              <strong>{invoiceServiceEndDate ? formatDate(invoiceServiceEndDate) : 'Calculated from subscription start'}</strong>
            </div>
            <div>
              <span>Invoice date</span>
              <input required type="date" value={draft.issueDate} onChange={(event) => handleIssueDateChange(event.target.value)} />
            </div>
          </div>
        </div>

        <div className="admin-client-invoice-line-editor admin-client-invoice-line-editor--annual">
          <div className="admin-client-invoice-line-heading"><span>Property URL</span></div>
          <div className="admin-client-invoice-line">
            <a className="admin-client-invoice-property-url-field" href={getPropertyLineDescription(draftProperty)}>
              {getPropertyLineDescription(draftProperty)}
            </a>
          </div>
          <div className="admin-client-invoice-line-footer">
            <span>One-year listing service</span>
            <strong>Total: {formatCurrency(amountTotal)}</strong>
          </div>
        </div>

        <div className="admin-field admin-field--full-width admin-client-invoice-marketing-editor">
          <div className="admin-client-invoice-marketing-header">
            <span>FB and Instagram marketing</span>
            <button
              className="button-link button-link--ghost admin-action"
              disabled={!datesAreQueryable || socialMarketingState.state === 'loading'}
              type="button"
              onClick={handleLoadSocialMarketingReport}
            >
              {socialMarketingState.state === 'loading' ? 'Loading...' : 'Load stats'}
            </button>
          </div>

          <div className="admin-client-invoice-marketing-fields">
            <label className="admin-field">
              <span>Marketing dates</span>
              <input
                placeholder="Marketing Dates TBD"
                readOnly
                type="text"
                value={syncSocialMarketingReportDateLabel(draft.socialMarketingReport, draft).dateLabel}
              />
            </label>
            <label className="admin-field">
              <span>Views</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.views ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('views', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Viewers</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.viewers ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('viewers', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Clicks</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.clicks ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('clicks', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Likes</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.likes ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('likes', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Comments</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.comments ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('comments', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Shares</span>
              <input
                placeholder="N/A"
                type="text"
                value={draft.socialMarketingReport?.shares ?? 'N/A'}
                onChange={(event) => handleSocialMarketingReportFieldChange('shares', event.target.value)}
              />
            </label>
          </div>

          {socialMarketingState.message ? (
            <p className={`admin-feedback admin-feedback--${socialMarketingState.state === 'error' ? 'error' : 'idle'}`}>
              {socialMarketingState.message}
            </p>
          ) : null}

          {socialMarketingState.posts.length > 0 ? (
            <ul className="admin-client-invoice-social-posts">
              {socialMarketingState.posts.map((post) => (
                <li key={post.externalId}>
                  <a href={post.permalinkUrl || undefined} rel="noreferrer" target="_blank">
                    {formatPostDate(post.createdTime)} {getSocialPlatformLabel(post.platform)} post
                  </a>
                  <span>
                    {formatOptionalNumber(post.views)} views / {formatOptionalNumber(post.viewers)} viewers /{' '}
                    {formatOptionalNumber(post.clicks)} clicks / {formatOptionalNumber(post.likes)} likes /{' '}
                    {formatOptionalNumber(post.comments)} comments
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {!billableServiceStartDate ? (
          <p className="admin-note">
            Set and save the selected property&apos;s subscription or renewal date to calculate the annual invoice and marketing range.
          </p>
        ) : null}

        {createStatus.message ? <p className={`admin-feedback admin-feedback--${createStatus.state === 'success' ? 'idle' : createStatus.state}`}>{createStatus.message}</p> : null}

        <div className="admin-inline-actions admin-client-invoice-submit-row">
          <button
            className="button-link button-link--primary admin-action"
            disabled={createStatus.state === 'saving' || !canGenerateInvoice}
            type="submit"
          >
            {createStatus.state === 'saving' ? 'Generating...' : 'Generate invoice'}
          </button>
        </div>
      </form>

      <div className="admin-client-invoice-history">
        <div className="admin-client-section-header"><h4>Invoice history</h4></div>
        {invoiceState.state === 'loading' ? <p className="admin-empty">Loading invoices...</p> : null}
        {invoiceState.message ? <p className="admin-feedback admin-feedback--error">{invoiceState.message}</p> : null}
        {invoiceState.state === 'ready' && invoiceState.invoices.length === 0 ? <p className="admin-empty">No invoices generated for this client yet.</p> : null}
        {invoiceState.invoices.map((invoice) => (
          <SavedInvoice
            actionState={invoiceActionState}
            client={client}
            expanded={expandedInvoiceId === invoice.id}
            invoice={invoice}
            key={invoice.id}
            logoUrl={logoUrl}
            printTarget={printInvoiceId === invoice.id}
            properties={properties}
            statusBusy={statusBusyId === invoice.id}
            onDeleteInvoice={handleDeleteInvoice}
            onEmailPdf={handleEmailPdf}
            onPrint={handlePrint}
            onRefreshSocialMarketing={handleRefreshInvoiceSocialMarketing}
            onSavePdf={handleSavePdf}
            onStatusChange={handleStatusChange}
            onToggle={handleToggleInvoice}
          />
        ))}
      </div>
    </section>
  )
}
