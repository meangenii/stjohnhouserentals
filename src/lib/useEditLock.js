import { useEffect, useRef, useState } from 'react'
import { getAdminIdToken } from './adminAuth'
import { acquireEditLock, heartbeatEditLock, releaseEditLock } from './editLockRepository'

const HEARTBEAT_INTERVAL_MS = 15000

const IDLE_STATE = { status: 'idle', lockedByEmail: '', lockedAt: null, leaseId: '', message: '' }

function makeLeaseId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function lockStateFromError(error) {
  const lock = error?.payload?.lock ?? null

  return {
    status: error?.status === 409 ? 'locked-by-other' : 'error',
    lockedByEmail: lock?.lockedByEmail || '',
    lockedAt: lock?.lockedAt ?? null,
    leaseId: '',
    message: error instanceof Error ? error.message : 'Unable to secure the edit lock.',
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
    const leaseId = makeLeaseId()

    function isStale() {
      return cancelled || seq !== requestSeqRef.current
    }

    function handleBeforeUnload() {
      if (!lastAuthToken) {
        return
      }

      releaseEditLock(resourceType, resourceId, { authToken: lastAuthToken, keepalive: true, leaseId }).catch(() => {})
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    async function acquire() {
      setState({ status: 'acquiring', lockedByEmail: '', lockedAt: null, leaseId: '', message: '' })

      const authToken = await getAdminIdToken()

      if (isStale()) {
        return
      }

      if (!authToken) {
        setState(IDLE_STATE)
        return
      }

      try {
        await acquireEditLock(resourceType, resourceId, { authToken, leaseId })

        if (isStale()) {
          releaseEditLock(resourceType, resourceId, { authToken, leaseId }).catch(() => {})
          return
        }

        lastAuthToken = authToken
        setState({ status: 'editing', lockedByEmail: '', lockedAt: null, leaseId, message: '' })

        heartbeatTimer = setInterval(async () => {
          try {
            const heartbeatToken = await getAdminIdToken()

            if (isStale() || !heartbeatToken) {
              return
            }

            lastAuthToken = heartbeatToken
            await heartbeatEditLock(resourceType, resourceId, { authToken: heartbeatToken, leaseId })
          } catch (error) {
            if (isStale()) {
              return
            }

            clearInterval(heartbeatTimer)
            // Ownership can no longer be proven, so content mutation must stop.
            lastAuthToken = ''
            setState(lockStateFromError(error))
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
        releaseEditLock(resourceType, resourceId, { authToken: lastAuthToken, keepalive: false, leaseId }).catch(() => {})
      }

      setState(IDLE_STATE)
    }
  }, [resourceType, resourceId, enabled])

  return {
    status: state.status,
    lockedByEmail: state.lockedByEmail,
    lockedAt: state.lockedAt,
    leaseId: state.leaseId,
    message: state.message,
    isBlocked: state.status === 'locked-by-other',
    isReady: !enabled || state.status === 'editing',
  }
}
