const { HttpError, getDb, getServerTimestamp, isFirestoreUnavailableError } = require('./firebaseAdmin')
const { getEmailConfig, getEmailTransport } = require('./emailTransport')
const { getSiteShellContent } = require('./siteContentRepository')

const ADVERTISE_INQUIRY_COLLECTION = 'advertiseInquiries'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeTimestampValue(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? '' : date.toISOString()
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString()
  }

  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString()
  }

  return ''
}

function normalizeAdvertiseInquiryRecord(id, record = {}) {
  return {
    id: String(id ?? '').trim(),
    type: String(record.type ?? 'advertise').trim(),
    status: String(record.status ?? '').trim(),
    firstName: String(record.firstName ?? '').trim(),
    lastName: String(record.lastName ?? '').trim(),
    email: String(record.email ?? '').trim().toLowerCase(),
    subject: String(record.subject ?? '').trim(),
    message: String(record.message ?? '').trim(),
    spam: record.spam === true,
    createdAt: normalizeTimestampValue(record.createdAt),
    updatedAt: normalizeTimestampValue(record.updatedAt),
    delivery: {
      mode: String(record.delivery?.mode ?? '').trim(),
      status: String(record.delivery?.status ?? '').trim(),
      recipientEmail: String(record.delivery?.recipientEmail ?? '').trim().toLowerCase(),
      message: String(record.delivery?.message ?? '').trim(),
    },
    metadata: {
      host: String(record.metadata?.host ?? '').trim(),
      origin: String(record.metadata?.origin ?? '').trim(),
      referer: String(record.metadata?.referer ?? '').trim(),
      ip: String(record.metadata?.ip ?? '').trim(),
      userAgent: String(record.metadata?.userAgent ?? '').trim(),
    },
  }
}

function normalizeField(value, { label, maxLength, required = true } = {}) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')

  if (required && !normalized) {
    throw new HttpError(400, `${label} is required.`)
  }

  if (normalized.length > maxLength) {
    throw new HttpError(400, `${label} must be ${maxLength} characters or fewer.`)
  }

  return normalized
}

function normalizeMessage(value) {
  const normalized = String(value ?? '').trim().replace(/\r\n/g, '\n')

  if (!normalized) {
    throw new HttpError(400, 'Message is required.')
  }

  if (normalized.length > 4000) {
    throw new HttpError(400, 'Message must be 4000 characters or fewer.')
  }

  return normalized
}

function normalizeAdvertiseInquiry(payload) {
  const firstName = normalizeField(payload?.firstName, { label: 'First name', maxLength: 80 })
  const lastName = normalizeField(payload?.lastName, { label: 'Last name', maxLength: 80 })
  const email = normalizeField(payload?.email, { label: 'Email', maxLength: 160 }).toLowerCase()
  const subject = normalizeField(payload?.subject, { label: 'Subject', maxLength: 160, required: false })
  const message = normalizeMessage(payload?.message)
  const website = normalizeField(payload?.website, { label: 'Website', maxLength: 255, required: false })

  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.')
  }

  return {
    firstName,
    lastName,
    email,
    subject: subject || `Advertising inquiry from ${firstName} ${lastName}`,
    message,
    website,
  }
}

function getClientMetadata(request) {
  return {
    host: String(request.headers.host ?? '').trim(),
    origin: String(request.headers.origin ?? '').trim(),
    referer: String(request.headers.referer ?? '').trim(),
    ip: String(request.ip ?? '').trim(),
    userAgent: String(request.headers['user-agent'] ?? '').trim(),
  }
}

async function getInquiryRecipientEmail() {
  try {
    const siteShell = await getSiteShellContent()
    const primaryEmail = String(siteShell?.contact?.primaryEmail ?? '').trim().toLowerCase()

    if (primaryEmail) {
      return primaryEmail
    }
  } catch {
    // Fall back to an explicit backup recipient when site content is unavailable.
  }

  return String(process.env.ADVERTISE_INQUIRY_TO_EMAIL ?? '').trim().toLowerCase()
}

function buildEmailBody(inquiry, metadata) {
  return [
    'New advertising inquiry',
    '',
    `First name: ${inquiry.firstName}`,
    `Last name: ${inquiry.lastName}`,
    `Email: ${inquiry.email}`,
    `Subject: ${inquiry.subject}`,
    '',
    'Message:',
    inquiry.message,
    '',
    'Request metadata:',
    `Host: ${metadata.host || 'unknown'}`,
    `Origin: ${metadata.origin || 'unknown'}`,
    `Referer: ${metadata.referer || 'unknown'}`,
    `IP: ${metadata.ip || 'unknown'}`,
    `User agent: ${metadata.userAgent || 'unknown'}`,
  ].join('\n')
}

async function sendAdvertiseInquiryEmail({ inquiry, metadata, recipientEmail }) {
  const emailSetup = getEmailTransport()

  if (!emailSetup) {
    return {
      delivered: false,
      status: 'not-configured',
      message: 'SMTP email delivery is not configured.',
    }
  }

  if (!recipientEmail) {
    return {
      delivered: false,
      status: 'missing-recipient',
      message: 'No advertise inquiry recipient email is configured.',
    }
  }

  await emailSetup.transport.sendMail({
    from: `"${emailSetup.config.fromName}" <${emailSetup.config.fromEmail}>`,
    to: recipientEmail,
    replyTo: inquiry.email,
    subject: inquiry.subject,
    text: buildEmailBody(inquiry, metadata),
  })

  return {
    delivered: true,
    status: 'sent',
    message: 'Inquiry email sent.',
  }
}

async function saveAdvertiseInquiry(payload, request) {
  const inquiry = normalizeAdvertiseInquiry(payload)
  const metadata = getClientMetadata(request)

  if (inquiry.website) {
    return {
      accepted: true,
      delivery: 'skipped',
      spam: true,
    }
  }

  try {
    const inquiryRef = getDb().collection(ADVERTISE_INQUIRY_COLLECTION).doc()
    const recipientEmail = await getInquiryRecipientEmail()
    const emailConfig = getEmailConfig()

    await inquiryRef.set({
      type: 'advertise',
      status: 'received',
      ...inquiry,
      metadata,
      delivery: {
        mode: emailConfig.configured ? 'smtp' : 'none',
        status: emailConfig.configured ? 'pending' : 'not-configured',
        recipientEmail: recipientEmail || null,
      },
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    })

    let delivery

    try {
      delivery = await sendAdvertiseInquiryEmail({
        inquiry,
        metadata,
        recipientEmail,
      })
    } catch (error) {
      delivery = {
        delivered: false,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Email delivery failed.',
      }
    }

    await inquiryRef.update({
      status: delivery.delivered ? 'emailed' : 'received',
      delivery: {
        mode: emailConfig.configured ? 'smtp' : 'none',
        status: delivery.status,
        recipientEmail: recipientEmail || null,
        message: delivery.message,
      },
      updatedAt: getServerTimestamp(),
    })

    return {
      accepted: true,
      delivery: delivery.delivered ? 'emailed' : 'stored',
      id: inquiryRef.id,
      message: delivery.message,
      spam: false,
    }
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The inquiry service is temporarily unavailable. Please email us directly.')
    }

    throw error
  }
}

async function listAdvertiseInquiries({ limit = 200 } = {}) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 200, 500))

  try {
    const snapshot = await getDb()
      .collection(ADVERTISE_INQUIRY_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(normalizedLimit)
      .get()

    return snapshot.docs.map((document) => normalizeAdvertiseInquiryRecord(document.id, document.data()))
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      throw new HttpError(503, 'The inquiry service is temporarily unavailable.')
    }

    throw error
  }
}

exports.listAdvertiseInquiries = listAdvertiseInquiries
exports.saveAdvertiseInquiry = saveAdvertiseInquiry
