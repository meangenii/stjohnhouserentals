import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const CHUNK_RELOAD_STORAGE_KEY = 'sjhr:chunk-load-reload'
const CHUNK_RELOAD_COOLDOWN_MS = 60_000

window.addEventListener('vite:preloadError', (event) => {
  const now = Date.now()
  const recoveryToken = `${import.meta.url}|${window.location.pathname}${window.location.search}`

  try {
    const storedAttempt = window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY)
    let previousAttempt = null

    try {
      previousAttempt = JSON.parse(storedAttempt || 'null')
    } catch {
      previousAttempt = null
    }

    if (
      previousAttempt?.token === recoveryToken &&
      Number.isFinite(previousAttempt.at) &&
      now - previousAttempt.at < CHUNK_RELOAD_COOLDOWN_MS
    ) {
      return
    }

    window.sessionStorage.setItem(
      CHUNK_RELOAD_STORAGE_KEY,
      JSON.stringify({ at: now, token: recoveryToken }),
    )
  } catch {
    // Without a persistent guard, allow the error boundary to handle the
    // failure instead of risking a reload loop.
    return
  }

  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
