const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export function getApiBaseUrl() {
  return apiBaseUrl
}

async function readResponsePayload(response) {
  const bodyText = await response.text().catch(() => '')

  if (!bodyText) {
    return null
  }

  try {
    return JSON.parse(bodyText)
  } catch {
    return {
      message: bodyText.trim(),
    }
  }
}

function shouldBypassBrowserCache(path, { authToken } = {}) {
  if (authToken) {
    return true
  }

  const pathname = String(path ?? '').split(/[?#]/, 1)[0] || '/'
  const mutablePublicPaths = new Set([
    '/site-config',
    '/properties',
    '/properties/catalog',
    '/properties/summary',
    '/properties/summaries',
    '/charters',
  ])

  return (
    pathname === '/health' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/content/') ||
    pathname.startsWith('/properties/') ||
    pathname.startsWith('/charters/') ||
    pathname.startsWith('/calendar/') ||
    mutablePublicPaths.has(pathname)
  )
}

async function requestJson(path, { method = 'GET', body, headers, authToken, keepalive } = {}) {
  const requestHeaders = new Headers(headers ?? {})
  const normalizedMethod = String(method ?? 'GET').trim().toUpperCase() || 'GET'
  const requestInit = {
    method: normalizedMethod,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...(keepalive ? { keepalive: true } : {}),
  }

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }

  if (normalizedMethod === 'GET' && shouldBypassBrowserCache(path, { authToken })) {
    requestInit.cache = 'no-store'
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit)

  const payload = response.status === 204 ? null : await readResponsePayload(response)

  if (!response.ok) {
    const fallbackMessage =
      response.status === 413 ? 'The selected upload is too large for this uploader.' : `Request failed with status ${response.status}`
    const error = new Error(payload?.message || fallbackMessage)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

function getFilenameFromContentDisposition(contentDisposition) {
  const header = String(contentDisposition ?? '')
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header)

  if (utf8Match) {
    return decodeURIComponent(utf8Match[1])
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(header)
  if (quotedMatch) {
    return quotedMatch[1]
  }

  const plainMatch = /filename=([^;]+)/i.exec(header)
  return plainMatch ? plainMatch[1].trim() : ''
}

async function requestBlob(path, { method = 'GET', headers, authToken } = {}) {
  const requestHeaders = new Headers(headers ?? {})
  const normalizedMethod = String(method ?? 'GET').trim().toUpperCase() || 'GET'
  const requestInit = {
    method: normalizedMethod,
    headers: requestHeaders,
  }

  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }

  if (normalizedMethod === 'GET' && shouldBypassBrowserCache(path, { authToken })) {
    requestInit.cache = 'no-store'
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit)

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    const fallbackMessage = `Request failed with status ${response.status}`
    const error = new Error(payload?.message || fallbackMessage)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return {
    blob: await response.blob(),
    filename: getFilenameFromContentDisposition(response.headers.get('Content-Disposition')),
  }
}

export async function getJson(path, options) {
  return requestJson(path, { ...options, method: 'GET' })
}

export async function getBlob(path, options) {
  return requestBlob(path, { ...options, method: 'GET' })
}

export async function postJson(path, body, options) {
  return requestJson(path, { ...options, method: 'POST', body })
}

export async function deleteJson(path, options) {
  return requestJson(path, { ...options, method: 'DELETE' })
}

export async function getApiHealth() {
  return getJson('/health')
}
