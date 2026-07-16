import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
  const hostingSite = String(env.VITE_FIREBASE_HOSTING_SITE ?? projectId).trim()
  const apiBaseUrl = String(env.VITE_API_BASE_URL ?? '/api').trim() || '/api'
  const devApiProxyTarget = String(env.VITE_DEV_API_PROXY_TARGET ?? '').trim()
  const useFunctionsEmulator = ['1', 'true', 'emulator', 'local'].includes(
    String(env.VITE_USE_FUNCTIONS_EMULATOR ?? '').trim().toLowerCase(),
  )
  const deployedApiProxyTarget = hostingSite ? `https://${hostingSite}.web.app` : ''
  const emulatorApiProxyTarget = projectId ? `http://127.0.0.1:5001/${projectId}/us-central1/siteApi` : ''
  const apiProxyTarget = devApiProxyTarget || (useFunctionsEmulator ? emulatorApiProxyTarget : deployedApiProxyTarget)
  const apiProxyTargetPathname = (() => {
    try {
      return new URL(apiProxyTarget).pathname.replace(/\/+$/, '')
    } catch {
      return ''
    }
  })()
  const shouldStripApiPrefix = apiProxyTargetPathname && apiProxyTargetPathname !== '/'
  const server =
    apiBaseUrl === '/api' && apiProxyTarget
      ? {
          host: true,
          proxy: {
            '/api': {
              target: apiProxyTarget,
              changeOrigin: true,
              ...(shouldStripApiPrefix ? { rewrite: (path) => path.replace(/^\/api/, '') } : {}),
            },
          },
        }
      : { host: true }

  return {
    plugins: [react()],
    server,
  }
})
