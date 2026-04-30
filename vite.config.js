import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Resolve the Anthropic key without forcing the VITE_ prefix. We want the
  // key out of the client bundle ; using a non-VITE_ name guarantees Vite
  // doesn't inline it into JS. Falls back to the legacy VITE_ name during
  // migration so existing .env files keep working.
  const anthropicKey = env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || ''

  return {
    plugins: [react()],
    // Source maps off in production builds — minified JS only, no readable
    // mapping back to the original source. Slows down reverse engineering.
    build: {
      sourcemap: false,
    },
    server: {
      proxy: {
        // Proxy /api/anthropic → https://api.anthropic.com/v1/messages
        // Mirrors api/anthropic.js (Vercel function) for local dev. Streams
        // SSE responses through unmodified for token-by-token UI updates.
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: () => '/v1/messages',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (anthropicKey) proxyReq.setHeader('x-api-key', anthropicKey)
              proxyReq.setHeader('Content-Type', 'application/json')
              // anthropic-version + anthropic-beta passthrough from client
              // happens automatically — http-proxy preserves request headers.
            })
          },
        },
        // Proxy /api/mem0/add  → https://api.mem0.ai/v1/memories/
        '/api/mem0/add': {
          target: 'https://api.mem0.ai',
          changeOrigin: true,
          rewrite: () => '/v1/memories/',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Token ${env.VITE_MEM0_API_KEY}`)
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
        // Proxy /api/mem0/search → https://api.mem0.ai/v1/memories/search/
        '/api/mem0/search': {
          target: 'https://api.mem0.ai',
          changeOrigin: true,
          rewrite: () => '/v1/memories/search/',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Token ${env.VITE_MEM0_API_KEY}`)
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          },
        },
        // Proxy /api/mem0/list?user_id=X&app_id=Y → https://api.mem0.ai/v1/memories/?user_id=X&app_id=Y
        '/api/mem0/list': {
          target: 'https://api.mem0.ai',
          changeOrigin: true,
          rewrite: (path) => {
            const qIdx = path.indexOf('?')
            const query = qIdx >= 0 ? path.slice(qIdx) : ''
            return `/v1/memories/${query}`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Token ${env.VITE_MEM0_API_KEY}`)
            })
          },
        },
        // Proxy /api/mem0/delete?id=ABC → https://api.mem0.ai/v1/memories/ABC/
        '/api/mem0/delete': {
          target: 'https://api.mem0.ai',
          changeOrigin: true,
          rewrite: (path) => {
            const qIdx = path.indexOf('?')
            const query = qIdx >= 0 ? path.slice(qIdx + 1) : ''
            const params = new URLSearchParams(query)
            const id = params.get('id')
            if (!id) return '/v1/memories/' // will fail upstream, but safely
            return `/v1/memories/${encodeURIComponent(id)}/`
          },
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Token ${env.VITE_MEM0_API_KEY}`)
            })
          },
        },
        // Proxy /api/whisper → https://api.openai.com/v1/audio/transcriptions
        // Client sends multipart/form-data; proxy injects Authorization only.
        '/api/whisper': {
          target: 'https://api.openai.com',
          changeOrigin: true,
          rewrite: () => '/v1/audio/transcriptions',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.OPENAI_API_KEY}`)
              // Do NOT touch Content-Type — preserve multipart boundary
            })
          },
        },
      },
    },
  }
})
