const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

export async function getApiHealth() {
  const response = await fetch(`${apiBaseUrl}/health`)

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`)
  }

  return response.json()
}
