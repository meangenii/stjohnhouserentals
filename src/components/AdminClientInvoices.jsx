import { useEffect, useMemo, useState } from 'react'
import { getAdminIdToken } from '../lib/adminAuth'
import {
  createAdminClientInvoice,
  deleteAdminClientInvoice,
  downloadAdminClientInvoicePdf,
  emailAdminClientInvoicePdf,
  getAdminPropertyAnalytics,
  listAdminClientInvoices,
  updateAdminClientInvoiceStatus,
} from '../lib/adminClientApi'
import { useSiteShellContent } from '../lib/useSiteContent'
import siteLogoFallback from '../content/site_logo.png'

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'void']
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const SITE_ORIGIN = 'https://www.stjohnhouserentals.com'
const COMPANY_NAME = 'St. John House Rentals'
const DBA_NAME = 'DBA St John Links'
const PAYEE_NAME = 'Jean Vance'
const COMPANY_ADDRESS_LINES = ['9901 Emmaus', 'St. John, VI 00830-9587']
const COMPANY_EMAIL = 'stjohnlinks@gmail.com'
const SOCIAL_STAT_LABELS = {
  views: 'Views',
  viewers: 'Viewers',
  clicks: 'Clicks',
  impressions: 'Impressions',
  reach: 'Reach',
  engagements: 'Engagements',
}
const DEFAULT_ANNUAL_INVOICE_AMOUNT = '300'
const ANNUAL_INVOICE_MONTH_COUNT = 12
const INVOICE_DUE_DAY_COUNT = 30

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

function getDerivedInvoiceDates(property) {
  const subscriptionStartDate = normalizeDateOnly(property?.subscriptionStartAt)
  const today = getLocalDateOnly()
  const issueDate = subscriptionStartDate || today

  return {
    issueDate,
    dueDate: addDays(issueDate, INVOICE_DUE_DAY_COUNT),
    analyticsStartDate: subscriptionStartDate,
    analyticsEndDate: getAnnualServiceEndDate(subscriptionStartDate),
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

function formatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number) : '0'
}

function formatPercent(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '0%'
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`
}

function readAmount(value) {
  const amount = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(readAmount(value))
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
  const startDate = normalizeDateOnly(invoice?.analyticsStartDate)
    || normalizeDateOnly(property?.subscriptionStartAt)
    || normalizeDateOnly(invoice?.issueDate)
  const endDate = normalizeDateOnly(invoice?.analyticsEndDate) || getAnnualServiceEndDate(startDate)
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

function getSnapshotForProperty(snapshots, property, propertySlug) {
  return snapshots.find((snapshot) => snapshot.propertySlug === property?.slug)
    || snapshots.find((snapshot) => snapshot.propertySlug === propertySlug)
    || snapshots[0]
    || null
}

function getAnalyticsRangeLabel(invoice, snapshot) {
  const startDate = normalizeDateOnly(snapshot?.dateRange?.startDate) || normalizeDateOnly(invoice.analyticsStartDate)
  const endDate = normalizeDateOnly(snapshot?.dateRange?.endDate) || normalizeDateOnly(invoice.analyticsEndDate)

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  }

  return 'TBD'
}

function getAnalyticsMetricLabel(snapshot, metricName) {
  if (snapshot?.status !== 'ready') {
    return 'N/A'
  }

  return formatNumber(snapshot?.metrics?.[metricName])
}

function readSocialMetric(value) {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return null
  }

  const cleanedValue = rawValue.replace(/,/g, '').replace(/[^0-9.-]/g, '')
  if (!/[0-9]/.test(cleanedValue)) {
    return null
  }

  const metric = Number(cleanedValue)
  return Number.isFinite(metric) ? metric : null
}

function getSocialStatsRangeLabel(stats) {
  const startDate = normalizeDateOnly(stats?.startDate || stats?.dateRange?.startDate)
  const endDate = normalizeDateOnly(stats?.endDate || stats?.dateRange?.endDate)

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`
  }

  return String(stats?.rangeLabel || stats?.range || '').trim()
}

function normalizeSocialStatEntry(stats) {
  if (!stats || typeof stats !== 'object') {
    return null
  }

  const metricSource = stats.metrics && typeof stats.metrics === 'object' ? stats.metrics : stats
  const metrics = Object.entries(SOCIAL_STAT_LABELS)
    .map(([key, label]) => {
      const value = readSocialMetric(metricSource[key])
      return value === null ? null : { key, label, value }
    })
    .filter(Boolean)

  if (!metrics.length) {
    return null
  }

  return {
    label: String(stats.label || stats.platform || 'Social media marketing').trim(),
    rangeLabel: getSocialStatsRangeLabel(stats),
    metrics,
  }
}

function getInvoiceSocialStats(invoice, snapshot) {
  const sources = [
    ...(Array.isArray(invoice?.socialStats) ? invoice.socialStats : invoice?.socialStats ? [invoice.socialStats] : []),
    ...(Array.isArray(snapshot?.socialStats) ? snapshot.socialStats : snapshot?.socialStats ? [snapshot.socialStats] : []),
    ...(Array.isArray(invoice?.marketingStats)
      ? invoice.marketingStats
      : invoice?.marketingStats
        ? [invoice.marketingStats]
        : []),
    ...(Array.isArray(snapshot?.marketingStats)
      ? snapshot.marketingStats
      : snapshot?.marketingStats
        ? [snapshot.marketingStats]
        : []),
  ]

  return sources.map(normalizeSocialStatEntry).filter(Boolean)
}

function getServiceDescriptionLabel(description) {
  const normalized = String(description ?? '').trim().replace(/[\u2013\u2014]/g, '-')

  if (!normalized || /property listing/i.test(normalized) || /^https?:\/\//i.test(normalized) || normalized.startsWith('/')) {
    return 'Website listing services for'
  }

  return normalized
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
    notes: '',
  }
}

function AnalyticsMetrics({ report }) {
  const metrics = report?.metrics ?? {}

  return (
    <div className="admin-client-invoice-metrics">
      <span><strong>{formatNumber(metrics.views)}</strong> views</span>
      <span><strong>{formatNumber(metrics.activeUsers)}</strong> unique visitors</span>
      <span><strong>{formatNumber(metrics.sessions)}</strong> sessions</span>
      <span><strong>{formatPercent(metrics.engagementRate)}</strong> engagement</span>
      <span><strong>{formatDuration(metrics.averageSessionDuration)}</strong> avg. session</span>
    </div>
  )
}

function InvoiceAnalyticsReport({ invoice, snapshot }) {
  const rangeLabel = getAnalyticsRangeLabel(invoice, snapshot)

  return (
    <section className="admin-client-invoice-ga-report" aria-label="Google Analytics report">
      <div className="admin-client-invoice-ga-header">
        <strong>Google Analytics</strong>
        <span>{rangeLabel}</span>
      </div>
      {snapshot?.status === 'ready' ? (
        <dl className="admin-client-invoice-ga-metrics">
          <div>
            <dt>Views</dt>
            <dd>{getAnalyticsMetricLabel(snapshot, 'views')}</dd>
          </div>
          <div>
            <dt>Unique visitors</dt>
            <dd>{getAnalyticsMetricLabel(snapshot, 'activeUsers')}</dd>
          </div>
          <div>
            <dt>Sessions</dt>
            <dd>{getAnalyticsMetricLabel(snapshot, 'sessions')}</dd>
          </div>
          <div>
            <dt>Engagement</dt>
            <dd>{formatPercent(snapshot.metrics?.engagementRate)}</dd>
          </div>
          <div>
            <dt>Avg. session</dt>
            <dd>{formatDuration(snapshot.metrics?.averageSessionDuration)}</dd>
          </div>
        </dl>
      ) : (
        <p className="admin-client-invoice-muted">
          {snapshot?.message || 'Google Analytics was unavailable when this invoice was generated.'}
        </p>
      )}
    </section>
  )
}

function InvoiceSocialStats({ stats }) {
  if (!stats?.length) {
    return null
  }

  return (
    <section className="admin-client-invoice-social-report" aria-label="Social marketing statistics">
      {stats.map((entry, index) => (
        <div className="admin-client-invoice-social-group" key={`${entry.label}-${entry.rangeLabel}-${index}`}>
          <div className="admin-client-invoice-social-header">
            <strong>{entry.label}</strong>
            {entry.rangeLabel ? <span>{entry.rangeLabel}</span> : null}
          </div>
          <dl className="admin-client-invoice-social-metrics">
            {entry.metrics.map((metric) => (
              <div key={metric.key}>
                <dt>{metric.label}</dt>
                <dd>{formatNumber(metric.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  )
}

function SavedInvoice({
  actionState,
  client,
  invoice,
  logoUrl,
  properties,
  printTarget,
  statusBusy,
  onDeleteInvoice,
  onEmailPdf,
  onPrint,
  onSavePdf,
  onStatusChange,
}) {
  const propertyNames = invoice.propertySlugs.map((slug) => properties.find((property) => property.slug === slug)?.name || slug)
  const snapshots = Array.isArray(invoice.analyticsSnapshots) ? invoice.analyticsSnapshots : []
  const primaryPropertySlug = invoice.propertySlugs[0] ?? ''
  const primaryProperty = properties.find((property) => property.slug === primaryPropertySlug) ?? null
  const servicePeriod = getServicePeriod(invoice, primaryProperty)
  const clientLines = getClientInvoiceLines(client)
  const clientEmail = String(client?.email ?? '').trim()
  const invoiceAction = actionState?.invoiceId === invoice.id ? actionState : null
  const isPdfBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'save-pdf'
  const isEmailBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'email-pdf'
  const isDeleteBusy = invoiceAction?.state === 'working' && invoiceAction.action === 'delete'
  const isActionBusy = isPdfBusy || isEmailBusy || isDeleteBusy

  return (
    <article className={`admin-client-saved-invoice ${printTarget ? 'admin-client-invoice-print-target' : ''}`.trim()}>
      <div className="admin-client-saved-invoice-toolbar admin-client-invoice-no-print">
        <strong>{invoice.invoiceNumber}</strong>
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
            disabled={isActionBusy}
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

      <div className="admin-client-invoice-document">
        <header className="admin-client-invoice-document-header">
          <h4>Invoice - {invoice.invoiceNumber}.</h4>
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
              const rowSnapshot = getSnapshotForProperty(snapshots, rowProperty, rowPropertySlug)
              const propertyName = rowSnapshot?.propertyName || rowProperty?.name || propertyNames[index] || propertyNames[0] || rowPropertySlug
              const propertyUrl = getPropertyUrl(rowProperty, rowPropertySlug)
              const showPropertyDetails = index === 0 && propertyName
              const socialStats = getInvoiceSocialStats(invoice, rowSnapshot)

              return (
                <tr key={`${item.description}-${index}`}>
                  <td className="admin-client-invoice-service-period">{index === 0 ? servicePeriod : ''}</td>
                  <td className="admin-client-invoice-service-description">
                    <p>{getServiceDescriptionLabel(item.description)}</p>
                    {showPropertyDetails ? (
                      <>
                        <strong>{propertyName}</strong>
                        <a href={propertyUrl}>{propertyUrl}</a>
                        <InvoiceAnalyticsReport invoice={invoice} snapshot={rowSnapshot} />
                        <InvoiceSocialStats stats={socialStats} />
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
    </article>
  )
}

export function AdminClientInvoices({ authUser, client, properties, selectedPropertySlug }) {
  const siteShell = useSiteShellContent()
  const logoUrl = String(siteShell?.header?.logo?.url ?? '').trim() || siteLogoFallback
  const selectedProperty = properties.find((property) => property.slug === selectedPropertySlug) ?? properties[0] ?? null
  const [draft, setDraft] = useState(() => createInvoiceDraft(selectedProperty))
  const [analyticsState, setAnalyticsState] = useState({ state: 'idle', report: null, message: '' })
  const [invoiceState, setInvoiceState] = useState({ state: 'idle', invoices: [], message: '' })
  const [createStatus, setCreateStatus] = useState({ state: 'idle', message: '' })
  const [statusBusyId, setStatusBusyId] = useState('')
  const [invoiceActionState, setInvoiceActionState] = useState({ invoiceId: '', action: '', state: 'idle', message: '' })
  const [printInvoiceId, setPrintInvoiceId] = useState('')
  const propertyKey = properties.map((property) => property.slug).join('|')
  const draftProperty = properties.find((property) => property.slug === draft.propertySlug) ?? null
  const subscriptionStartDate = normalizeDateOnly(draftProperty?.subscriptionStartAt)
  const annualServiceEndDate = getAnnualServiceEndDate(subscriptionStartDate)
  const amountTotal = useMemo(() => draft.lineItems.reduce((sum, item) => sum + readAmount(item.amount), 0), [draft.lineItems])
  const datesAreQueryable =
    DATE_ONLY_PATTERN.test(draft.analyticsStartDate) &&
    DATE_ONLY_PATTERN.test(draft.analyticsEndDate) &&
    draft.analyticsStartDate <= draft.analyticsEndDate
  const canGenerateInvoice = Boolean(draft.propertySlug && subscriptionStartDate && datesAreQueryable)

  useEffect(() => {
    setDraft(createInvoiceDraft(selectedProperty))
    setCreateStatus({ state: 'idle', message: '' })
  }, [
    propertyKey,
    selectedProperty?.listingFeeAmount,
    selectedProperty?.path,
    selectedProperty?.slug,
    selectedProperty?.subscriptionStartAt,
    selectedProperty,
    selectedPropertySlug,
  ])

  useEffect(() => {
    if (!authUser?.uid || !client?.id) {
      setInvoiceState({ state: 'idle', invoices: [], message: '' })
      return undefined
    }

    let cancelled = false

    async function loadInvoices() {
      setInvoiceState({ state: 'loading', invoices: [], message: '' })

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
    if (!authUser?.uid || !draft.propertySlug || !datesAreQueryable) {
      setAnalyticsState({ state: 'idle', report: null, message: '' })
      return undefined
    }

    let cancelled = false

    async function loadAnalyticsPreview() {
      setAnalyticsState({ state: 'loading', report: null, message: '' })

      try {
        const authToken = await getAdminIdToken()

        if (!authToken) {
          throw new Error('Sign in to preview invoice analytics.')
        }

        const report = await getAdminPropertyAnalytics(draft.propertySlug, {
          authToken,
          startDate: draft.analyticsStartDate,
          endDate: draft.analyticsEndDate,
        })

        if (!cancelled) {
          setAnalyticsState({ state: 'ready', report, message: '' })
        }
      } catch (error) {
        if (!cancelled) {
          setAnalyticsState({
            state: 'error',
            report: null,
            message: error instanceof Error ? error.message : 'Unable to load invoice analytics.',
          })
        }
      }
    }

    loadAnalyticsPreview()
    return () => { cancelled = true }
  }, [authUser?.uid, datesAreQueryable, draft.analyticsEndDate, draft.analyticsStartDate, draft.propertySlug])

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

  function setDraftField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setCreateStatus({ state: 'idle', message: '' })
  }

  function handlePropertyChange(slug) {
    const property = properties.find((candidate) => candidate.slug === slug)
    const derivedDates = getDerivedInvoiceDates(property)

    setDraft((current) => ({
      ...current,
      propertySlug: slug,
      ...derivedDates,
      lineItems: [{ description: getPropertyLineDescription(property), amount: getAnnualInvoiceAmount(property) }],
    }))
    setCreateStatus({ state: 'idle', message: '' })
  }

  async function handleCreateInvoice(event) {
    event.preventDefault()

    const invoiceProperty = properties.find((property) => property.slug === draft.propertySlug) ?? draftProperty
    const derivedDates = getDerivedInvoiceDates(invoiceProperty)
    const lineItem = {
      description: getPropertyLineDescription(invoiceProperty),
      amount: getAnnualInvoiceAmount(invoiceProperty),
    }

    if (!normalizeDateOnly(invoiceProperty?.subscriptionStartAt)) {
      setCreateStatus({
        state: 'error',
        message: 'Set and save this property\'s subscription start date before generating the annual invoice.',
      })
      return
    }

    if (analyticsState.report?.status !== 'ready') {
      const proceed = window.confirm('Google Analytics is not currently available for this property and period. Save the invoice with the availability message instead?')
      if (!proceed) {
        return
      }
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
          issueDate: derivedDates.issueDate,
          dueDate: derivedDates.dueDate,
          analyticsStartDate: derivedDates.analyticsStartDate,
          analyticsEndDate: derivedDates.analyticsEndDate,
          lineItems: [lineItem],
          notes: draft.notes,
        },
        { authToken },
      )

      setInvoiceState((current) => ({ state: 'ready', invoices: [invoice, ...current.invoices.filter((item) => item.id !== invoice.id)], message: '' }))
      setCreateStatus({ state: 'success', message: `${invoice.invoiceNumber} generated with a server-verified analytics snapshot.` })
    } catch (error) {
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
    setPrintInvoiceId(invoiceId)
    document.body.classList.add('admin-invoice-printing')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
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

  const analyticsMessage = analyticsState.message || analyticsState.report?.message || ''

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
              <span>Subscription start</span>
              <strong>{subscriptionStartDate ? formatDate(subscriptionStartDate) : 'Set on property, then save'}</strong>
            </div>
            <div>
              <span>Annual service through</span>
              <strong>{annualServiceEndDate ? formatDate(annualServiceEndDate) : 'Calculated from subscription start'}</strong>
            </div>
            <div>
              <span>Invoice date</span>
              <strong>{formatDate(draft.issueDate)}</strong>
            </div>
            <div>
              <span>Due date</span>
              <strong>{formatDate(draft.dueDate)}</strong>
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

        <label className="admin-field"><span>Notes</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraftField('notes', event.target.value)} /></label>

        {!subscriptionStartDate ? (
          <p className="admin-note">
            Set and save the selected property&apos;s subscription start date to calculate the annual invoice and analytics range.
          </p>
        ) : null}

        <div className="admin-client-invoice-analytics-preview" aria-live="polite">
          <div className="admin-client-invoice-report-heading">
            <div><span className="eyebrow">Analytics preview</span><strong>{draftProperty?.name || draft.propertySlug}</strong></div>
            <span>
              {datesAreQueryable
                ? `${formatDate(draft.analyticsStartDate)} - ${formatDate(draft.analyticsEndDate)}`
                : 'Set subscription start'}
            </span>
          </div>
          {analyticsState.state === 'loading' ? <p>Loading Google Analytics...</p> : null}
          {analyticsState.state === 'ready' && analyticsState.report?.status === 'ready' ? <AnalyticsMetrics report={analyticsState.report} /> : null}
          {analyticsMessage && analyticsState.state !== 'loading' ? <p>{analyticsMessage}</p> : null}
        </div>

        {createStatus.message ? <p className={`admin-feedback admin-feedback--${createStatus.state === 'success' ? 'idle' : createStatus.state}`}>{createStatus.message}</p> : null}

        <div className="admin-inline-actions admin-client-invoice-submit-row">
          <button
            className="button-link button-link--primary admin-action"
            disabled={createStatus.state === 'saving' || analyticsState.state === 'loading' || !canGenerateInvoice}
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
            invoice={invoice}
            key={invoice.id}
            logoUrl={logoUrl}
            printTarget={printInvoiceId === invoice.id}
            properties={properties}
            statusBusy={statusBusyId === invoice.id}
            onDeleteInvoice={handleDeleteInvoice}
            onEmailPdf={handleEmailPdf}
            onPrint={handlePrint}
            onSavePdf={handleSavePdf}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </section>
  )
}
