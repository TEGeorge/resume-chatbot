import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai'
import { asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chatJobs, chats, jobs, messages, resumes } from '../db/schema.js'
import { buildRagSystemPrompt } from '../lib/chat-context.js'
import type { AppEnv } from '../services/index.js'
import { promptLabel } from '../services/prompts.js'
import { RagError } from '../services/rag.js'

// Only the parts are accepted: the role is always 'user' and the server assigns the id.
const SendMessageSchema = z.object({
  parts: z.array(z.record(z.string(), z.unknown())).min(1),
})

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.record(z.string(), z.unknown())),
})

// The chat with its resume (null if it has none) and its jobs in Job #1, #2, ... order
async function getChat(chatId: string) {
  const [found] = await db
    .select({ id: chats.id, resumeName: resumes.name, resumeText: resumes.text })
    .from(chats)
    .leftJoin(resumes, eq(chats.resumeId, resumes.id))
    .where(eq(chats.id, chatId))
    .limit(1)
  if (!found) return undefined

  const attached = await db
    .select({ id: jobs.id, name: jobs.name, text: jobs.text })
    .from(chatJobs)
    .innerJoin(jobs, eq(chatJobs.jobId, jobs.id))
    .where(eq(chatJobs.chatId, chatId))
    .orderBy(asc(chatJobs.position))

  const { resumeName, resumeText, ...rest } = found
  const resume = resumeName && resumeText ? { name: resumeName, text: resumeText } : null
  return { ...rest, resume, jobs: attached }
}

// What to search the documents for: the latest question, plus the one before it so that a
// follow-up like "and what about the second one?" still finds its topic
function retrievalQuery(history: UIMessage[]): string {
  const userTexts = history
    .filter((m) => m.role === 'user')
    .map((m) => m.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ').trim())
    .filter(Boolean)
  // the last two questions, capped at 1500 characters from the end so the newest is never cut
  return userTexts.slice(-2).join('\n').slice(-1500)
}

async function loadMessages(chatId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), sql`rowid`)
  return rows.map(({ id, role, parts }) => ({ id, role, parts }))
}

// Reports a failure as an error in the reply stream, like a model failure, so the chat shows it
const errorStream = (message: string) =>
  createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: 'error', errorText: message })
      },
    }),
  })

export const chatMessages = new Hono<AppEnv>()
  .get(
    '/',
    describeRoute({
      tags: ['messages'],
      responses: {
        200: {
          description: 'Messages in the chat, oldest first (AI SDK UIMessage shape)',
          content: { 'application/json': { schema: resolver(z.array(MessageSchema)) } },
        },
        404: { description: 'Chat not found' },
      },
    }),
    async (c) => {
      const chatId = c.req.param('id')!
      if (!(await getChat(chatId))) return c.json({ error: 'chat not found' }, 404)
      return c.json(await loadMessages(chatId), 200)
    },
  )
  .post(
    '/',
    describeRoute({
      tags: ['messages'],
      description:
        'Send a user message and stream the assistant reply (AI SDK UI message stream over SSE).',
      responses: {
        200: { description: 'text/event-stream' },
        400: { description: 'Invalid body' },
        404: { description: 'Chat not found' },
      },
    }),
    validator('json', SendMessageSchema),
    async (c) => {
      const chatId = c.req.param('id')!
      const chat = await getChat(chatId)
      if (!chat) return c.json({ error: 'chat not found' }, 404)

      const { parts } = c.req.valid('json')

      const { ollama, prompts, rag } = c.get('services')
      const prompt = prompts.get('chat')
      // Search before saving the question, so a failed search leaves no half-saved message
      const previous = await loadMessages(chatId)
      const question = retrievalQuery([...previous, { id: 'new', role: 'user', parts: parts as UIMessage['parts'] }])
      let system: string
      try {
        const jobContext = await rag.retrieveContext({ jobs: chat.jobs, question }, c.req.raw.signal)
        system = buildRagSystemPrompt(prompt.text, chat.resume, jobContext)
      } catch (error) {
        if (error instanceof RagError) return errorStream(error.message)
        throw error
      }

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        chatId,
        role: 'user',
        parts: parts as UIMessage['parts'],
      })
      const history = await loadMessages(chatId)

      const result = await ollama.stream({
        system,
        history,
        signal: c.req.raw.signal,
        // saved from the model stream, not the response stream, so a reply survives the
        // browser disconnecting (reload, closed tab, Stop)
        onFinish: async ({ text }) => {
          if (!text) return
          await db.insert(messages).values({
            id: crypto.randomUUID(),
            chatId,
            role: 'assistant',
            parts: [{ type: 'text', text, state: 'done' }],
            promptVersion: promptLabel(prompt),
          })
        },
      })

      // Keep reading the model's output even if the browser goes away, so onFinish runs.
      // Not awaited on purpose.
      void result.consumeStream()

      return result.toUIMessageStreamResponse({
        originalMessages: history,
        onError: (error) => ollama.describeError(error),
      })
    },
  )
