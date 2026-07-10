import { getAdminIdToken } from './adminAuth'
import { getJson, postJson } from './api'

async function requireAdminAuthToken() {
  const authToken = await getAdminIdToken()

  if (!authToken) {
    throw new Error('Sign in again before managing backups.')
  }

  return authToken
}

export async function fetchAdminBackupStatus() {
  const authToken = await requireAdminAuthToken()
  return getJson('/admin/backups/status', { authToken })
}

export async function startAdminManagedBackup(payload = {}) {
  const authToken = await requireAdminAuthToken()
  return postJson('/admin/backups/export', payload, { authToken })
}

export async function startAdminStagingClone(payload = {}) {
  const authToken = await requireAdminAuthToken()
  return postJson('/admin/backups/clone', payload, { authToken })
}

export async function deployAdminStagingPreview(payload = {}) {
  const authToken = await requireAdminAuthToken()
  return postJson('/admin/backups/staging-preview', payload, { authToken })
}

export async function switchAdminPublicSiteTarget(payload = {}) {
  const authToken = await requireAdminAuthToken()
  return postJson('/admin/backups/cutover', payload, { authToken })
}

export async function fetchAdminBackupOperationsStatus(operationNames = []) {
  const authToken = await requireAdminAuthToken()
  return postJson('/admin/backups/operations/status', { operationNames }, { authToken })
}
