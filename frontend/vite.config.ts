import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      proxy: {
        '/api': {
          target: env.API_URL ?? 'http://localhost:3000',
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  }
})
