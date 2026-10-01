import { asc, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chatJobs, chats, jobs, resumes } from '../db/schema.js'
import { RenameSchema } from '../lib/zod.js'
import type { AppEnv } from '../services/index.js'
import { chatMessages } from './messages.js'

const CreateChatSchema = z.object({
  name: z.string().trim().min(1).meta({ example: 'Job search' }),
  resumeId: z.string().min(1),
  // the order picked is the order the model and the UI call them Job #1, #2, ...
  jobIds: z.array(z.string().min(1)).min(1),
})

const ChatJobSchema = z.object({ id: z.string(), name: z.string() })

const ChatSchema = z.object({
  id: z.string().meta({ example: 'f4392ade-3df1-4d60-a9ca-6ddc3fc2eb0a' }),
  name: z.string(),
  resumeId: z.string().nullable(),
  resumeName: z.string().nullable(),
  // in Job #1, #2, ... order
  jobs: z.array(ChatJobSchema),
  createdAt: z.date(),
})

// Jobs attached to each of the given chats, in position order
async function jobsByChat(chatIds: string[]) {
  const rows = chatIds.length
    ? await db
        .select({ chatId: chatJobs.chatId, id: jobs.id, name: jobs.name })
        .from(chatJobs)
        .innerJoin(jobs, eq(chatJobs.jobId, jobs.id))
        .where(inArray(chatJobs.chatId, chatIds))
        .orderBy(asc(chatJobs.position))
    : []

  const grouped = new Map<string, { id: string; name: string }[]>()
  for (const { chatId, id, name } of rows) {
    grouped.set(chatId, [...(grouped.get(chatId) ?? []), { id, name }])
  }
  return grouped
}

const chatSelection = {
  id: chats.id,
  name: chats.name,
  resumeId: chats.resumeId,
  resumeName: resumes.name,
  createdAt: chats.createdAt,
}

// One chat in the same shape as the list
async function chatRecord(id: string) {
  const [row] = await db
    .select(chatSelection)
    .from(chats)
    .leftJoin(resumes, eq(chats.resumeId, resumes.id))
    .where(eq(chats.id, id))
    .limit(1)
  if (!row) return undefined
  return { ...row, jobs: (await jobsByChat([id])).get(id) ?? [] }
}

export const chat = new Hono<AppEnv>()
  .get(
    '/',
    describeRoute({
      tags: ['chat'],
      responses: {
        200: {
          description: 'All chats, newest first',
          content: { 'application/json': { schema: resolver(z.array(ChatSchema)) } },
        },
      },
    }),
    async (c) => {
      const all = await db
        .select(chatSelection)
        .from(chats)
        .leftJoin(resumes, eq(chats.resumeId, resumes.id))
        .orderBy(desc(chats.createdAt))

      const jobsFor = await jobsByChat(all.map((chat) => chat.id))
      return c.json(
        all.map((chat) => ({ ...chat, jobs: jobsFor.get(chat.id) ?? [] })),
        200,
      )
    },
  )
  .post(
    '/',
    describeRoute({
      tags: ['chat'],
      responses: {
        201: {
          description: 'Chat created',
          content: { 'application/json': { schema: resolver(ChatSchema) } },
        },
        400: { description: 'Invalid body, unknown resume or unknown job' },
      },
    }),
    validator('json', CreateChatSchema),
    async (c) => {
      const { name, resumeId } = c.req.valid('json')
      const jobIds = [...new Set(c.req.valid('json').jobIds)]

      const [resume] = await db
        .select({ id: resumes.id, name: resumes.name })
        .from(resumes)
        .where(eq(resumes.id, resumeId))
        .limit(1)
      if (!resume) return c.json({ error: 'Resume not found' }, 400)

      const found = await db
        .select({ id: jobs.id, name: jobs.name })
        .from(jobs)
        .where(inArray(jobs.id, jobIds))
      if (found.length !== jobIds.length) return c.json({ error: 'Job not found' }, 400)
      const byId = new Map(found.map((job) => [job.id, job]))

      const created = db.transaction((tx) => {
        const [chat] = tx.insert(chats).values({ name, resumeId }).returning().all()
        tx.insert(chatJobs)
          .values(jobIds.map((jobId, index) => ({ chatId: chat.id, jobId, position: index + 1 })))
          .run()
        return chat
      })

      return c.json(
        { ...created, resumeName: resume.name, jobs: jobIds.map((id) => byId.get(id)!) },
        201,
      )
    },
  )
  .patch(
    '/:id',
    describeRoute({
      tags: ['chat'],
      description: 'Rename a chat.',
      responses: {
        200: {
          description: 'The renamed chat',
          content: { 'application/json': { schema: resolver(ChatSchema) } },
        },
        400: { description: 'Invalid name' },
        404: { description: 'Chat not found' },
      },
    }),
    validator('json', RenameSchema),
    async (c) => {
      const id = c.req.param('id')
      const [updated] = await db
        .update(chats)
        .set({ name: c.req.valid('json').name })
        .where(eq(chats.id, id))
        .returning({ id: chats.id })
      if (!updated) return c.json({ error: 'Chat not found' }, 404)
      return c.json((await chatRecord(id))!, 200)
    },
  )
  .delete(
    '/:id',
    describeRoute({
      tags: ['chat'],
      description:
        'Delete a chat with its messages. The resume and jobs it used are kept (and can then be deleted if nothing else uses them).',
      responses: {
        204: { description: 'Chat deleted' },
        404: { description: 'Chat not found' },
      },
    }),
    async (c) => {
      // messages and job links are removed by the database (ON DELETE CASCADE)
      const [deleted] = await db
        .delete(chats)
        .where(eq(chats.id, c.req.param('id')))
        .returning({ id: chats.id })
      if (!deleted) return c.json({ error: 'Chat not found' }, 404)
      return c.body(null, 204)
    },
  )
  .route('/:id/messages', chatMessages)
