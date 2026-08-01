const dns = require('node:dns/promises')
const http = require('node:http')
const https = require('node:https')
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
  const decoder = new TextDecoder()
  const chunks = []
  let received = 0

  for await (const chunk of response) {
    received += chunk.length

    if (received > maxBytes) {
      response.destroy()
      throw new HttpError(502, 'Calendar feed is too large.')
    }

    chunks.push(decoder.decode(chunk, { stream: true }))
  }

  chunks.push(decoder.decode())

  return chunks.join('')
}

// Pins the DNS resolution used to open the actual connection to the same
// lookup that enforces the private/reserved-address block, so a DNS-rebinding
// host can't pass the safety check with one address and connect with another.
function createPinnedLookup() {
  return function pinnedLookup(hostname, options, callback) {
    dns
      .lookup(hostname, { all: true, verbatim: true })
      .then((addresses) => {
        if (addresses.length === 0 || addresses.some((address) => isPrivateOrReservedIp(address.address, address.family))) {
          callback(new Error('Calendar URL resolves to a disallowed address.'))
          return
        }

        if (options && options.all) {
          callback(null, addresses)
        } else {
          callback(null, addresses[0].address, addresses[0].family)
        }
      })
      .catch((error) => callback(error))
  }
}

function requestOnce(url, signal) {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(
      url,
      {
        method: 'GET',
        signal,
        lookup: createPinnedLookup(),
        headers: { Accept: 'text/calendar, text/plain, */*' },
      },
      (response) => resolve(response),
    )

    request.on('error', reject)
    request.end()
  })
}

async function fetchIcsText(initialUrl) {
  let currentUrl = initialUrl

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const parsedUrl = await assertSafeIcsUrl(currentUrl)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response

    try {
      response = await requestOnce(parsedUrl, controller.signal)
    } finally {
      clearTimeout(timeout)
    }

    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location
      response.resume()

      if (!location) {
        throw new HttpError(502, 'Calendar URL redirected without a location.')
      }

      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.resume()
      throw new HttpError(502, `Calendar URL responded with status ${response.statusCode}.`)
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

function extractOwnerRezWidget(html) {
  const widgetTagMatch = String(html ?? '').match(/<div[^>]*\bclass="[^"]*\bownerrez-widget\b[^"]*"[^>]*>/i)

  if (!widgetTagMatch) {
    return null
  }

  const tag = widgetTagMatch[0]
  const propertyId = tag.match(/data-propertyid="([^"]+)"/i)?.[1]
  const widgetId = tag.match(/data-widgetid="([^"]+)"/i)?.[1]

  if (!propertyId || !widgetId) {
    return null
  }

  return { propertyId, widgetId }
}

// OwnerRez's widget iframe renders its own multi-month calendar client-side,
// but the underlying booking data is embedded server-side as a JS string
// literal (`var bookingData = JSON.parse("...")`). Reading that directly lets
// availability from an OwnerRez listing feed the site's own month-by-month
// calendar instead of hosting OwnerRez's iframe (which has no month view and
// depends on a cross-origin resize handshake to size itself correctly).
function extractOwnerRezBookingData(html) {
  const match = String(html ?? '').match(/var\s+bookingData\s*=\s*JSON\.parse\((".*?")\)\s*;/)

  if (!match) {
    return null
  }

  let bookings

  try {
    const jsonText = JSON.parse(match[1])
    bookings = JSON.parse(jsonText)
  } catch {
    return null
  }

  if (!Array.isArray(bookings)) {
    return null
  }

  return bookings
    .filter((booking) => typeof booking?.Arrival === 'string' && typeof booking?.Departure === 'string')
    .map((booking) => ({ start: booking.Arrival, end: booking.Departure }))
    .sort((left, right) => (left.start < right.start ? -1 : left.start > right.start ? 1 : 0))
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

async function getCalendarAvailability(propertyRecord) {
  const url = String(propertyRecord?.calendarUrl ?? '').trim()

  if (!url) {
    return { type: 'none', busy: [] }
  }

  const cached = getCachedAvailability(url)

  if (cached) {
    return cached
  }

  try {
    const feedText = await fetchIcsText(url)

    if (/BEGIN:VCALENDAR/i.test(feedText)) {
      const result = { type: 'ics', busy: parseIcsBusyRanges(feedText) }
      setCachedAvailability(url, result, SUCCESS_CACHE_TTL_MS)
      return result
    }

    const ownerRezWidget = extractOwnerRezWidget(feedText)

    if (ownerRezWidget) {
      const widgetUrl = `https://app.ownerrez.com/widgets/${encodeURIComponent(ownerRezWidget.widgetId)}?propertyKey=${encodeURIComponent(ownerRezWidget.propertyId)}`
      const widgetHtml = await fetchIcsText(widgetUrl)
      const busy = extractOwnerRezBookingData(widgetHtml)

      if (busy) {
        const result = { type: 'ics', busy }
        setCachedAvailability(url, result, SUCCESS_CACHE_TTL_MS)
        return result
      }

      const result = { type: 'ics', busy: [], error: 'Unable to read OwnerRez booking data.' }
      setCachedAvailability(url, result, ERROR_CACHE_TTL_MS)
      return result
    }

    const result = { type: 'ics', busy: [], error: 'Calendar URL did not return a recognized calendar feed.' }
    setCachedAvailability(url, result, ERROR_CACHE_TTL_MS)
    return result
  } catch (error) {
    const result = { type: 'ics', busy: [], error: error instanceof Error ? error.message : 'Unable to load calendar availability.' }
    setCachedAvailability(url, result, ERROR_CACHE_TTL_MS)
    return result
  }
}

module.exports = {
  getCalendarAvailability,
  parseIcsBusyRanges,
}
