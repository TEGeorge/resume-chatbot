import { serve } from '@hono/node-server'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { asc, eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import { db, runMigrations } from '../src/db/index.js'
import { messages } from '../src/db/schema.js'
import { FileProcessingService } from '../src/services/file-processing.js'
import { OllamaService } from '../src/services/ollama.js'
import { PromptService } from '../src/services/prompts.js'

const AUTH = { Authorization: `Basic ${Buffer.from('t:t').toString('base64')}` }

let migrated = false

// A model that streams `words` one by one, `delayMs` apart (or fails instead)
// Failing before any text: pass `error`. Failing partway: pass `failAfter` (number of words sent first).
export function scriptedModel(options: {
  words?: string[]
  delayMs?: number
  error?: Error
  failAfter?: number
}) {
  const { words = [], delayMs = 0, error, failAfter } = options
  return new MockLanguageModelV4({
    doStream: async () => {
      if (error) throw error
      return {
        stream: simulateReadableStream({
          initialDelayInMs: delayMs,
          chunkDelayInMs: delayMs,
          chunks: [
            { type: 'stream-start' as const, warnings: [] },
            { type: 'text-start' as const, id: 't1' },
            ...(failAfter === undefined
              ? words.map((delta) => ({ type: 'text-delta' as const, id: 't1', delta }))
              : [
                  ...words
                    .slice(0, failAfter)
                    .map((delta) => ({ type: 'text-delta' as const, id: 't1', delta })),
                  { type: 'error' as const, error: new Error('connection reset') },
                ]),
            { type: 'text-end' as const, id: 't1' },
            {
              type: 'finish' as const,
              finishReason: { unified: 'stop' as const, raw: 'stop' },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: words.length, text: words.length, reasoning: 0 },
              },
            },
          ],
        }),
      }
    },
  })
}

// Two versions of the chat prompt, so tests can tell which one was used
export const TEST_PROMPTS = { v1: '<!-- first -->PROMPT-ONE', v2: 'PROMPT-TWO' }

// The real app, with only the model faked. `promptVersion` picks the active chat prompt.
export function createTestApp(model: LanguageModel, options: { promptVersion?: string } = {}) {
  if (!migrated) {
    runMigrations()
    migrated = true
  }
  return createApp({
    auth: { username: 't', password: 't' },
    services: {
      ollama: new OllamaService({ baseURL: 'http://unused', model: 'unused' }, model),
      files: new FileProcessingService(),
      prompts: new PromptService({ chat: TEST_PROMPTS }, { chat: options.promptVersion ?? 'v2' }),
    },
  })
}

type TestApp = ReturnType<typeof createTestApp>

function request(app: TestApp, path: string, init: RequestInit = {}) {
  return app.request(path, { ...init, headers: { ...AUTH, ...init.headers } })
}

// A chat with a CV and a job, created through the API
export async function seedChat(app: TestApp): Promise<string> {
  const upload = async (path: string, text: string) => {
    const form = new FormData()
    form.set('text', text)
    const created = await request(app, path, { method: 'POST', body: form })
    return ((await created.json()) as { id: string }).id
  }
  const resumeId = await upload('/resumes', 'Ten years of Go.')
  const jobId = await upload('/jobs', 'Backend engineer.')

  const res = await request(app, '/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test', resumeId, jobIds: [jobId] }),
  })
  return ((await res.json()) as { id: string }).id
}

export function sendMessage(app: TestApp, chatId: string, text: string, signal?: AbortSignal) {
  return request(app, `/chat/${chatId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parts: [{ type: 'text', text }] }),
    signal,
  })
}

// Reads a whole UI message stream and returns the text and any error it carried
export async function readStream(res: Response) {
  const body = await res.text()
  let text = ''
  let error: string | undefined
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const chunk = JSON.parse(line.slice(6))
    if (chunk.type === 'text-delta') text += chunk.delta
    if (chunk.type === 'error') error = chunk.errorText
  }
  return { text, error }
}

// What the database holds for a chat, oldest first
export async function storedMessages(chatId: string) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
  return rows.map((row) => ({
    role: row.role,
    text: row.parts.map((p) => (p.type === 'text' ? p.text : '')).join(''),
  }))
}

// Which prompt each assistant reply says it came from
export async function storedPromptVersions(chatId: string) {
  const rows = await db
    .select({ role: messages.role, promptVersion: messages.promptVersion })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
  return rows.map((row) => row.promptVersion)
}

// The system prompt the model was actually sent on its first call
export function systemPromptSent(model: ReturnType<typeof scriptedModel>): string {
  const system = model.doStreamCalls[0]?.prompt.find((m) => m.role === 'system')
  return typeof system?.content === 'string' ? system.content : ''
}

export async function waitFor<T>(check: () => Promise<T | undefined | false>, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return undefined
}

// Serves the app over real HTTP on a random free port, so a test can disconnect like a browser.
// Call `close()` when done.
export async function listen(app: TestApp) {
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, ({ port }) => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => {
          if ('closeAllConnections' in server) server.closeAllConnections()
          server.close()
        },
      })
    })
  })
}

export { AUTH as authHeaders }
