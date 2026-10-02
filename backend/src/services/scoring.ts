import { z } from 'zod'
import { buildSystemPrompt } from '../lib/chat-context.js'
import type { OllamaService } from './ollama.js'
import { type PromptService, promptLabel } from './prompts.js'

const Evidence = z.enum(['supported', 'partial', 'unknown'])

const Dimension = z.object({
  score: z.number().int().min(1).max(5),
  evidence: Evidence,
  rationale: z.string(),
})

export const ScoreOutputSchema = z.object({
  postingComplete: z.boolean(),
  dimensions: z.object({
    cvMatch: Dimension,
    trajectoryFit: Dimension,
    comp: Dimension,
    culture: Dimension,
    redFlags: Dimension,
  }),
  globalScore: z.number().min(1).max(5),
  summary: z.string(),
  checks: z.array(z.string()).max(3),
})

export type ScoreOutput = z.infer<typeof ScoreOutputSchema>

export type Band = 'strong' | 'good' | 'decent' | 'weak'
export type Confidence = 'low' | 'medium' | 'high'

export const BANDS: Record<Band, string> = {
  strong: 'Strong match, recommend applying immediately',
  good: 'Good match, worth applying',
  decent: 'Decent but not ideal, apply only if there is a specific reason',
  weak: 'Recommend against applying',
}

export const roundScore = (score: number) => Math.round(Math.min(5, Math.max(1, score)) * 10) / 10

// 4.5+ strong, 4.0-4.4 good, 3.5-3.9 decent, below 3.5 weak
export function bandFor(globalScore: number): Band {
  const score = roundScore(globalScore)
  if (score >= 4.5) return 'strong'
  if (score >= 4.0) return 'good'
  if (score >= 3.5) return 'decent'
  return 'weak'
}

// How well the evidence supports the score (not the chance of getting the job).
//  low:    the posting is too thin to assess, CV match or trajectory evidence is unknown,
//          or at least two dimensions are unknown
//  medium: anything else short of fully supported, or checks are still open
//  high:   every dimension supported and nothing left to check
export function confidenceFor(output: ScoreOutput): Confidence {
  const { dimensions } = output
  const statuses = Object.values(dimensions).map((d) => d.evidence)
  const unknown = statuses.filter((s) => s === 'unknown').length

  if (
    !output.postingComplete ||
    dimensions.cvMatch.evidence === 'unknown' ||
    dimensions.trajectoryFit.evidence === 'unknown' ||
    unknown >= 2
  ) {
    return 'low'
  }
  if (statuses.some((s) => s !== 'supported') || output.checks.length > 0) return 'medium'
  return 'high'
}

// status is the HTTP status the route should return
export class ScoreError extends Error {
  status: 502

  constructor(message: string) {
    super(message)
    this.status = 502
  }
}

interface Doc {
  name: string
  text: string
}

// Everything worth keeping about one scoring run, ready for the route to store
export interface Evaluation {
  // e.g. "score@v1"
  promptVersion: string
  model: string
  // rounded to one decimal, within 1 to 5
  globalScore: number
  band: Band
  confidence: Confidence
  // the rest of the model's answer: dimensions, summary, checks, postingComplete
  result: Omit<ScoreOutput, 'globalScore'>
}

// Asks the model for a score and works out the band and confidence.
export class ScoringService {
  private readonly ollama: OllamaService
  private readonly prompts: PromptService

  constructor(ollama: OllamaService, prompts: PromptService) {
    this.ollama = ollama
    this.prompts = prompts
  }

  // Throws ScoreError if the model fails or returns something unusable
  async evaluate(input: { resume: Doc; job: Doc; signal?: AbortSignal }): Promise<Evaluation> {
    const prompt = this.prompts.get('score')

    let output: ScoreOutput
    try {
      output = await this.ollama.generateObject({
        system: buildSystemPrompt(prompt.text, input.resume, [input.job]),
        prompt: 'Score the job against the CV.',
        schema: ScoreOutputSchema,
        signal: input.signal,
      })
    } catch (error) {
      throw new ScoreError(this.ollama.describeError(error))
    }

    // band and confidence are derived here, never taken from the model
    const { globalScore, ...result } = output
    return {
      promptVersion: promptLabel(prompt),
      model: this.ollama.modelName,
      globalScore: roundScore(globalScore),
      band: bandFor(globalScore),
      confidence: confidenceFor(output),
      result,
    }
  }
}
