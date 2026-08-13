import { useEffect, useRef, useState } from 'react'
import { getAdminIdToken } from './adminAuth'
import { acquireEditLock, heartbeatEditLock, releaseEditLock, takeOverEditLock } from './editLockRepository'

const HEARTBEAT_INTERVAL_MS = 15000
const LEASE_STORAGE_KEY_PREFIX = 'genericcms:edit-lock-lease:'

const IDLE_STATE = { status: 'idle', lockedByEmail: '', lockedAt: null, leaseId: '', message: '' }

function makeLeaseId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `lease-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getLeaseStorageKey(resourceType, resourceId) {
  return `${LEASE_STORAGE_KEY_PREFIX}${String(resourceType ?? '').trim()}:${String(resourceId ?? '').trim()}`
}

function readStoredLeaseId(resourceType, resourceId) {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.sessionStorage.getItem(getLeaseStorageKey(resourceType, resourceId)) || ''
  } catch {
    return ''
  }
}

function storeLeaseId(resourceType, resourceId, leaseId) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(getLeaseStorageKey(resourceType, resourceId), leaseId)
  } catch {
    // Session storage is an optimization for same-tab remounts; locking still works without it.
  }
}

function lockStateFromError(error) {
  const lock = error?.payload?.lock ?? null
  const message = error instanceof Error ? error.message : 'Unable to secure the edit lock.'
  // The server always omits `lock` from the 409 payload when the caller's own lease is gone
  // (see editLockRepository.js heartbeatLock/assertActiveEditLease), and always includes it
  // when someone else actively holds the lock. That presence/absence is the reliable signal
  // -- matching specific wording in the message is fragile and drifts out of sync with it.
  const expired = error?.status === 409 && !lock

  return {
    status: expired ? 'expired' : error?.status === 409 ? 'locked-by-other' : 'error',
    lockedByEmail: lock?.lockedByEmail || '',
    lockedAt: lock?.lockedAt ?? null,
    leaseId: '',
    message,
  }
}

export function useEditLock({ resourceType, resourceId, enabled = true }) {
  const [state, setState] = useState(IDLE_STATE)
  const [takeoverSeq, setTakeoverSeq] = useState(0)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    if (!enabled || !resourceType || !resourceId) {
      return undefined
    }

    let cancelled = false
    const seq = ++requestSeqRef.current
    let heartbeatTimer = null
    let lastAuthToken = ''
    const leaseId = readStoredLeaseId(resourceType, resourceId) || makeLeaseId()

    storeLeaseId(resourceType, resourceId, leaseId)

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

            let lockError = error

            if (error?.status === 409 && !error?.payload?.lock) {
              try {
                const recoveryToken = await getAdminIdToken()

                if (isStale() || !recoveryToken) {
                  return
                }

                await acquireEditLock(resourceType, resourceId, { authToken: recoveryToken, leaseId })
                lastAuthToken = recoveryToken
                setState({ status: 'editing', lockedByEmail: '', lockedAt: null, leaseId, message: '' })
                return
              } catch (recoveryError) {
                if (isStale()) {
                  return
                }

                lockError = recoveryError
              }
            }

            clearInterval(heartbeatTimer)
            // Ownership can no longer be proven, so content mutation must stop.
            lastAuthToken = ''
            setState(lockStateFromError(lockError))
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
  }, [resourceType, resourceId, enabled, takeoverSeq])

  async function takeOver() {
    if (!enabled || !resourceType || !resourceId || state.status === 'acquiring') {
      return
    }

    const leaseId = readStoredLeaseId(resourceType, resourceId) || makeLeaseId()
    storeLeaseId(resourceType, resourceId, leaseId)
    setState({ status: 'acquiring', lockedByEmail: '', lockedAt: null, leaseId: '', message: 'Taking over editing...' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        setState(IDLE_STATE)
        return
      }

      await takeOverEditLock(resourceType, resourceId, { authToken, leaseId })
      setTakeoverSeq((currentSeq) => currentSeq + 1)
    } catch (error) {
      setState(lockStateFromError(error))
    }
  }

  return {
    status: state.status,
    lockedByEmail: state.lockedByEmail,
    lockedAt: state.lockedAt,
    leaseId: state.leaseId,
    message: state.message,
    takeOver,
    isBlocked: state.status === 'locked-by-other',
    isReady: !enabled || !resourceType || !resourceId || state.status === 'editing',
  }
}
