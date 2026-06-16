const nodemailer = require('nodemailer')

let transport = null

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function getEmailConfig() {
  const host = String(process.env.SMTP_HOST ?? '').trim()
  const user = String(process.env.SMTP_USER ?? '').trim()
  const pass = String(process.env.SMTP_PASS ?? '').trim()
  const fromEmail = String(process.env.SMTP_FROM_EMAIL ?? user).trim()
  const fromName = String(process.env.SMTP_FROM_NAME ?? 'St. John House Rentals').trim()
  const portValue = Number.parseInt(String(process.env.SMTP_PORT ?? '').trim(), 10)
  const port = Number.isFinite(portValue) ? portValue : 587
  const secure = normalizeBoolean(process.env.SMTP_SECURE, port === 465)

  return {
    configured: Boolean(host && user && pass && fromEmail),
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
  }
}

function getEmailTransport() {
  const config = getEmailConfig()

  if (!config.configured) {
    return null
  }

  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })
  }

  return {
    config,
    transport,
  }
}

exports.getEmailConfig = getEmailConfig
exports.getEmailTransport = getEmailTransport
