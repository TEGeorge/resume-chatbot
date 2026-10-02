import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/index.js'
import { createServices } from './services/index.js'

const config = loadConfig()
const app = createApp({ services: createServices(config) })

runMigrations()

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000)
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
