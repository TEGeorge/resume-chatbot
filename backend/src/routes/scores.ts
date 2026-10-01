import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { jobs, resumes, scores } from '../db/schema.js'
import type { AppEnv } from '../services/index.js'
import { BANDS, ScoreError, ScoreOutputSchema } from '../services/scoring.js'

const ScoreSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  resumeName: z.string(),
  jobId: z.string(),
  jobName: z.string(),
  // the prompt and model that produced it, e.g. "score@v1"
  promptVersion: z.string(),
  model: z.string(),
  globalScore: z.number().meta({ description: '1.0 to 5.0, one decimal' }),
  band: z.enum(['strong', 'good', 'decent', 'weak']),
  recommendation: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  postingComplete: z.boolean(),
  dimensions: ScoreOutputSchema.shape.dimensions,
  summary: z.string(),
  checks: z.array(z.string()),
  createdAt: z.date(),
})

const CreateScoreSchema = z.object({
  resumeId: z.string().min(1),
  jobId: z.string().min(1),
})

const ListQuerySchema = z.object({
  resumeId: z.string().optional(),
  jobId: z.string().optional(),
})

const selection = {
  id: scores.id,
  resumeId: scores.resumeId,
  resumeName: resumes.name,
  jobId: scores.jobId,
  jobName: jobs.name,
  promptVersion: scores.promptVersion,
  model: scores.model,
  globalScore: scores.globalScore,
  band: scores.band,
  confidence: scores.confidence,
  result: scores.result,
  createdAt: scores.createdAt,
}

type Row = { [K in keyof typeof selection]: (typeof selection)[K]['_']['data'] }

function toResponse(row: Row) {
  const { result, ...rest } = row
  return { ...rest, ...result, recommendation: BANDS[row.band] }
}

const scoreRows = () =>
  db
    .select(selection)
    .from(scores)
    .innerJoin(resumes, eq(scores.resumeId, resumes.id))
    .innerJoin(jobs, eq(scores.jobId, jobs.id))

export const scoreRoutes = new Hono<AppEnv>()
  .post(
    '/',
    describeRoute({
      tags: ['scores'],
      description:
        'Scores one job against one CV with the model and stores the result. Every call creates a new score, so repeated runs and different prompt versions can be compared.',
      responses: {
        201: {
          description: 'Score created',
          content: { 'application/json': { schema: resolver(ScoreSchema) } },
        },
        400: { description: 'Invalid body, unknown CV or unknown job' },
        502: { description: 'The model failed or returned an unusable result' },
      },
    }),
    validator('json', CreateScoreSchema),
    async (c) => {
      const { resumeId, jobId } = c.req.valid('json')

      const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1)
      if (!resume) return c.json({ error: 'CV not found' }, 400)
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
      if (!job) return c.json({ error: 'Job not found' }, 400)

      // the service scores; this route stores the result
      let evaluation
      try {
        evaluation = await c.get('services').scoring.evaluate({
          resume,
          job,
          signal: c.req.raw.signal,
        })
      } catch (error) {
        if (error instanceof ScoreError) return c.json({ error: error.message }, error.status)
        throw error
      }

      const [created] = await db
        .insert(scores)
        .values({ resumeId, jobId, ...evaluation })
        .returning({ id: scores.id })

      const [row] = await scoreRows().where(eq(scores.id, created.id))
      return c.json(toResponse(row), 201)
    },
  )
  .get(
    '/',
    describeRoute({
      tags: ['scores'],
      description: 'Stored scores, newest first. Filter by `resumeId` and/or `jobId`.',
      responses: {
        200: {
          description: 'Scores',
          content: { 'application/json': { schema: resolver(z.array(ScoreSchema)) } },
        },
      },
    }),
    validator('query', ListQuerySchema),
    async (c) => {
      const { resumeId, jobId } = c.req.valid('query')
      const rows = await scoreRows()
        .where(
          and(
            resumeId ? eq(scores.resumeId, resumeId) : undefined,
            jobId ? eq(scores.jobId, jobId) : undefined,
          ),
        )
        .orderBy(desc(scores.createdAt))
      return c.json(rows.map(toResponse), 200)
    },
  )
  .get(
    '/:id',
    describeRoute({
      tags: ['scores'],
      responses: {
        200: {
          description: 'One score',
          content: { 'application/json': { schema: resolver(ScoreSchema) } },
        },
        404: { description: 'Score not found' },
      },
    }),
    async (c) => {
      const [row] = await scoreRows().where(eq(scores.id, c.req.param('id')))
      if (!row) return c.json({ error: 'Score not found' }, 404)
      return c.json(toResponse(row), 200)
    },
  )
