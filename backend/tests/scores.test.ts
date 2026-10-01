import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import type { ScoreOutput } from '../src/services/scoring.js'
import { api, createTestApp, seedDocuments, textModel } from './helpers.js'

const dimension = (
  score: number,
  evidence: 'supported' | 'partial' | 'unknown' = 'supported',
  rationale = 'Because.',
) => ({
  score,
  evidence,
  rationale,
})

// A valid model answer; tests change fields as needed
const modelOutput = (overrides: Partial<ScoreOutput> = {}) => ({
  postingComplete: true,
  dimensions: {
    cvMatch: dimension(5, 'supported', 'Ten years of Go matches the core requirement.'),
    trajectoryFit: dimension(4),
    comp: dimension(3, 'unknown', 'No pay stated.'),
    culture: dimension(4, 'partial'),
    redFlags: dimension(5),
  },
  globalScore: 4.3,
  summary: 'Strong CV match; pay is not stated.',
  checks: ['Confirm the salary range'],
  ...overrides,
})

const post = (app: ReturnType<typeof createTestApp>, body: unknown) =>
  api(app, '/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const list = async (app: ReturnType<typeof createTestApp>, query = '') =>
  (await (await api(app, `/scores${query}`)).json()) as Array<Record<string, any>>

describe('POST /scores', () => {
  it('scores the job against the CV, derives band and confidence, and stores it', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    const { resumeId, jobId } = await seedDocuments(app)

    const res = await post(app, { resumeId, jobId })
    expect(res.status).toBe(201)
    const score = await res.json()

    expect(score).toMatchObject({
      resumeId,
      jobId,
      promptVersion: 'score@v1',
      model: 'unused',
      globalScore: 4.3,
      band: 'good',
      recommendation: 'Good match, worth applying',
      // comp unknown (one) and culture partial, and a check is open: not high, not low
      confidence: 'medium',
      postingComplete: true,
      summary: 'Strong CV match; pay is not stated.',
      checks: ['Confirm the salary range'],
    })
    expect(score.dimensions.cvMatch).toEqual({
      score: 5,
      evidence: 'supported',
      rationale: 'Ten years of Go matches the core requirement.',
    })
    expect(score.resumeName).toBeTruthy()
    expect(score.jobName).toBeTruthy()

    // it was stored: fetching it again returns the same thing
    const fetched = await api(app, `/scores/${score.id}`)
    expect(fetched.status).toBe(200)
    expect(await fetched.json()).toEqual(score)
  })

  it('accepts JSON the model wrapped in a code fence or a sentence', async () => {
    const json = JSON.stringify(modelOutput())
    for (const text of ['```json\n' + json + '\n```', 'Here is the score:\n' + json + '\nHope that helps!']) {
      const app = createTestApp(textModel(text))
      const { resumeId, jobId } = await seedDocuments(app)

      const res = await post(app, { resumeId, jobId })

      expect(res.status, text.slice(0, 20)).toBe(201)
      expect(((await res.json()) as { globalScore: number }).globalScore).toBe(4.3)
    }
  })

  it('works out band and confidence itself instead of trusting the model', async () => {
    const lowEvidence = modelOutput({
      globalScore: 2.6,
      dimensions: {
        cvMatch: dimension(2, 'unknown'),
        trajectoryFit: dimension(3),
        comp: dimension(3, 'unknown'),
        culture: dimension(3),
        redFlags: dimension(3),
      },
    })
    // extra fields from the model, trying to set its own band and confidence, are dropped
    const app = createTestApp(
      textModel(JSON.stringify({ ...lowEvidence, band: 'strong', confidence: 'high' })),
    )
    const { resumeId, jobId } = await seedDocuments(app)

    const score = await (await post(app, { resumeId, jobId })).json()

    expect(score.band).toBe('weak')
    expect(score.confidence).toBe('low')
  })

  it('sends the score prompt with the CV and the job to the model', async () => {
    const model = textModel(JSON.stringify(modelOutput()))
    const app = createTestApp(model)
    const { resumeId, jobId } = await seedDocuments(app)

    await post(app, { resumeId, jobId })

    const system = model.doGenerateCalls[0].prompt.find((m) => m.role === 'system')
    const text = typeof system?.content === 'string' ? system.content : ''
    expect(text.startsWith('SCORE-PROMPT')).toBe(true)
    expect(text).toContain('Ten years of Go.')
    expect(text).toContain('<job number="1"')
    expect(text).toContain('Backend engineer.')
  })

  it('keeps every run, so repeated scores can be compared', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    const { resumeId, jobId } = await seedDocuments(app)

    const first = await (await post(app, { resumeId, jobId })).json()
    const second = await (await post(app, { resumeId, jobId })).json()

    expect(first.id).not.toBe(second.id)
    const all = await list(app, `?resumeId=${resumeId}&jobId=${jobId}`)
    expect(all.map((s) => s.id).sort()).toEqual([first.id, second.id].sort())
  })

  it('rejects an unknown CV or job and stores nothing', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    const { resumeId, jobId } = await seedDocuments(app)

    expect((await post(app, { resumeId: 'nope', jobId })).status).toBe(400)
    expect((await post(app, { resumeId, jobId: 'nope' })).status).toBe(400)
    expect((await post(app, { resumeId })).status).toBe(400)
    expect(await list(app, `?resumeId=${resumeId}`)).toEqual([])
  })

  it('returns 502 and stores nothing when the model result is unusable', async () => {
    const outOfRange = JSON.stringify(modelOutput({ globalScore: 9 }))
    for (const text of ['not json at all', '{"summary":"missing fields"}', outOfRange]) {
      const app = createTestApp(textModel(text))
      const { resumeId, jobId } = await seedDocuments(app)

      const res = await post(app, { resumeId, jobId })

      expect(res.status, text).toBe(502)
      expect(((await res.json()) as { error: string }).error).toContain('usable structured result')
      expect(await list(app, `?resumeId=${resumeId}`)).toEqual([])
    }
  })

  it('returns 502 with the status when the model API fails', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: 'denied',
          url: 'http://model',
          requestBodyValues: {},
          statusCode: 401,
          responseBody: '{"error":"Unauthorized"}',
        })
      },
    })
    const app = createTestApp(model)
    const { resumeId, jobId } = await seedDocuments(app)

    const res = await post(app, { resumeId, jobId })

    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: string }).error).toContain('401')
  })
})

describe('GET /scores', () => {
  it('lists scores newest first and filters by CV and job', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    const a = await seedDocuments(app)
    const b = await seedDocuments(app)

    const first = await (await post(app, a)).json()
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await (await post(app, b)).json()

    const all = await list(app)
    expect(all.map((s) => s.id).indexOf(second.id)).toBeLessThan(all.map((s) => s.id).indexOf(first.id))
    expect((await list(app, `?jobId=${a.jobId}`)).map((s) => s.id)).toEqual([first.id])
    expect((await list(app, `?resumeId=${b.resumeId}`)).map((s) => s.id)).toEqual([second.id])
  })

  it('returns 404 for an unknown score', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    expect((await api(app, '/scores/nope')).status).toBe(404)
  })
})

describe('deleting the CV or the job', () => {
  it('removes the scores that depend on it', async () => {
    const app = createTestApp(textModel(JSON.stringify(modelOutput())))
    const { resumeId, jobId } = await seedDocuments(app)
    const score = await (await post(app, { resumeId, jobId })).json()

    expect((await api(app, `/jobs/${jobId}`, { method: 'DELETE' })).status).toBe(204)

    expect((await api(app, `/scores/${score.id}`)).status).toBe(404)
  })
})
