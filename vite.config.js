import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
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
      },
    },
  }
})
