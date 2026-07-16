import { useEffect, useState } from 'react'

function scheduleAdminSessionLoad(callback, { immediate = false } = {}) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  if (immediate || window.location.pathname.startsWith('/admin')) {
    callback()
    return () => {}
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleCallbackId = window.requestIdleCallback(callback, { timeout: 2500 })
    return () => window.cancelIdleCallback(idleCallbackId)
  }

  const timeoutId = window.setTimeout(callback, 1200)
  return () => window.clearTimeout(timeoutId)
}

export function useAdminSession({ immediate = false } = {}) {
  const [sessionState, setSessionState] = useState({ status: 'loading', user: null })

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    const cancelScheduledLoad = scheduleAdminSessionLoad(() => {
      Promise.all([import('./adminAuth'), import('./firebase')])
        .then(([adminAuth, firebase]) => {
          if (cancelled) {
            return
          }

          if (!firebase.isFirebaseConfigured()) {
            setSessionState({ status: 'ready', user: null })
            return
          }

          unsubscribe = adminAuth.observeAdminUser((nextUser) => {
            if (!cancelled) {
              setSessionState({ status: 'ready', user: nextUser })
            }
          })
        })
        .catch(() => {
          if (!cancelled) {
            setSessionState({ status: 'ready', user: null })
          }
        })
    }, { immediate })

    return () => {
      cancelled = true
      cancelScheduledLoad()
      unsubscribe()
    }
  }, [immediate])

  return {
    isAdmin: Boolean(sessionState.user),
    status: sessionState.status,
    user: sessionState.user,
  }
}
