import { hc } from 'hono/client'
import type { AppType } from '../../../backend/src/app'

// '/api' is proxied to the backend by Vite (see vite.config.ts)
export const api = hc<AppType>('/api')

// Reads the `{ error }` body the API returns on failure
export async function errorMessage(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? fallback
}
