import { hc } from 'hono/client'
import type { AppType } from '../../../backend/src/app'

// '/api' is proxied to the backend by Vite (see vite.config.ts)
export const api = hc<AppType>('/api')
