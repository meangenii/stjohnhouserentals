import { getFirebaseApp } from './firebase'

const measurementId = String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '').trim()
const enableAnalyticsInDev = String(import.meta.env.VITE_ENABLE_ANALYTICS_IN_DEV ?? '').trim() === 'true'

let analyticsPromise = null

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

  return true
}

async function getBrowserAnalytics() {
  if (!shouldTrackAnalytics()) {
    return null
  }

  if (!analyticsPromise) {
    analyticsPromise = import('firebase/analytics')
      .then(async ({ getAnalytics, isSupported, logEvent }) => {
        const app = getFirebaseApp()

        if (!app || !(await isSupported())) {
          return null
        }

        return {
          analytics: getAnalytics(app),
          logEvent,
        }
      })
      .catch(() => null)
  }

  return analyticsPromise
}

export function trackPageView({ path, title }) {
  if (!shouldTrackAnalytics()) {
    return
  }

  getBrowserAnalytics().then((state) => {
    if (!state) {
      return
    }

    state.logEvent(state.analytics, 'page_view', {
      page_location: window.location.href,
      page_path: path || `${window.location.pathname}${window.location.search}`,
      page_title: title || document.title,
    })
  })
}
