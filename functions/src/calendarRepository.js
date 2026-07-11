const dns = require('node:dns/promises')
const { HttpError } = require('./firebaseAdmin')

const FETCH_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const SUCCESS_CACHE_TTL_MS = 15 * 60 * 1000
const ERROR_CACHE_TTL_MS = 5 * 60 * 1000

const availabilityCache = new Map()

function isPrivateOrReservedIpv4(address) {
  const parts = address.split('.').map(Number)

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true
  }

  const [a, b] = parts

  return a === 0 || a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

function isPrivateOrReservedIpv6(address) {
  const normalized = address.toLowerCase()

  if (normalized === '::1' || normalized === '::') {
    return true
  }

  if (normalized.startsWith('::ffff:') && normalized.includes('.')) {
    return isPrivateOrReservedIpv4(normalized.slice(normalized.lastIndexOf(':') + 1))
  }

  return normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')
}

function isPrivateOrReservedIp(address, family) {
  return family === 6 ? isPrivateOrReservedIpv6(address) : isPrivateOrReservedIpv4(address)
}

async function assertSafeIcsUrl(rawUrl) {
  let parsed

  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new HttpError(400, 'Invalid calendar URL.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'Calendar URL must use http or https.')
  }

  let addresses

  try {
    addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true })
  } catch {
    throw new HttpError(502, 'Unable to resolve the calendar URL host.')
  }

  if (addresses.length === 0 || addresses.some((address) => isPrivateOrReservedIp(address.address, address.family))) {
    throw new HttpError(400, 'Calendar URL resolves to a disallowed address.')
  }

  return parsed
}

async function readLimitedText(response, maxBytes) {
  const reader = typeof response.body?.getReader === 'function' ? response.body.getReader() : null

  if (!reader) {
    const text = await response.text()

    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new HttpError(502, 'Calendar feed is too large.')
    }

    return text
  }

  const decoder = new TextDecoder()
  const chunks = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    received += value.byteLength

    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new HttpError(502, 'Calendar feed is too large.')
    }

    chunks.push(decoder.decode(value, { stream: true }))
  }

  chunks.push(decoder.decode())

  return chunks.join('')
}

async function fetchIcsText(initialUrl) {
  let currentUrl = initialUrl

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    await assertSafeIcsUrl(currentUrl)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response

    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { Accept: 'text/calendar, text/plain, */*' },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')

      if (!location) {
        throw new HttpError(502, 'Calendar URL redirected without a location.')
      }

      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    if (!response.ok) {
      throw new HttpError(502, `Calendar URL responded with status ${response.status}.`)
    }

    return readLimitedText(response, MAX_RESPONSE_BYTES)
  }

  throw new HttpError(502, 'Calendar URL redirected too many times.')
}

function unfoldIcsLines(icsText) {
  const rawLines = String(icsText ?? '').replace(/\r\n/g, '\n').split('\n')
  const lines = []

  rawLines.forEach((line) => {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  })

  return lines
}

function addDaysToIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function parseIcsDateValue(value) {
  const trimmed = String(value ?? '').trim()
  const dateMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$/)

  if (!dateMatch) {
    return null
  }

  const [, year, month, day] = dateMatch

  return `${year}-${month}-${day}`
}

function parseIcsBusyRanges(icsText) {
  const lines = unfoldIcsLines(icsText)
  const ranges = []
  let current = null

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (trimmed === 'BEGIN:VEVENT') {
      current = { start: null, end: null, status: '' }
      return
    }

    if (trimmed === 'END:VEVENT') {
      if (current?.start) {
        const end = current.end && current.end > current.start ? current.end : addDaysToIsoDate(current.start, 1)

        if (current.status !== 'CANCELLED') {
          ranges.push({ start: current.start, end })
        }
      }

      current = null
      return
    }

    if (!current) {
      return
    }

    const separatorIndex = trimmed.indexOf(':')

    if (separatorIndex === -1) {
      return
    }

    const rawKey = trimmed.slice(0, separatorIndex)
    const rawValue = trimmed.slice(separatorIndex + 1)
    const [name] = rawKey.split(';')

    if (name === 'DTSTART') {
      current.start = parseIcsDateValue(rawValue)
    } else if (name === 'DTEND') {
      current.end = parseIcsDateValue(rawValue)
    } else if (name === 'STATUS') {
      current.status = rawValue.trim().toUpperCase()
    }
  })

  return ranges.sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0))
}

function getCachedAvailability(url) {
  const cached = availabilityCache.get(url)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  return null
}

function setCachedAvailability(url, result, ttlMs) {
  availabilityCache.set(url, { result, expiresAt: Date.now() + ttlMs })
}

async function getIcsAvailability(propertyRecord) {
  const url = String(propertyRecord?.calendarUrl ?? '').trim()

  if (!url) {
    return { busy: [] }
  }

  const cached = getCachedAvailability(url)

  if (cached) {
    return cached
  }

  try {
    const icsText = await fetchIcsText(url)
    const result = { busy: parseIcsBusyRanges(icsText) }
    setCachedAvailability(url, result, SUCCESS_CACHE_TTL_MS)
    return result
  } catch (error) {
    const result = { busy: [], error: error instanceof Error ? error.message : 'Unable to load calendar availability.' }
    setCachedAvailability(url, result, ERROR_CACHE_TTL_MS)
    return result
  }
}

module.exports = {
  getIcsAvailability,
  parseIcsBusyRanges,
}
