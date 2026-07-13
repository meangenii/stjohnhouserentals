import { postJson } from './api'

export async function submitPageInquiry(payload) {
  return postJson('/contact/inquiry', payload)
}
