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

async function requestJson(path, { method = 'GET', body, headers, authToken } = {}) {
  const requestHeaders = new Headers(headers ?? {})
  const normalizedMethod = String(method ?? 'GET').trim().toUpperCase() || 'GET'

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: normalizedMethod,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: normalizedMethod === 'GET' ? 'no-store' : undefined,
  })

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

export async function getJson(path, options) {
  return requestJson(path, { ...options, method: 'GET' })
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
