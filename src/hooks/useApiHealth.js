import { useEffect, useState } from 'react'
import { getApiHealth } from '../lib/api'

export function useApiHealth() {
  const [health, setHealth] = useState({ state: 'loading' })

  useEffect(() => {
    let cancelled = false

    getApiHealth()
      .then((response) => {
        if (!cancelled) {
          setHealth({ state: 'ok', checkedAt: response.checkedAt })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          setHealth({ state: 'offline', message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return health
}
