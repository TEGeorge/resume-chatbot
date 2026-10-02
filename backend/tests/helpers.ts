import { serve } from '@hono/node-server'
import type { LanguageModel } from 'ai'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { asc, eq } from 'drizzle-orm'
import { createApp } from '../src/app.js'
import { db, runMigrations } from '../src/db/index.js'
import { jobs, messages } from '../src/db/schema.js'
import { FileProcessingService } from '../src/services/file-processing.js'
import { ChunkingService } from '../src/services/chunking.js'
import { EmbeddingService } from '../src/services/embeddings.js'
import { OllamaService } from '../src/services/ollama.js'
import { PromptService } from '../src/services/prompts.js'
import { RagService } from '../src/services/rag.js'
import { ScoringService } from '../src/services/scoring.js'
import { SummaryService } from '../src/services/summaries.js'

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

// Embeddings without a model: words are hashed into a small vector, so texts that share words
// are close together. Good enough to test ranking and filtering deterministically.
export class HashEmbeddings extends EmbeddingService {
  // set to true to behave like an unreachable embedding server
  failing = false
  calls = 0

  constructor() {
    super({ baseURL: 'http://unused', model: 'test-embed' })
  }

  private vector(text: string): number[] {
    const v = new Array<number>(64).fill(0)
    for (const word of text.toLowerCase().match(/[a-z0-9#+]{3,}/g) ?? []) {
      let h = 2166136261
      for (const ch of word) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
      v[Math.abs(h) % 64]! += 1
    }
    const norm = Math.hypot(...v) || 1
    return v.map((x) => x / norm)
  }

  override async embedDocuments(texts: string[]) {
    this.calls++
    if (this.failing) throw new Error('embedding server unreachable')
    return texts.map((t) => this.vector(t))
  }

  override async embedQuery(text: string) {
    this.calls++
    if (this.failing) throw new Error('embedding server unreachable')
    return this.vector(text)
  }
}

// Summaries without a model call, so tests that look at the chat model's calls are not disturbed
export class StubSummaries extends SummaryService {
  // set to true to behave like an unavailable summary model
  failing = false

  override async summarize(text: string) {
    if (this.failing) throw new Error('summary model unavailable')
    return `Summary of the job: ${text.replace(/\s+/g, ' ').slice(0, 40)}`
  }
}

export function makeSummaries() {
  const ollama = new OllamaService({ baseURL: 'http://unused', model: 'unused' }, scriptedModel({}))
  const prompts = new PromptService(
    { chat: TEST_PROMPTS, score: { v1: 'S' }, summary: { v1: 'SUMMARY-PROMPT' } },
    { chat: 'v2', score: 'v1', summary: 'v1' },
  )
  return new StubSummaries(ollama, prompts)
}

// A RagService with fake embeddings and summaries, for tests that call it directly
export function makeRag(embeddings: EmbeddingService = new HashEmbeddings(), summaries: StubSummaries = makeSummaries()) {
  return new RagService(new ChunkingService(), embeddings, summaries)
}

// Removes a job's chunks and summary, as if it had never been indexed
export async function forgetIndex(jobId: string) {
  await makeRag().deleteChunks(jobId)
  await db.update(jobs).set({ summary: null }).where(eq(jobs.id, jobId))
}

// The real app, with only the model faked. `promptVersion` picks the active chat prompt;
// `embeddings` replaces the default HashEmbeddings (e.g. one that fails).
export function createTestApp(
  model: LanguageModel,
  options: { promptVersion?: string; embeddings?: EmbeddingService; summaries?: StubSummaries } = {},
) {
  if (!migrated) {
    runMigrations()
    migrated = true
  }
  const ollama = new OllamaService({ baseURL: 'http://unused', model: 'unused' }, model)
  const prompts = new PromptService(
    { chat: TEST_PROMPTS, score: { v1: 'SCORE-PROMPT' }, summary: { v1: 'SUMMARY-PROMPT' } },
    { chat: options.promptVersion ?? 'v2', score: 'v1', summary: 'v1' },
  )
  return createApp({
    services: {
      ollama,
      files: new FileProcessingService(),
      prompts,
      scoring: new ScoringService(ollama, prompts),
      rag: new RagService(
        new ChunkingService(),
        options.embeddings ?? new HashEmbeddings(),
        options.summaries ?? new StubSummaries(ollama, prompts),
      ),
    },
  })
}

type TestApp = ReturnType<typeof createTestApp>

export function api(app: TestApp, path: string, init: RequestInit = {}) {
  return app.request(path, init)
}

// A resume and a job, created through the API
export async function seedDocuments(app: TestApp, texts: { resume?: string; job?: string } = {}) {
  const upload = async (path: string, text: string) => {
    const form = new FormData()
    form.set('text', text)
    form.set('name', path === '/jobs' ? 'Backend role' : 'My resume')
    const created = await api(app, path, { method: 'POST', body: form })
    return ((await created.json()) as { id: string }).id
  }
  return {
    resumeId: await upload('/resumes', texts.resume ?? 'Ten years of Go.'),
    jobId: await upload('/jobs', texts.job ?? 'Backend engineer.'),
  }
}

// A chat with a resume and a job, created through the API
export async function seedChat(app: TestApp, texts: { resume?: string; job?: string } = {}): Promise<string> {
  const { resumeId, jobId } = await seedDocuments(app, texts)

  const res = await api(app, '/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test', resumeId, jobIds: [jobId] }),
  })
  return ((await res.json()) as { id: string }).id
}

export function sendMessage(app: TestApp, chatId: string, text: string, signal?: AbortSignal) {
  return api(app, `/chat/${chatId}/messages`, {
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

export async function addJob(app: TestApp, name: string, text: string): Promise<string> {
  const form = new FormData()
  form.set('name', name)
  form.set('text', text)
  const res = await api(app, '/jobs', { method: 'POST', body: form })
  return ((await res.json()) as { id: string }).id
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

// A model that answers once (not streamed) with this text, for structured output
export function textModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  })
}

// A model that gives each of these answers in turn (the last one repeats)
export function sequenceModel(texts: string[]) {
  let call = 0
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text' as const, text: texts[Math.min(call++, texts.length - 1)]! }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  })
}
