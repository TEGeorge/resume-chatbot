import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const auth = Buffer.from(
    `${env.BASIC_AUTH_USERNAME ?? ''}:${env.BASIC_AUTH_PASSWORD ?? ''}`,
  ).toString('base64')

  // The dev proxy attaches the backend's Basic Auth credentials, so they
  // never reach the browser bundle.
  const api = {
    target: env.API_URL ?? 'http://localhost:3000',
    headers: { Authorization: `Basic ${auth}` },
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: { proxy: { '/api': { ...api, rewrite: (p) => p.replace(/^\/api/, '') } } },
  }
})
