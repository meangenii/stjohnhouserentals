import { getJson, postJson } from './api'

function buildLockQuery(params) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export async function getEditLockStatus(resourceType, resourceId, options = {}) {
  const query = buildLockQuery({ resourceType, resourceId })
  return getJson(`/admin/edit-locks${query}`, options)
}

export async function listEditLockStatuses(resourceType, options = {}) {
  const query = buildLockQuery({ resourceType })
  const payload = await getJson(`/admin/edit-locks/list${query}`, options)
  return Array.isArray(payload?.locks) ? payload.locks : []
}

export async function acquireEditLock(resourceType, resourceId, options = {}) {
  return postJson('/admin/edit-locks/acquire', { leaseId: options.leaseId, resourceType, resourceId }, options)
}

export async function heartbeatEditLock(resourceType, resourceId, options = {}) {
  return postJson('/admin/edit-locks/heartbeat', { leaseId: options.leaseId, resourceType, resourceId }, options)
}

export async function releaseEditLock(resourceType, resourceId, options = {}) {
  return postJson('/admin/edit-locks/release', { leaseId: options.leaseId, resourceType, resourceId }, options)
}
