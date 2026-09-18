const PDFDocument = require('pdfkit')
const {
  siteOrigin: SITE_ORIGIN,
  companyName: COMPANY_NAME,
  dbaName: DBA_NAME,
  payeeName: PAYEE_NAME,
  companyAddressLines: COMPANY_ADDRESS_LINES,
  companyEmail: COMPANY_EMAIL,
} = require('../shared/invoiceBranding.json')

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ANNUAL_INVOICE_MONTH_COUNT = 12
const INVOICE_PARTY_ROW_MIN_HEIGHT = 66
const INVOICE_TABLE_TOP_GAP = 16

function normalizeDateOnly(dateOnly) {
  const normalized = String(dateOnly ?? '').trim().slice(0, 10)
  return DATE_ONLY_PATTERN.test(normalized) ? normalized : ''
}

function addDays(dateOnly, dayCount) {
  const source = DATE_ONLY_PATTERN.test(String(dateOnly ?? '')) ? `${dateOnly}T12:00:00` : new Date()
  const date = source instanceof Date ? source : new Date(source)
  date.setDate(date.getDate() + dayCount)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function addMonths(dateOnly, monthCount) {
  if (!DATE_ONLY_PATTERN.test(String(dateOnly ?? ''))) {
    return ''
  }

  const date = new Date(`${dateOnly}T12:00:00`)
  date.setMonth(date.getMonth() + monthCount)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function getAnnualServiceEndDate(startDate) {
  return startDate ? addDays(addMonths(startDate, ANNUAL_INVOICE_MONTH_COUNT), -1) : ''
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

function formatOptionalPercent(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(number * 100)}%` : 'N/A'
}

function readMetricNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function hasMeaningfulWebsiteStats(analyticsSnapshot, engagementSnapshot) {
  const metrics = analyticsSnapshot?.status === 'ready' ? analyticsSnapshot?.metrics ?? {} : {}
  const counts = engagementSnapshot?.counts ?? {}

  return [
    metrics.views,
    metrics.activeUsers,
    metrics.sessions,
    metrics.engagementRate,
    engagementSnapshot?.totalEvents,
    counts.siteLikes,
    counts.facebookShareClicks,
  ].some((value) => readMetricNumber(value) > 0)
}

function formatInvoiceCurrency(value) {
  const amount = readAmount(value)

  if (Number.isInteger(amount)) {
    return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`
  }

  return formatCurrency(amount)
}

function getInvoicePdfFilename(invoice) {
  const invoiceNumber = String(invoice?.invoiceNumber || invoice?.id || 'invoice').trim()
  const safeName = invoiceNumber.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'invoice'
  return `${safeName}.pdf`
}

function getClientName(client) {
  return client?.businessName || client?.contactName || client?.email || 'Client'
}

function getClientInvoiceLines(client) {
  const businessName = String(client?.businessName ?? '').trim()
  const contactName = String(client?.contactName ?? '').trim()
  const phone = String(client?.phone ?? '').trim()
  const address = String(client?.address ?? '').trim()
  const email = String(client?.email ?? '').trim()

  return Array.from(new Set([businessName, contactName, phone, address, email].filter(Boolean)))
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

function getInvoiceSnapshotForProperty(snapshots, propertySlug) {
  const normalizedSlug = String(propertySlug ?? '').trim()
  const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : []
  const exactSnapshot = normalizedSnapshots.find((snapshot) => String(snapshot?.propertySlug ?? '').trim() === normalizedSlug)

  if (exactSnapshot) {
    return exactSnapshot
  }

  return normalizedSnapshots.length === 1 ? normalizedSnapshots[0] : null
}

function writeText(doc, text, x, y, options = {}) {
  const {
    width,
    font = 'Helvetica',
    size = 9,
    color = '#000000',
    lineGap = 1,
    align = 'left',
  } = options

  doc.font(font).fontSize(size).fillColor(color).text(String(text ?? ''), x, y, { width, lineGap, align })
  return doc.y
}

function getServiceDescriptionLabel(description) {
  const normalized = String(description ?? '').trim().replace(/[\u2013\u2014]/g, '-')

  if (!normalized || /property listing/i.test(normalized) || /^https?:\/\//i.test(normalized) || normalized.startsWith('/')) {
    return 'Website listing services for'
  }

  return normalized
}

function renderCellText(doc, text, x, y, width, options = {}) {
  return writeText(doc, text, x, y, { width, size: 9, ...options }) + 4
}

function drawRowBorders(doc, columns, y, height) {
  columns.forEach((column) => {
    doc.rect(column.x, y, column.width, height).stroke('#222222')
  })
}

function getInvoiceTableStartY(partyY, clientY, invoiceDateY) {
  return Math.max(
    partyY + INVOICE_PARTY_ROW_MIN_HEIGHT,
    clientY + INVOICE_TABLE_TOP_GAP,
    invoiceDateY + INVOICE_TABLE_TOP_GAP,
  )
}

function renderSocialMarketingReport(doc, report, x, y, width) {
  if (!report) {
    return y
  }

  let nextY = writeText(doc, 'FB and Instagram marketing.', x, y, { width, font: 'Helvetica-Bold', size: 9.5 }) + 2
  nextY = writeText(doc, `Statistics "${report.dateLabel || 'Marketing Dates TBD'}":`, x, nextY, { width, size: 9 }) + 2
  nextY = writeText(doc, `Views: ${report.views || 'N/A'} Viewers: ${report.viewers || 'N/A'}`, x, nextY, { width, size: 9 }) + 2
  nextY = writeText(doc, `Clicks: ${report.clicks || 'N/A'}`, x, nextY, { width, size: 9 }) + 4
  nextY = writeText(doc, `Likes: ${report.likes || 'N/A'} Comments: ${report.comments || 'N/A'} Shares: ${report.shares || 'N/A'}`, x, nextY, { width, size: 9 }) + 4

  return nextY
}

function renderWebsiteStatsReport(doc, analyticsSnapshot, engagementSnapshot, x, y, width) {
  if (!hasMeaningfulWebsiteStats(analyticsSnapshot, engagementSnapshot)) {
    return y
  }

  const metrics = analyticsSnapshot?.metrics ?? {}
  const counts = engagementSnapshot?.counts ?? {}
  const hasAnalytics = analyticsSnapshot?.status === 'ready'
  let nextY = writeText(doc, 'Website listing statistics.', x, y, { width, font: 'Helvetica-Bold', size: 9.5 }) + 2

  nextY = writeText(
    doc,
    `Views: ${hasAnalytics ? formatOptionalNumber(metrics.views) : 'N/A'} Visitors: ${hasAnalytics ? formatOptionalNumber(metrics.activeUsers) : 'N/A'} Sessions: ${hasAnalytics ? formatOptionalNumber(metrics.sessions) : 'N/A'}`,
    x,
    nextY,
    { width, size: 9 },
  ) + 2
  nextY = writeText(doc, `Engagement rate: ${hasAnalytics ? formatOptionalPercent(metrics.engagementRate) : 'N/A'}`, x, nextY, { width, size: 9 }) + 2

  if (engagementSnapshot) {
    nextY = writeText(
      doc,
      `On-site activity: ${formatOptionalNumber(engagementSnapshot.totalEvents)} total / ${formatOptionalNumber(counts.siteLikes)} likes / ${formatOptionalNumber(counts.facebookShareClicks)} Facebook shares`,
      x,
      nextY,
      { width, size: 9 },
    ) + 4
  }

  return nextY
}

function renderInvoiceTable(doc, { invoice, properties }) {
  const socialMarketingReport = invoice.socialMarketingReport ?? null
  const propertyNames = invoice.propertySlugs.map((slug) => properties.find((property) => property?.slug === slug)?.name || slug)
  const primaryPropertySlug = invoice.propertySlugs[0] ?? ''
  const primaryProperty = properties.find((property) => property?.slug === primaryPropertySlug) ?? null
  const servicePeriod = getServicePeriod(invoice, primaryProperty)
  const tableX = doc.page.margins.left
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const columns = [
    { key: 'service', label: 'Date of Service', x: tableX, width: tableWidth * 0.12 },
    { key: 'description', label: 'Service Description', x: tableX + tableWidth * 0.12, width: tableWidth * 0.56 },
    { key: 'amount', label: 'Amount', x: tableX + tableWidth * 0.68, width: tableWidth * 0.16 },
    { key: 'due', label: 'Amount Due', x: tableX + tableWidth * 0.84, width: tableWidth * 0.16 },
  ]
  const headerY = doc.y
  const headerHeight = 24

  columns.forEach((column) => {
    doc.rect(column.x, headerY, column.width, headerHeight).stroke('#222222')
    writeText(doc, column.label, column.x + 5, headerY + 7, { width: column.width - 10, size: 8.5 })
  })

  let rowY = headerY + headerHeight

  invoice.lineItems.forEach((item, index) => {
    const rowPropertySlug = invoice.propertySlugs[index] ?? primaryPropertySlug
    const rowProperty = properties.find((property) => property?.slug === rowPropertySlug) ?? primaryProperty
    const propertyName = rowProperty?.name || propertyNames[index] || propertyNames[0] || rowPropertySlug
    const propertyUrl = getPropertyUrl(rowProperty, rowPropertySlug)
    const analyticsSnapshot = getInvoiceSnapshotForProperty(invoice.analyticsSnapshots, rowPropertySlug)
    const engagementSnapshot = getInvoiceSnapshotForProperty(invoice.engagementSnapshots, rowPropertySlug)
    const showPropertyDetails = Boolean(propertyName)
    const descriptionColumn = columns[1]
    const descX = descriptionColumn.x + 7
    const descWidth = descriptionColumn.width - 14
    let descY = rowY + 9

    if (rowY > doc.page.height - doc.page.margins.bottom - 220) {
      doc.addPage()
      rowY = doc.page.margins.top
      descY = rowY + 9
    }

    const serviceY = renderCellText(doc, index === 0 ? servicePeriod : '', columns[0].x + 5, rowY + 9, columns[0].width - 10)
    descY = renderCellText(doc, getServiceDescriptionLabel(item.description), descX, descY, descWidth)

    if (showPropertyDetails) {
      descY += 22
      descY = renderCellText(doc, propertyName, descX, descY, descWidth, { font: 'Helvetica-Bold' })
      descY = renderCellText(doc, propertyUrl, descX, descY, descWidth, { color: '#0000ee' })
      descY = renderWebsiteStatsReport(doc, analyticsSnapshot, engagementSnapshot, descX, descY + 12, descWidth)
      descY = renderSocialMarketingReport(doc, socialMarketingReport, descX, descY + 12, descWidth)
    }

    const amountY = renderCellText(doc, formatInvoiceCurrency(item.amount), columns[3].x + 5, rowY + 9, columns[3].width - 10)
    const rowHeight = Math.max(210, descY - rowY + 10, serviceY - rowY + 10, amountY - rowY + 10)

    drawRowBorders(doc, columns, rowY, rowHeight)
    rowY += rowHeight
  })

  const totalHeight = 27
  doc.rect(columns[2].x, rowY, columns[2].width, totalHeight).stroke('#222222')
  doc.rect(columns[3].x, rowY, columns[3].width, totalHeight).stroke('#222222')
  writeText(doc, 'Total Due:', columns[2].x + 5, rowY + 8, { width: columns[2].width - 10, size: 9 })
  writeText(doc, formatInvoiceCurrency(invoice.amountTotal), columns[3].x + 5, rowY + 8, { width: columns[3].width - 10, size: 9 })

  doc.y = rowY + totalHeight + 28
}

function renderInvoiceHeader(doc, invoice, client, logoImage) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const top = doc.page.margins.top
  const brandWidth = 130
  const brandX = right - brandWidth
  let brandTextY = top + 20

  if (logoImage) {
    const logoWidth = 90
    const logoHeight = 55
    doc.image(logoImage, brandX + (brandWidth - logoWidth) / 2, top, { fit: [logoWidth, logoHeight], align: 'center', valign: 'top' })
    brandTextY = top + logoHeight + 6
  }

  writeText(doc, COMPANY_NAME.replace(' House ', ' House\n'), brandX, brandTextY, {
    width: brandWidth,
    font: 'Times-Italic',
    size: 15,
    align: 'center',
  })

  const partyY = top + 142
  const clientLines = getClientInvoiceLines(client)

  writeText(doc, 'Client:', left, partyY, { width: 200, size: 10 })
  let clientY = partyY + 15
  ;(clientLines.length > 0 ? clientLines : [getClientName(client)]).forEach((line) => {
    clientY = writeText(doc, line, left, clientY, { width: 270, size: 10 }) + 2
  })

  writeText(doc, 'Invoice Date:', right - 160, partyY, { width: 160, size: 10 })
  const invoiceDateY = writeText(doc, formatInvoiceDate(invoice.issueDate), right - 160, partyY + 15, { width: 160, size: 10 })

  doc.y = getInvoiceTableStartY(partyY, clientY, invoiceDateY)
}

function renderPaymentCopy(doc) {
  const left = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

  if (doc.y > doc.page.height - doc.page.margins.bottom - 140) {
    doc.addPage()
  }

  writeText(
    doc,
    `Please contact me with any listing changes, seasonal including rates and dates. Payment is due upon receipt. Please make checks payable to ${PAYEE_NAME}. Payments can be sent to:`,
    left,
    doc.y,
    { width, size: 9 },
  )

  let addressY = doc.y + 10
  ;[PAYEE_NAME, ...COMPANY_ADDRESS_LINES].forEach((line) => {
    addressY = writeText(doc, line, left, addressY, { width, size: 9 }) + 2
  })

  doc.y = addressY + 12
}

function renderFooter(doc) {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const bottomY = doc.page.height - doc.page.margins.bottom - 42

  writeText(doc, DBA_NAME, left, bottomY, { width: 180, font: 'Helvetica-Bold', size: 9 })
  writeText(doc, SITE_ORIGIN.replace(/^https?:\/\//, ''), left, bottomY + 13, { width: 180, size: 9, color: '#0000ee' })

  let addressY = bottomY
  ;[...COMPANY_ADDRESS_LINES, COMPANY_EMAIL].forEach((line) => {
    addressY = writeText(doc, line, right - 210, addressY, { width: 210, size: 8, align: 'right' }) + 2
  })
}

function createInvoicePdfBuffer({ invoice, client, properties = [], logoImage = null }) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'LETTER',
      margins: { top: 54, right: 54, bottom: 44, left: 54 },
      info: {
        Title: `Invoice ${invoice?.invoiceNumber || ''}`.trim(),
        Author: COMPANY_NAME,
        Subject: `Invoice for ${getClientName(client)}`,
      },
    })
    const chunks = []

    document.on('data', (chunk) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)

    renderInvoiceHeader(document, invoice, client, logoImage)
    renderInvoiceTable(document, { invoice, client, properties })

    if (invoice.notes) {
      writeText(document, invoice.notes, document.page.margins.left, document.y, {
        width: document.page.width - document.page.margins.left - document.page.margins.right,
        size: 9,
      })
      document.y += 20
    }

    renderPaymentCopy(document)
    renderFooter(document)
    document.end()
  })
}

exports.createInvoicePdfBuffer = createInvoicePdfBuffer
exports.formatInvoiceCurrency = formatInvoiceCurrency
exports.formatInvoiceDate = formatInvoiceDate
exports.getInvoicePdfFilename = getInvoicePdfFilename
exports._test = {
  getInvoiceSnapshotForProperty,
  getInvoiceTableStartY,
  getServicePeriod,
  hasMeaningfulWebsiteStats,
}
