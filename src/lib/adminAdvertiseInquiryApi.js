import { getJson } from './api'

export async function listAdminAdvertiseInquiries(options = {}) {
  const payload = await getJson('/admin/contact/advertise', options)
  return Array.isArray(payload?.inquiries) ? payload.inquiries : []
}
