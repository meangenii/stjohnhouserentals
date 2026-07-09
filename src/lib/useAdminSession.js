import { useEffect, useState } from 'react'
import { observeAdminUser } from './adminAuth'
import { isFirebaseConfigured } from './firebase'

export function useAdminSession() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      return undefined
    }

    return observeAdminUser(setUser)
  }, [])

  return {
    isAdmin: Boolean(user),
    user,
  }
}
