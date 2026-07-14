import { useEffect, useRef, useState } from 'react'
import { getAdminIdToken } from './adminAuth'
import { acquireEditLock, heartbeatEditLock, releaseEditLock } from './editLockRepository'

const HEARTBEAT_INTERVAL_MS = 15000

const IDLE_STATE = { status: 'idle', lockedByEmail: '', lockedAt: null }

function lockStateFromError(error) {
  const lock = error?.payload?.lock ?? null

  return {
    status: 'locked-by-other',
    lockedByEmail: lock?.lockedByEmail || '',
    lockedAt: lock?.lockedAt ?? null,
  }
}

export function useEditLock({ resourceType, resourceId, enabled = true }) {
  const [state, setState] = useState(IDLE_STATE)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    if (!enabled || !resourceType || !resourceId) {
      return undefined
    }

    let cancelled = false
    const seq = ++requestSeqRef.current
    let heartbeatTimer = null
    let lastAuthToken = ''

    function isStale() {
      return cancelled || seq !== requestSeqRef.current
    }

    function handleBeforeUnload() {
      if (!lastAuthToken) {
        return
      }

      releaseEditLock(resourceType, resourceId, { authToken: lastAuthToken, keepalive: true }).catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    async function acquire() {
      setState({ status: 'acquiring', lockedByEmail: '', lockedAt: null })

      const authToken = await getAdminIdToken()

      if (isStale()) {
        return
      }

      if (!authToken) {
        setState(IDLE_STATE)
        return
      }

      try {
        await acquireEditLock(resourceType, resourceId, { authToken })

        if (isStale()) {
          releaseEditLock(resourceType, resourceId, { authToken }).catch(() => {})
          return
        }

        // Only remember the token once the lock is actually held, so a failed or
        // stale acquire can never trigger a release of a lock this client doesn't own.
        lastAuthToken = authToken
        setState({ status: 'editing', lockedByEmail: '', lockedAt: null })

        heartbeatTimer = setInterval(async () => {
          try {
            const heartbeatToken = await getAdminIdToken()

            if (isStale() || !heartbeatToken) {
              return
            }

            lastAuthToken = heartbeatToken
            await heartbeatEditLock(resourceType, resourceId, { authToken: heartbeatToken })
          } catch (error) {
            if (isStale()) {
              return
            }

            if (error?.status === 409) {
              clearInterval(heartbeatTimer)
              // Another admin now owns the lock — forget our token so unmount/unload
              // cleanup doesn't release the lock out from under them.
              lastAuthToken = ''
              setState(lockStateFromError(error))
            }
          }
        }, HEARTBEAT_INTERVAL_MS)
      } catch (error) {
        if (!isStale()) {
          setState(lockStateFromError(error))
        }
      }
    }

    acquire()

    return () => {
      cancelled = true
      window.removeEventListener('beforeunload', handleBeforeUnload)

      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
      }

      if (lastAuthToken) {
        releaseEditLock(resourceType, resourceId, { authToken: lastAuthToken, keepalive: false }).catch(() => {})
      }

      setState(IDLE_STATE)
    }
  }, [resourceType, resourceId, enabled])

  return {
    status: state.status,
    lockedByEmail: state.lockedByEmail,
    lockedAt: state.lockedAt,
    isBlocked: state.status === 'locked-by-other',
  }
}
