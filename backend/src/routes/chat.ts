import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chats, resumes } from '../db/schema.js'
import type { AppEnv } from '../services/index.js'
import { chatMessages } from './messages.js'

const CreateChatSchema = z.object({
  name: z.string().trim().min(1).meta({ example: 'Job search' }),
  resumeId: z.string().min(1),
})

const ChatSchema = z.object({
  id: z.string().meta({ example: 'f4392ade-3df1-4d60-a9ca-6ddc3fc2eb0a' }),
  name: z.string(),
  resumeId: z.string().nullable(),
  resumeName: z.string().nullable(),
  createdAt: z.date(),
})

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
        .select({
          id: chats.id,
          name: chats.name,
          resumeId: chats.resumeId,
          resumeName: resumes.name,
          createdAt: chats.createdAt,
        })
        .from(chats)
        .leftJoin(resumes, eq(chats.resumeId, resumes.id))
        .orderBy(desc(chats.createdAt))
      return c.json(all, 200)
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
        400: { description: 'Invalid body or unknown CV' },
      },
    }),
    validator('json', CreateChatSchema),
    async (c) => {
      const { name, resumeId } = c.req.valid('json')

      const [resume] = await db
        .select({ id: resumes.id, name: resumes.name })
        .from(resumes)
        .where(eq(resumes.id, resumeId))
        .limit(1)
      if (!resume) return c.json({ error: 'CV not found' }, 400)

      const [created] = await db.insert(chats).values({ name, resumeId }).returning()
      return c.json({ ...created, resumeName: resume.name }, 201)
    },
  )
  .route('/:id/messages', chatMessages)
