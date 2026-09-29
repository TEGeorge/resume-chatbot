import { desc } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chats } from '../db/schema.js'
import { chatMessages } from './messages.js'

const CreateChatSchema = z.object({ name: z.string().trim().min(1).meta({ example: 'Job search' }) })

const ChatSchema = z.object({
  id: z.string().meta({ example: 'f4392ade-3df1-4d60-a9ca-6ddc3fc2eb0a' }),
  name: z.string(),
  createdAt: z.date(),
})

export const chat = new Hono()
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
      const all = await db.select().from(chats).orderBy(desc(chats.createdAt))
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
      },
    }),
    validator('json', CreateChatSchema),
    async (c) => {
      const { name } = c.req.valid('json')
      const [created] = await db.insert(chats).values({ name }).returning()
      return c.json(created, 201)
    },
  )
  .route('/:id/messages', chatMessages)
