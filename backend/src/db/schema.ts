import type { UIMessage } from 'ai'
import type { ScoreOutput } from '../services/scoring.js'

type ScoreResult = Omit<ScoreOutput, 'globalScore'>
import { sql } from 'drizzle-orm'
import { blob, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
  summary: text('summary'),
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
  // which prompt produced an assistant reply, e.g. "chat@v1" (null for user messages)
  promptVersion: text('prompt_version'),
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

export const scores = sqliteTable('scores', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  resumeId: text('resume_id')
    .notNull()
    .references(() => resumes.id, { onDelete: 'cascade' }),
  jobId: text('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  // e.g. "score@v1"
  promptVersion: text('prompt_version').notNull(),
  model: text('model').notNull(),
  globalScore: real('global_score').notNull(),
  band: text('band', { enum: ['strong', 'good', 'decent', 'weak'] }).notNull(),
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] }).notNull(),
  result: text('result', { mode: 'json' }).$type<ScoreResult>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
})

export const chunks = sqliteTable(
  'chunks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceType: text('source_type', { enum: ['job'] }).notNull(),
    sourceId: text('source_id').notNull(),
    position: integer('position').notNull(),
    label: text('label').notNull(),
    text: text('text').notNull(),
    // the embedding model; vectors from different models are never compared
    model: text('model').notNull(),
    // little-endian float32 vector, read with sqlite-vec's functions
    embedding: blob('embedding', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index('chunks_source_idx').on(table.sourceType, table.sourceId)],
)
