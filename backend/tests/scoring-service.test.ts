import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { OllamaService } from '../src/services/ollama.js'
import { PromptService } from '../src/services/prompts.js'
import { ScoreError, ScoringService } from '../src/services/scoring.js'
import { sequenceModel, textModel } from './helpers.js'

const dimension = (
  score: number,
  evidence: 'supported' | 'partial' | 'unknown' = 'supported',
) => ({ score, evidence, rationale: 'Because.' })

const modelOutput = (overrides: Record<string, unknown> = {}) => ({
  postingComplete: true,
  dimensions: {
    cvMatch: dimension(5),
    trajectoryFit: dimension(4),
    comp: dimension(3, 'unknown'),
    culture: dimension(4, 'partial'),
    redFlags: dimension(5),
  },
  globalScore: 4.26,
  summary: 'Strong match.',
  checks: ['Confirm pay'],
  ...overrides,
})

const resume = { name: 'My CV', text: 'Ten years of Go.' }
const job = { name: 'Backend role', text: 'Needs Go and Postgres.' }

function serviceFor(model: ReturnType<typeof textModel> | MockLanguageModelV4) {
  const ollama = new OllamaService({ baseURL: 'http://unused', model: 'test-model' }, model)
  const prompts = new PromptService(
    { chat: { v1: 'CHAT' }, score: { v1: 'SCORE-PROMPT' } },
    { chat: 'v1', score: 'v1' },
  )
  return new ScoringService(ollama, prompts)
}

describe('ScoringService.evaluate', () => {
  it('returns the score, band and confidence worked out from the model answer', async () => {
    const evaluation = await serviceFor(textModel(JSON.stringify(modelOutput()))).evaluate({
      resume,
      job,
    })

    expect(evaluation).toMatchObject({
      promptVersion: 'score@v1',
      model: 'test-model',
      // 4.26 is rounded to one decimal
      globalScore: 4.3,
      band: 'good',
      confidence: 'medium',
    })
    expect(evaluation.result.summary).toBe('Strong match.')
    expect(evaluation.result.checks).toEqual(['Confirm pay'])
    expect(evaluation.result.dimensions.cvMatch.score).toBe(5)
    // the score lives at the top level, not duplicated in the stored result
    expect('globalScore' in evaluation.result).toBe(false)
  })

  it('does not take band or confidence from the model', async () => {
    const answer = { ...modelOutput({ globalScore: 2.1 }), band: 'strong', confidence: 'high' }

    const evaluation = await serviceFor(textModel(JSON.stringify(answer))).evaluate({ resume, job })

    expect(evaluation.band).toBe('weak')
    expect(evaluation.confidence).not.toBe('high')
  })

  it('sends the score prompt, the CV and the job as Job #1 to the model', async () => {
    const model = textModel(JSON.stringify(modelOutput()))

    await serviceFor(model).evaluate({ resume, job })

    const system = model.doGenerateCalls[0].prompt.find((m) => m.role === 'system')
    const text = typeof system?.content === 'string' ? system.content : ''
    expect(text.startsWith('SCORE-PROMPT')).toBe(true)
    expect(text).toContain('<resume name="My CV">')
    expect(text).toContain('Ten years of Go.')
    expect(text).toContain('<job number="1" name="Backend role">')
  })

  it('unwraps JSON that the model put in a code fence', async () => {
    const fenced = '```json\n' + JSON.stringify(modelOutput()) + '\n```'

    const evaluation = await serviceFor(textModel(fenced)).evaluate({ resume, job })

    expect(evaluation.globalScore).toBe(4.3)
  })

  it('asks again when the model ignores the structure, then uses the good answer', async () => {
    // the flat, repeated-key shape gemma once returned
    const flat = '{"cvMatch":5,"evidence":"supported","trajectoryFit":5,"globalScore":4.6}'
    const model = sequenceModel([flat, JSON.stringify(modelOutput())])

    const evaluation = await serviceFor(model).evaluate({ resume, job })

    expect(model.doGenerateCalls).toHaveLength(2)
    expect(evaluation.globalScore).toBe(4.3)
  })

  it('gives up after two unusable answers', async () => {
    const model = sequenceModel(['{"nope":true}'])

    const error = await serviceFor(model).evaluate({ resume, job }).catch((e) => e)

    expect(model.doGenerateCalls).toHaveLength(2)
    expect(error).toBeInstanceOf(ScoreError)
  })

  it('does not retry when the model API itself fails', async () => {
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++
        throw new APICallError({ message: 'down', url: 'http://model', requestBodyValues: {}, statusCode: 503, isRetryable: false })
      },
    })

    await serviceFor(model).evaluate({ resume, job }).catch(() => {})

    expect(calls).toBe(1)
  })

  it('throws a ScoreError when the answer does not match the schema', async () => {
    const service = serviceFor(textModel(JSON.stringify(modelOutput({ globalScore: 9 }))))

    const error = await service.evaluate({ resume, job }).catch((e) => e)

    expect(error).toBeInstanceOf(ScoreError)
    expect(error.status).toBe(502)
    expect(error.message).toContain('usable structured result')
  })

  it('throws a ScoreError carrying the status when the model API fails', async () => {
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

    const error = await serviceFor(model).evaluate({ resume, job }).catch((e) => e)

    expect(error).toBeInstanceOf(ScoreError)
    expect(error.message).toContain('401')
  })
})
