import { getJson } from './api'

export async function fetchPropertyCalendarAvailability(slug) {
  const normalizedSlug = String(slug ?? '').trim()

  if (!normalizedSlug) {
    return { busy: [] }
  }

  const payload = await getJson(`/calendar/availability?slug=${encodeURIComponent(normalizedSlug)}`)

  return {
    busy: Array.isArray(payload?.busy) ? payload.busy : [],
    error: payload?.error ?? '',
  }
}
