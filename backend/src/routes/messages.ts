import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from 'ai'
import { asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chats, messages } from '../db/schema.js'

// No AI provider yet: every reply is this static message.
const STATIC_REPLY =
  'The AI provider is not connected yet, so this is a static reply. Your message was saved.'

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
        'Send a user message and stream the assistant reply (AI SDK UI message stream over SSE). The reply is currently static.',
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

      // Full history, including the message just saved. Pass it to the model
      // (convertToModelMessages) once a provider is added.
      const history = await loadMessages(chatId)

      const stream = createUIMessageStream({
        originalMessages: history,
        execute: ({ writer }) => {
          const id = crypto.randomUUID()
          writer.write({ type: 'text-start', id })
          writer.write({ type: 'text-delta', id, delta: STATIC_REPLY })
          writer.write({ type: 'text-end', id })
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

      return createUIMessageStreamResponse({ stream })
    },
  )
