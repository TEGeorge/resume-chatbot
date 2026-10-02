import { desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chatJobs, jobs } from '../db/schema.js'
import { DocumentFormSchema, readDocumentInput } from '../lib/document-input.js'
import { RenameSchema } from '../lib/zod.js'
import { ExtractError, MAX_UPLOAD_BYTES } from '../services/file-processing.js'
import type { AppEnv } from '../services/index.js'
import { RagError } from '../services/rag.js'

const PREVIEW_CHARS = 200
export const JOB_MAX_CHARS = 20_000

const JobFormSchema = DocumentFormSchema.extend({ name: z.string().trim().min(1) })

const JobSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string().nullable(),
  createdAt: z.date(),
  preview: z.string(),
  summary: z.string().nullable(),
})

const JobSchema = JobSummarySchema.omit({ preview: true, summary: true }).extend({ text: z.string() })

const summaryColumns = {
  id: jobs.id,
  name: jobs.name,
  fileName: jobs.fileName,
  createdAt: jobs.createdAt,
  preview: sql<string>`substr(${jobs.text}, 1, ${PREVIEW_CHARS})`,
  summary: jobs.summary,
}

export const jobRoutes = new Hono<AppEnv>()
  .get(
    '/',
    describeRoute({
      tags: ['jobs'],
      responses: {
        200: {
          description: 'All job postings, newest first, with a short preview (no full text)',
          content: { 'application/json': { schema: resolver(z.array(JobSummarySchema)) } },
        },
      },
    }),
    async (c) => {
      const all = await db.select(summaryColumns).from(jobs).orderBy(desc(jobs.createdAt))
      return c.json(all, 200)
    },
  )
  .get(
    '/:id',
    describeRoute({
      tags: ['jobs'],
      responses: {
        200: {
          description: 'One job posting with its full extracted text',
          content: { 'application/json': { schema: resolver(JobSchema) } },
        },
        404: { description: 'Job not found' },
      },
    }),
    async (c) => {
      const [found] = await db
        .select({
          id: jobs.id,
          name: jobs.name,
          fileName: jobs.fileName,
          createdAt: jobs.createdAt,
          text: jobs.text,
        })
        .from(jobs)
        .where(eq(jobs.id, c.req.param('id')))
        .limit(1)
      if (!found) return c.json({ error: 'Job not found' }, 404)
      return c.json(found, 200)
    },
  )
  .post(
    '/',
    describeRoute({
      tags: ['jobs'],
      description: `Multipart form with exactly one of \`file\` (PDF, DOCX, MD or TXT, max 5 MB) or \`text\`, and a required \`name\`. Text is capped at ${JOB_MAX_CHARS} characters.`,
      responses: {
        201: {
          description: 'Job created',
          content: { 'application/json': { schema: resolver(JobSummarySchema) } },
        },
        400: { description: 'Send exactly one of file or text, and a name' },
        413: { description: 'File too large' },
        502: { description: 'Embeddings or the model are unavailable, so the document was not saved' },
        415: { description: 'Unsupported file type' },
        422: { description: 'No readable text in the file' },
      },
    }),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: 'File too large (max 5 MB)' }, 413),
    }),
    validator('form', JobFormSchema),
    async (c) => {
      const { files } = c.get('services')

      let input
      try {
        input = await readDocumentInput(files, c.req.valid('form'), {
          pastedName: 'Pasted job', // never used: a name is required
          maxChars: JOB_MAX_CHARS,
        })
      } catch (error) {
        if (error instanceof ExtractError) return c.json({ error: error.message }, error.status)
        throw error
      }

      // Analyse before saving, so a failure stores nothing
      const { rag } = c.get('services')
      let analysis
      try {
        analysis = await rag.analyse(input.text, c.req.raw.signal)
      } catch (error) {
        if (error instanceof RagError) return c.json({ error: error.message }, error.status)
        throw error
      }

      const created = db.transaction((tx) => {
        const [row] = tx.insert(jobs).values({ ...input, summary: analysis.summary }).returning().all()
        rag.saveChunks(tx, row!.id, analysis)
        return row!
      })

      const [stored] = await db.select(summaryColumns).from(jobs).where(eq(jobs.id, created.id))
      return c.json(stored!, 201)
    },
  )
  .patch(
    '/:id',
    describeRoute({
      tags: ['jobs'],
      description: 'Rename a job. The text is unchanged.',
      responses: {
        200: {
          description: 'The renamed job',
          content: { 'application/json': { schema: resolver(JobSummarySchema) } },
        },
        400: { description: 'Invalid name' },
        404: { description: 'Job not found' },
      },
    }),
    validator('json', RenameSchema),
    async (c) => {
      const [updated] = await db
        .update(jobs)
        .set({ name: c.req.valid('json').name })
        .where(eq(jobs.id, c.req.param('id')))
        .returning()
      if (!updated) return c.json({ error: 'Job not found' }, 404)
      return c.json(
        {
          id: updated.id,
          name: updated.name,
          fileName: updated.fileName,
          createdAt: updated.createdAt,
          preview: updated.text.slice(0, PREVIEW_CHARS),
          summary: updated.summary,
        },
        200,
      )
    },
  )
  .delete(
    '/:id',
    describeRoute({
      tags: ['jobs'],
      responses: {
        204: { description: 'Job deleted' },
        404: { description: 'Job not found' },
        409: { description: 'A chat uses this job' },
      },
    }),
    async (c) => {
      const id = c.req.param('id')
      const [found] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1)
      if (!found) return c.json({ error: 'Job not found' }, 404)

      const [inUse] = await db.select({ chatId: chatJobs.chatId }).from(chatJobs).where(eq(chatJobs.jobId, id)).limit(1)
      if (inUse) return c.json({ error: 'A chat uses this job' }, 409)

      await c.get('services').rag.deleteChunks(id)
      await db.delete(jobs).where(eq(jobs.id, id))
      return c.body(null, 204)
    },
  )
