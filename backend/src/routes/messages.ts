import type { UIMessage } from 'ai'
import { and, asc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chatJobs, chats, jobScores, jobs, messages, resumes } from '../db/schema.js'
import { buildSystemPrompt } from '../lib/chat-context.js'
import type { AppEnv } from '../services/index.js'

// Only the parts are accepted: the role is always 'user' and the server assigns the id.
const SendMessageSchema = z.object({
  parts: z.array(z.record(z.string(), z.unknown())).min(1),
})

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.record(z.string(), z.unknown())),
})

// The chat plus its CV (null for chats created before CVs existed) and jobs in Job #1, #2, ... order,
// each with its stored score for this CV under the current rubric (null if not scored)
async function getChat(chatId: string, rubricVersion: string) {
  const [found] = await db
    .select({ id: chats.id, resumeId: chats.resumeId, resumeName: resumes.name, resumeText: resumes.text })
    .from(chats)
    .leftJoin(resumes, eq(chats.resumeId, resumes.id))
    .where(eq(chats.id, chatId))
    .limit(1)
  if (!found) return undefined

  const attached = await db
    .select({ name: jobs.name, text: jobs.text, score: jobScores.result })
    .from(chatJobs)
    .innerJoin(jobs, eq(chatJobs.jobId, jobs.id))
    .leftJoin(
      jobScores,
      and(
        eq(jobScores.jobId, jobs.id),
        // chats from before CVs existed have no CV, so nothing matches
        eq(jobScores.resumeId, found.resumeId ?? ''),
        eq(jobScores.rubricVersion, rubricVersion),
      ),
    )
    .where(eq(chatJobs.chatId, chatId))
    .orderBy(asc(chatJobs.position))

  return { ...found, jobs: attached }
}

async function loadMessages(chatId: string): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), sql`rowid`)
  return rows.map(({ id, role, parts }) => ({ id, role, parts }))
}

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
      const { scoring } = c.get('services')
      if (!(await getChat(chatId, scoring.rubricVersion))) return c.json({ error: 'chat not found' }, 404)
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
      const { ollama, scoring, prompts } = c.get('services')
      const chat = await getChat(chatId, scoring.rubricVersion)
      if (!chat) return c.json({ error: 'chat not found' }, 404)

      const { parts } = c.req.valid('json')

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        chatId,
        role: 'user',
        parts: parts as UIMessage['parts'],
      })

      const history = await loadMessages(chatId)

      const system = buildSystemPrompt(
        prompts,
        chat.resumeName !== null && chat.resumeText !== null
          ? { name: chat.resumeName, text: chat.resumeText }
          : null,
        chat.jobs,
      )

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
