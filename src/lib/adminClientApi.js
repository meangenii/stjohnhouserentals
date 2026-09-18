import { deleteJson, getBlob, getJson, postJson } from './api'

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

export async function getAdminPropertyAnalytics(slug, { startDate, endDate, ...options } = {}) {
  const search = new URLSearchParams()

  if (startDate) {
    search.set('startDate', startDate)
  }

  if (endDate) {
    search.set('endDate', endDate)
  }

  const query = search.size > 0 ? `?${search.toString()}` : ''
  const payload = await getJson(`/admin/analytics/properties/${encodeURIComponent(slug)}${query}`, options)
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

export async function refreshAdminClientInvoiceSocialMarketing(invoiceId, draft, options = {}) {
  const payload = await postJson(`/admin/clients/invoices/${encodeURIComponent(invoiceId)}/social-marketing/refresh`, draft, options)
  return {
    invoice: payload?.invoice ?? null,
    result: payload?.result ?? null,
  }
}

export async function deleteAdminClientInvoice(invoiceId, options = {}) {
  return deleteJson(`/admin/clients/invoices/${encodeURIComponent(invoiceId)}`, options)
}

export async function downloadAdminClientInvoicePdf(invoiceId, options = {}) {
  return getBlob(`/admin/clients/invoices/${encodeURIComponent(invoiceId)}/pdf`, options)
}

export async function emailAdminClientInvoicePdf(invoiceId, options = {}) {
  const payload = await postJson(`/admin/clients/invoices/${encodeURIComponent(invoiceId)}/email`, {}, options)
  return payload?.delivery ?? null
}
