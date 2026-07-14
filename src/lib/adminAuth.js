import {
  GoogleAuthProvider,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { getFirebaseApp, isFirebaseConfigured } from './firebase'

const authEmulatorHost = String(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '').trim()

const adminAllowedEmails = String(import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

let authInstance = null
let authEmulatorConnected = false

export function isAdminEmail(email) {
  if (!adminAllowedEmails.length) {
    return false
  }

  return adminAllowedEmails.includes(String(email ?? '').toLowerCase())
}

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

export async function signInAdminWithGoogle() {
  const auth = getAdminAuth()

  if (!auth) {
    throw new Error('Firebase is not configured.')
  }

  await setPersistence(auth, browserLocalPersistence)
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)

  if (!isAdminEmail(result.user.email)) {
    await signOut(auth)
    throw new Error(`${result.user.email} is not authorized to access this admin area.`)
  }

  return result
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
