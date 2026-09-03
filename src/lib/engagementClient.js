import { postJson } from './api'

// Fire-and-forget engagement tracking: a failed or slow request should never
// block or break the button the visitor just clicked.
export function trackEngagement({ itemType, itemId, channel, action }) {
  try {
    postJson('/engagement/track', { itemType, itemId, channel, action }, { keepalive: true }).catch(() => {})
  } catch {
    // Ignore - tracking is best-effort only.
  }
}
