import { deleteJson, getJson, postJson } from './api'

export async function listAdminClients(options = {}) {
  const payload = await getJson('/admin/clients', options)
  return Array.isArray(payload?.clients) ? payload.clients : []
}

export async function getAdminClient(id, options = {}) {
  const payload = await getJson(`/admin/clients/${encodeURIComponent(id)}`, options)
  return payload?.client ?? null
}

export async function saveAdminClient(draft, id, { expectedUpdatedAt, ...options } = {}) {
  const payload = await postJson('/admin/clients', { draft, id: id ?? '', expectedUpdatedAt: expectedUpdatedAt ?? null }, options)
  return payload?.client ?? null
}

export async function archiveAdminClient(id, options = {}) {
  return postJson('/admin/clients/archive', { id }, options)
}

export async function importAdminClientsFromProperties(options = {}) {
  const payload = await postJson('/admin/clients/import-from-properties', {}, options)
  return (
    payload?.import ?? {
      clientsCreated: 0,
      clientsReused: 0,
      propertiesLinked: 0,
      propertiesSkipped: [],
    }
  )
}

export async function getAdminPropertyAnalytics(slug, options = {}) {
  const payload = await getJson(`/admin/analytics/properties/${encodeURIComponent(slug)}`, options)
  return payload?.analytics ?? null
}

export async function listAdminClientPayments(clientId, options = {}) {
  const payload = await getJson(`/admin/clients/${encodeURIComponent(clientId)}/payments`, options)
  return Array.isArray(payload?.payments) ? payload.payments : []
}

export async function recordAdminClientPayment(clientId, draft, options = {}) {
  const payload = await postJson(`/admin/clients/${encodeURIComponent(clientId)}/payments`, draft, options)
  return payload?.payment ?? null
}

export async function deleteAdminClientPayment(id, options = {}) {
  return deleteJson('/admin/clients/payments', { ...options, body: { id } })
}

export async function listAdminClientInvoices(clientId, options = {}) {
  const payload = await getJson(`/admin/clients/${encodeURIComponent(clientId)}/invoices`, options)
  return Array.isArray(payload?.invoices) ? payload.invoices : []
}

export async function createAdminClientInvoice(clientId, draft, options = {}) {
  const payload = await postJson(`/admin/clients/${encodeURIComponent(clientId)}/invoices`, draft, options)
  return payload?.invoice ?? null
}

export async function updateAdminClientInvoiceStatus(invoiceId, status, options = {}) {
  const payload = await postJson(`/admin/clients/invoices/${encodeURIComponent(invoiceId)}/status`, { status }, options)
  return payload?.invoice ?? null
}
