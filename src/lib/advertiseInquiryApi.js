import { postJson } from './api'

export async function submitAdvertiseInquiry(payload) {
  return postJson('/contact/advertise', payload)
}
