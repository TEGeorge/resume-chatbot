import type { UIMessage } from 'ai'
import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const resumes = sqliteTable('resumes', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  text: text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  text: text('text').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  resumeId: text('resume_id').references(() => resumes.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export type Chat = typeof chats.$inferSelect

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  // AI SDK UIMessage parts, stored as JSON
  parts: text('parts', { mode: 'json' }).$type<UIMessage['parts']>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
})

// Jobs attached to a chat. `position` is the 1-based order the user picked them in,
// which is what "Job #2" refers to.
export const chatJobs = sqliteTable(
  'chat_jobs',
  {
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.jobId] })],
)
