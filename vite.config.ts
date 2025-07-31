import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/ice-servers': {
        target: 'http://localhost:54321/functions/v1/ice-servers',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ice-servers/, '')
      },
      '/api/signaling': {
        target: 'ws://localhost:54321/functions/v1/signaling',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/signaling/, '')
      }
    }
  }
})