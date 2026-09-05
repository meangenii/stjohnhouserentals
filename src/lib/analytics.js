const measurementId = String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '').trim()
const enableAnalyticsInDev = String(import.meta.env.VITE_ENABLE_ANALYTICS_IN_DEV ?? '').trim() === 'true'

let gtagConfigured = false

function isLocalHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function shouldTrackAnalytics() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  if (!measurementId) {
    return false
  }

  if (!enableAnalyticsInDev && isLocalHostname(window.location.hostname)) {
    return false
  }

  if (navigator.doNotTrack === '1' || window.doNotTrack === '1') {
    return false
  }

  return typeof window.gtag === 'function'
}

function ensureGtagConfigured() {
  if (gtagConfigured) {
    return
  }

  window.gtag('config', measurementId, { send_page_view: false })
  gtagConfigured = true
}

export function trackPageView({ path, title }) {
  if (!shouldTrackAnalytics()) {
    return
  }

  ensureGtagConfigured()

  window.gtag('event', 'page_view', {
    page_location: window.location.href,
    page_path: path || `${window.location.pathname}${window.location.search}`,
    page_title: title || document.title,
  })
}
