import { desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { chats, resumes } from '../db/schema.js'
import { ExtractError, MAX_UPLOAD_BYTES } from '../services/file-processing.js'
import type { AppEnv } from '../services/index.js'

const PREVIEW_CHARS = 200

const ResumeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  fileName: z.string().nullable(),
  createdAt: z.date(),
  preview: z.string(),
})

const ResumeSchema = ResumeSummarySchema.omit({ preview: true }).extend({ text: z.string() })

const CreateResumeSchema = z.object({
  file: z.instanceof(File).optional(),
  text: z.string().optional(),
  name: z.string().trim().optional(),
})

const summaryColumns = {
  id: resumes.id,
  name: resumes.name,
  fileName: resumes.fileName,
  createdAt: resumes.createdAt,
  preview: sql<string>`substr(${resumes.text}, 1, ${PREVIEW_CHARS})`,
}

export const resumeRoutes = new Hono<AppEnv>()
  .get(
    '/',
    describeRoute({
      tags: ['resumes'],
      responses: {
        200: {
          description: 'All CVs, newest first, with a short preview (no full text)',
          content: { 'application/json': { schema: resolver(z.array(ResumeSummarySchema)) } },
        },
      },
    }),
    async (c) => {
      const all = await db.select(summaryColumns).from(resumes).orderBy(desc(resumes.createdAt))
      return c.json(all, 200)
    },
  )
  .get(
    '/:id',
    describeRoute({
      tags: ['resumes'],
      responses: {
        200: {
          description: 'One CV with its full extracted text',
          content: { 'application/json': { schema: resolver(ResumeSchema) } },
        },
        404: { description: 'CV not found' },
      },
    }),
    async (c) => {
      const [found] = await db
        .select({
          id: resumes.id,
          name: resumes.name,
          fileName: resumes.fileName,
          createdAt: resumes.createdAt,
          text: resumes.text,
        })
        .from(resumes)
        .where(eq(resumes.id, c.req.param('id')))
        .limit(1)
      if (!found) return c.json({ error: 'CV not found' }, 404)
      return c.json(found, 200)
    },
  )
  .post(
    '/',
    describeRoute({
      tags: ['resumes'],
      description:
        'Multipart form with exactly one of `file` (PDF, DOCX, MD or TXT, max 5 MB) or `text`, and an optional `name`.',
      responses: {
        201: {
          description: 'CV created',
          content: { 'application/json': { schema: resolver(ResumeSummarySchema) } },
        },
        400: { description: 'Send exactly one of file or text' },
        413: { description: 'File too large' },
        415: { description: 'Unsupported file type' },
        422: { description: 'No readable text in the file' },
      },
    }),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) => c.json({ error: 'File too large (max 5 MB)' }, 413),
    }),
    validator('form', CreateResumeSchema),
    async (c) => {
      const { file, text, name } = c.req.valid('form')
      const { files } = c.get('services')
      // an empty file input is submitted as a zero-byte file, so treat it as absent
      const upload = file && file.size > 0 ? file : undefined
      const pasted = text?.trim() ? text : undefined

      if (!upload === !pasted) {
        return c.json({ error: 'Send exactly one of file or text' }, 400)
      }

      let body: string
      try {
        body = upload ? await files.extractText(upload) : files.normalizeText(pasted!)
      } catch (error) {
        if (error instanceof ExtractError) return c.json({ error: error.message }, error.status)
        throw error
      }

      const [created] = await db
        .insert(resumes)
        .values({
          name: name || (upload ? upload.name.replace(/\.[^.]+$/, '') : 'Pasted CV'),
          fileName: upload?.name ?? null,
          mimeType: upload?.type || null,
          text: body,
        })
        .returning()

      return c.json(
        {
          id: created.id,
          name: created.name,
          fileName: created.fileName,
          createdAt: created.createdAt,
          preview: created.text.slice(0, PREVIEW_CHARS),
        },
        201,
      )
    },
  )
  .delete(
    '/:id',
    describeRoute({
      tags: ['resumes'],
      responses: {
        204: { description: 'CV deleted' },
        404: { description: 'CV not found' },
        409: { description: 'A chat uses this CV' },
      },
    }),
    async (c) => {
      const id = c.req.param('id')
      const [found] = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.id, id)).limit(1)
      if (!found) return c.json({ error: 'CV not found' }, 404)

      const [inUse] = await db.select({ id: chats.id }).from(chats).where(eq(chats.resumeId, id)).limit(1)
      if (inUse) return c.json({ error: 'A chat uses this CV' }, 409)

      await db.delete(resumes).where(eq(resumes.id, id))
      return c.body(null, 204)
    },
  )
