import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

const authEmulatorHost = String(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '').trim()

let authInstance = null
let authEmulatorConnected = false

export function getAdminAuth() {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp())

    if (authEmulatorHost && !authEmulatorConnected) {
      connectAuthEmulator(authInstance, `http://${authEmulatorHost}`, { disableWarnings: true })
      authEmulatorConnected = true
    }
  }

  return authInstance
}

export function observeAdminUser(callback) {
  const auth = getAdminAuth()

  if (!auth) {
    callback(null)
    return () => {}
  }

  return onAuthStateChanged(auth, callback)
}

export async function signInAdmin(email, password) {
  const auth = getAdminAuth()

  if (!auth) {
    throw new Error('Firebase is not configured for admin sign-in.')
  }

  try {
    await setPersistence(auth, browserLocalPersistence)
    return await signInWithEmailAndPassword(auth, email, password)
  } catch (error) {
    if (error?.code === 'auth/configuration-not-found') {
      throw new Error('Firebase Authentication is not enabled for this project. Enable Email/Password sign-in first.', {
        cause: error,
      })
    }

    if (error?.code === 'auth/operation-not-allowed') {
      throw new Error('Firebase Authentication exists, but Email/Password sign-in is disabled for this project.', {
        cause: error,
      })
    }

    throw error
  }
}

export async function signOutAdmin() {
  const auth = getAdminAuth()

  if (!auth) {
    return
  }

  await signOut(auth)
}

export async function getAdminIdToken(forceRefresh = false) {
  const auth = getAdminAuth()
  const user = auth?.currentUser

  if (!user) {
    return ''
  }

  return user.getIdToken(forceRefresh)
}
