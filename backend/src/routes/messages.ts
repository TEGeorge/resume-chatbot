import { APICallError, convertToModelMessages, streamText, type UIMessage } from 'ai'
import { asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { createOllama } from 'ollama-ai-provider-v2'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chats, messages } from '../db/schema.js'

const baseURL = process.env.OLLAMA_BASE_URL
const modelName = process.env.OLLAMA_MODEL

if (!baseURL || !modelName) {
  throw new Error('OLLAMA_BASE_URL and OLLAMA_MODEL must be set')
}

const ollama = createOllama({
  baseURL,
  headers: process.env.OLLAMA_API_KEY
    ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
    : undefined,
})
const model = ollama(modelName)

const SYSTEM_PROMPT =
  'You are a career intelligence assistant. Help the user understand how their resume fits job postings: fit, skill gaps, experience alignment, and interview preparation. Be specific and concise, and stay on topic.'

// Only the parts are accepted: the role is always 'user' and the server assigns the id.
const SendMessageSchema = z.object({
  parts: z.array(z.record(z.string(), z.unknown())).min(1),
})

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.record(z.string(), z.unknown())),
})

async function chatExists(chatId: string) {
  const [found] = await db.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).limit(1)
  return !!found
}

async function loadMessages(chatId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), sql`rowid`)
  return rows.map(({ id, role, parts }) => ({ id, role, parts }))
}

export const chatMessages = new Hono()
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
      if (!(await chatExists(chatId))) return c.json({ error: 'chat not found' }, 404)
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
      if (!(await chatExists(chatId))) return c.json({ error: 'chat not found' }, 404)

      const { parts } = c.req.valid('json')

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        chatId,
        role: 'user',
        parts: parts as UIMessage['parts'],
      })

      const history = await loadMessages(chatId)

      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(history),
        abortSignal: c.req.raw.signal,
      })

      return result.toUIMessageStreamResponse({
        originalMessages: history,
        onError: (error) => {
          console.error('chat stream failed', error)
          if (APICallError.isInstance(error)) {
            return `Model request failed (${error.statusCode ?? 'no status'}): ${error.responseBody ?? error.message}`
          }
          return 'The model could not be reached. Check OLLAMA_BASE_URL, OLLAMA_API_KEY and OLLAMA_MODEL.'
        },
        onFinish: async ({ responseMessage }) => {
          await db
            .insert(messages)
            .values({
              id: responseMessage.id,
              chatId,
              role: 'assistant',
              parts: responseMessage.parts,
            })
            .onConflictDoNothing()
        },
      })
    },
  )
