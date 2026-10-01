import { NoObjectGeneratedError } from 'ai'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describeRoute, resolver, validator } from 'hono-openapi'
import { z } from 'zod'
import { db } from '../db/index.js'
import { jobScores, jobs, resumes } from '../db/schema.js'
import type { AppEnv } from '../services/index.js'
import { ScoreResultSchema } from '../services/scoring.js'

const ScoreKeySchema = z.object({ resumeId: z.string().min(1), jobId: z.string().min(1) })

const CreateScoreSchema = ScoreKeySchema.extend({
  // score again even if a current score is stored
  refresh: z.boolean().optional(),
})

const JobScoreSchema = ScoreKeySchema.extend({
  createdAt: z.date(),
  result: ScoreResultSchema,
})

async function findScore(resumeId: string, jobId: string, rubricVersion: string) {
  const [found] = await db
    .select({
      resumeId: jobScores.resumeId,
      jobId: jobScores.jobId,
      createdAt: jobScores.createdAt,
      result: jobScores.result,
    })
    .from(jobScores)
    .where(
      and(
        eq(jobScores.resumeId, resumeId),
        eq(jobScores.jobId, jobId),
        eq(jobScores.rubricVersion, rubricVersion),
      ),
    )
    .limit(1)
  return found
}

export const scoreRoutes = new Hono<AppEnv>()
  .get(
    '/',
    describeRoute({
      tags: ['scores'],
      description: 'The stored fit score for a CV against a job, under the current scoring rubric.',
      responses: {
        200: {
          description: 'Stored score',
          content: { 'application/json': { schema: resolver(JobScoreSchema) } },
        },
        404: { description: 'Not scored yet' },
      },
    }),
    validator('query', ScoreKeySchema),
    async (c) => {
      const { resumeId, jobId } = c.req.valid('query')
      const found = await findScore(resumeId, jobId, c.get('services').scoring.rubricVersion)
      if (!found) return c.json({ error: 'Not scored yet' }, 404)
      return c.json(found, 200)
    },
  )
  .post(
    '/',
    describeRoute({
      tags: ['scores'],
      description:
        'Score a CV against a job with the model, or return the stored score if there is one. Pass `refresh: true` to score again.',
      responses: {
        200: {
          description: 'Score',
          content: { 'application/json': { schema: resolver(JobScoreSchema) } },
        },
        400: { description: 'Invalid body, unknown CV or unknown job' },
        502: { description: 'The model failed or returned an unusable reply' },
      },
    }),
    validator('json', CreateScoreSchema),
    async (c) => {
      const { resumeId, jobId, refresh } = c.req.valid('json')
      const { scoring, ollama } = c.get('services')

      if (!refresh) {
        const stored = await findScore(resumeId, jobId, scoring.rubricVersion)
        if (stored) return c.json(stored, 200)
      }

      const [resume] = await db
        .select({ name: resumes.name, text: resumes.text })
        .from(resumes)
        .where(eq(resumes.id, resumeId))
        .limit(1)
      if (!resume) return c.json({ error: 'CV not found' }, 400)
      const [job] = await db
        .select({ name: jobs.name, text: jobs.text })
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1)
      if (!job) return c.json({ error: 'Job not found' }, 400)

      let result
      try {
        result = await scoring.score(resume, job)
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          console.error('job scoring reply did not parse', error)
          return c.json({ error: 'The model did not return a usable score. Try again.' }, 502)
        }
        return c.json({ error: ollama.describeError(error) }, 502)
      }

      const [saved] = await db
        .insert(jobScores)
        .values({ resumeId, jobId, rubricVersion: scoring.rubricVersion, score: result.score, result })
        .onConflictDoUpdate({
          target: [jobScores.resumeId, jobScores.jobId, jobScores.rubricVersion],
          set: { score: result.score, result, createdAt: new Date() },
        })
        .returning({
          resumeId: jobScores.resumeId,
          jobId: jobScores.jobId,
          createdAt: jobScores.createdAt,
          result: jobScores.result,
        })
      return c.json(saved, 200)
    },
  )
