import { useEffect, useState } from 'react'

function scheduleAdminSessionLoad(callback) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  if (window.location.pathname.startsWith('/admin')) {
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

export function useAdminSession() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe = () => {}

    const cancelScheduledLoad = scheduleAdminSessionLoad(() => {
      Promise.all([import('./adminAuth'), import('./firebase')])
        .then(([adminAuth, firebase]) => {
          if (cancelled || !firebase.isFirebaseConfigured()) {
            return
          }

          unsubscribe = adminAuth.observeAdminUser((nextUser) => {
            if (!cancelled) {
              setUser(nextUser)
            }
          })
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      cancelScheduledLoad()
      unsubscribe()
    }
  }, [])

  return {
    isAdmin: Boolean(user),
    user,
  }
}
