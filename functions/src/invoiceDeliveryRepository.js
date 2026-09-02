const sharp = require('sharp')
const { getClient } = require('./clientRepository')
const { getEmailTransport } = require('./emailTransport')
const { HttpError } = require('./firebaseAdmin')
const { getInvoice } = require('./invoiceRepository')
const {
  createInvoicePdfBuffer,
  formatInvoiceCurrency,
  formatInvoiceDate,
  getInvoicePdfFilename,
} = require('./invoicePdf')
const { getAdminPropertyBySlug } = require('./propertyRepository')
const { getSiteShellContent } = require('./siteContentRepository')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function getInvoiceDocumentContext(invoiceId) {
  const invoice = await getInvoice(invoiceId)
  const client = await getClient(invoice.clientId)
  const properties = await Promise.all(invoice.propertySlugs.map((slug) => getAdminPropertyBySlug(slug)))

  return {
    invoice,
    client,
    properties: properties.filter(Boolean),
  }
}

// PDFKit only embeds PNG/JPEG, but the site logo can be uploaded in any format (e.g. AVIF),
// so this normalizes it to PNG. Any failure here just omits the logo rather than failing the invoice.
async function getInvoiceLogoImage() {
  try {
    const siteShell = await getSiteShellContent()
    const logoUrl = String(siteShell?.header?.logo?.url ?? '').trim()

    if (!logoUrl) {
      return null
    }

    const response = await fetch(logoUrl)

    if (!response.ok) {
      return null
    }

    const sourceBuffer = Buffer.from(await response.arrayBuffer())
    return await sharp(sourceBuffer).png().toBuffer()
  } catch {
    return null
  }
}

async function createInvoicePdfDownload(invoiceId) {
  const context = await getInvoiceDocumentContext(invoiceId)
  const logoImage = await getInvoiceLogoImage()
  const buffer = await createInvoicePdfBuffer({ ...context, logoImage })

  return {
    ...context,
    buffer,
    contentType: 'application/pdf',
    filename: getInvoicePdfFilename(context.invoice),
  }
}

function buildInvoiceEmailText({ invoice, client, properties }) {
  const propertyNames = properties.map((property) => property.name || property.slug).filter(Boolean)
  const recipientName = client.contactName || client.businessName || 'there'

  return [
    `Hello ${recipientName},`,
    '',
    `Attached is invoice ${invoice.invoiceNumber} from St. John House Rentals.`,
    propertyNames.length ? `Property: ${propertyNames.join(', ')}` : '',
    `Invoice date: ${formatInvoiceDate(invoice.issueDate)}`,
    invoice.dueDate ? `Due date: ${formatInvoiceDate(invoice.dueDate)}` : '',
    `Amount due: ${formatInvoiceCurrency(invoice.amountTotal)}`,
    '',
    'Please make checks payable to Jean Vance.',
    '',
    'Thank you,',
    'St. John House Rentals',
  ].filter(Boolean).join('\n')
}

async function emailInvoicePdf(invoiceId) {
  const emailSetup = getEmailTransport()

  if (!emailSetup) {
    throw new HttpError(503, 'SMTP email delivery is not configured.')
  }

  const download = await createInvoicePdfDownload(invoiceId)
  const recipientEmail = String(download.client.email ?? '').trim().toLowerCase()

  if (!recipientEmail || !EMAIL_PATTERN.test(recipientEmail)) {
    throw new HttpError(400, 'This client does not have a valid email address.')
  }

  try {
    await emailSetup.transport.sendMail({
      from: `"${emailSetup.config.fromName}" <${emailSetup.config.fromEmail}>`,
      to: recipientEmail,
      subject: `Invoice ${download.invoice.invoiceNumber} from St. John House Rentals`,
      text: buildInvoiceEmailText(download),
      attachments: [
        {
          filename: download.filename,
          content: download.buffer,
          contentType: download.contentType,
        },
      ],
    })
  } catch (error) {
    throw new HttpError(
      502,
      `Invoice email could not be sent: ${error instanceof Error ? error.message : 'Email delivery failed.'}`,
    )
  }

  return {
    delivered: true,
    recipientEmail,
    filename: download.filename,
    invoice: download.invoice,
  }
}

exports.createInvoicePdfDownload = createInvoicePdfDownload
exports.emailInvoicePdf = emailInvoicePdf
