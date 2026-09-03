import { getJson, postJson } from './api'

const LIKE_CLIENT_TOKEN_STORAGE_KEY = 'sjhr:likeClientToken'

function generateClientToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }

  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export function getLikeClientToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    const existingToken = window.localStorage.getItem(LIKE_CLIENT_TOKEN_STORAGE_KEY)

    if (existingToken) {
      return existingToken
    }

    const nextToken = generateClientToken()
    window.localStorage.setItem(LIKE_CLIENT_TOKEN_STORAGE_KEY, nextToken)
    return nextToken
  } catch {
    return generateClientToken()
  }
}

export async function fetchLikeSummary({ itemType, itemId }) {
  const clientToken = getLikeClientToken()
  const searchParams = new URLSearchParams({ itemType, itemId, clientToken })

  return getJson(`/likes/summary?${searchParams.toString()}`)
}

export async function toggleLike({ itemType, itemId }) {
  const clientToken = getLikeClientToken()

  return postJson('/likes/toggle', { itemType, itemId, clientToken })
}
