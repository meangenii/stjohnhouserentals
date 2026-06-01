const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export function getApiBaseUrl() {
  return apiBaseUrl
}

async function requestJson(path, { method = 'GET', body, headers, authToken } = {}) {
  const requestHeaders = new Headers(headers ?? {})

  if (body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed with status ${response.status}`)
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
