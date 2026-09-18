import { getJson, postJson } from './api'

export async function getAdminSocialConnectionStatus(options = {}) {
  const payload = await getJson('/admin/social/status', options)
  return payload?.status ?? null
}

export async function getAdminPropertySocialSummary(slug, { startDate, endDate, ...options } = {}) {
  const search = new URLSearchParams()

  if (startDate) {
    search.set('startDate', startDate)
  }

  if (endDate) {
    search.set('endDate', endDate)
  }

  const query = search.size > 0 ? `?${search.toString()}` : ''
  const payload = await getJson(`/admin/social/properties/${encodeURIComponent(slug)}/summary${query}`, options)
  return payload?.summary ?? null
}

export async function createAdminSocialPost(draft, options = {}) {
  const payload = await postJson('/admin/social/posts', draft, options)
  return payload?.post ?? null
}

export async function refreshAdminSocialPostMetrics(postId, options = {}) {
  const payload = await postJson(`/admin/social/posts/${encodeURIComponent(postId)}/refresh-metrics`, {}, options)
  return payload?.post ?? null
}

export async function findAdminFacebookPostsForProperty(slug, { startDate, endDate, ...options } = {}) {
  const search = new URLSearchParams()

  if (startDate) {
    search.set('startDate', startDate)
  }

  if (endDate) {
    search.set('endDate', endDate)
  }

  const query = search.size > 0 ? `?${search.toString()}` : ''
  const payload = await getJson(`/admin/social/properties/${encodeURIComponent(slug)}/facebook-posts${query}`, options)
  return payload?.result ?? null
}

export async function findAdminSocialPostsForProperty(slug, { startDate, endDate, ...options } = {}) {
  const search = new URLSearchParams()

  if (startDate) {
    search.set('startDate', startDate)
  }

  if (endDate) {
    search.set('endDate', endDate)
  }

  const query = search.size > 0 ? `?${search.toString()}` : ''
  const payload = await getJson(`/admin/social/properties/${encodeURIComponent(slug)}/posts${query}`, options)
  return payload?.result ?? null
}

export async function lookupAdminFacebookPostByUrl(url, options = {}) {
  const payload = await postJson('/admin/social/facebook-posts/lookup', { url }, options)
  return payload?.post ?? null
}
