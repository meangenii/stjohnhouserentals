import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const projectId = String(env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
  const apiBaseUrl = String(env.VITE_API_BASE_URL ?? '/api').trim() || '/api'
  const server =
    apiBaseUrl === '/api' && projectId
      ? {
          host: true,
          proxy: {
            '/api': {
              target: `http://127.0.0.1:5001/${projectId}/us-central1/siteApi`,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        }
      : { host: true }

  return {
    plugins: [react()],
    server,
  }
})
