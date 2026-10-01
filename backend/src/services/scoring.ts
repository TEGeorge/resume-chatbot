import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Prompts } from '../config.js'
import { escapeAttr, neutralizeClosingTag } from '../lib/tags.js'
import type { OllamaService } from './ollama.js'

// Rubric adapted from career-ops (MIT, github.com/career-ops-hq/career-ops); the prompt text is
// in prompts/score-*.md. The rules the model cannot be trusted to follow are enforced here too.

const IMPORTANCE = ['critical', 'high', 'meaningful', 'preferred', 'low_signal'] as const
const TIER = ['stated', 'structural', 'inferred'] as const
const MATCH = ['strong', 'partial', 'missing', 'n/a'] as const
const CONFIDENCE = ['high', 'medium', 'low'] as const

// Requirements kept per job. Every critical and high one is kept even past this.
const MAX_REQUIREMENTS = 12

// Pass 1: the posting only
const RequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      requirement: z.string(),
      importance: z.enum(IMPORTANCE),
      tier: z.enum(TIER),
      jdQuote: z.string().nullable(),
    }),
  ),
  seniority: z.string().nullable(),
})

// Pass 2: the CV against the pass 1 requirements
const MatchSchema = z.object({
  matches: z.array(
    z.object({
      index: z.number().int(),
      match: z.enum(MATCH),
      cvEvidence: z.string().nullable(),
      gap: z.string().nullable(),
    }),
  ),
  gaps: z.array(z.object({ requirement: z.string(), risk: z.string(), mitigation: z.string() })),
  level: z.string(),
  score: z.number(),
  confidence: z.enum(CONFIDENCE),
  confidenceGaps: z.array(z.string()),
  summary: z.string(),
})

export const ScoreResultSchema = z.object({
  score: z.number(),
  verdict: z.enum(['strong', 'apply', 'maybe', 'skip']),
  confidence: z.enum(CONFIDENCE),
  confidenceGaps: z.array(z.string()),
  summary: z.string(),
  seniority: z.string().nullable(),
  level: z.string(),
  // importance descending, then unmet before met
  requirements: z.array(
    z.object({
      requirement: z.string(),
      importance: z.enum(IMPORTANCE),
      tier: z.enum(TIER),
      jdQuote: z.string().nullable(),
      match: z.enum(MATCH),
      cvEvidence: z.string().nullable(),
      gap: z.string().nullable(),
    }),
  ),
  gaps: z.array(z.object({ requirement: z.string(), risk: z.string(), mitigation: z.string() })),
  model: z.string(),
})

export type ScoreResult = z.infer<typeof ScoreResultSchema>
type Requirement = z.infer<typeof RequirementsSchema>['requirements'][number]

interface Doc {
  name: string
  text: string
}

// Case and whitespace insensitive, ignoring bullets and quotes, so a faithful quote still matches
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[•*"'“”‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const quotedIn = (quote: string | null, source: string) =>
  !!quote && normalize(quote).length > 0 && normalize(source).includes(normalize(quote))

const verdictFor = (score: number): ScoreResult['verdict'] =>
  score >= 4.5 ? 'strong' : score >= 4 ? 'apply' : score >= 3.5 ? 'maybe' : 'skip'

export class ScoringService {
  private readonly ollama: OllamaService
  private readonly prompts: Pick<Prompts, 'scoreRequirements' | 'scoreMatch'>
  // Stored with each score: changes when the scoring prompts or the model change
  readonly rubricVersion: string

  constructor(ollama: OllamaService, prompts: Prompts) {
    this.ollama = ollama
    this.prompts = { scoreRequirements: prompts.scoreRequirements, scoreMatch: prompts.scoreMatch }
    this.rubricVersion = createHash('sha256')
      .update([prompts.scoreRequirements, prompts.scoreMatch, ollama.modelName].join('\0'))
      .digest('hex')
      .slice(0, 12)
  }

  async score(resume: Doc, job: Doc): Promise<ScoreResult> {
    const jobTag = `<job name="${escapeAttr(job.name)}">\n${neutralizeClosingTag(job.text, 'job')}\n</job>`

    // Pass 1 never sees the CV, so importance cannot be bent towards what the candidate has
    const extracted = await this.ollama.generateObject({
      system: this.prompts.scoreRequirements,
      prompt: jobTag,
      schema: RequirementsSchema,
    })
    const requirements = selectRequirements(extracted.requirements.map((r) => applyGate(r, job.text)))

    const numbered = requirements
      .map((r, i) => `${i + 1}. [${r.importance}] ${r.requirement}`)
      .join('\n')
    const matched = await this.ollama.generateObject({
      system: this.prompts.scoreMatch,
      prompt: [
        `<resume name="${escapeAttr(resume.name)}">\n${neutralizeClosingTag(resume.text, 'resume')}\n</resume>`,
        jobTag,
        `Requirements:\n${numbered}`,
      ].join('\n\n'),
      schema: MatchSchema,
    })

    const byIndex = new Map(matched.matches.map((m) => [m.index, m]))
    const rows = requirements.map((r, i) => {
      const m = byIndex.get(i + 1)
      if (!m) return { ...r, match: 'missing' as const, cvEvidence: null, gap: 'Not assessed by the model' }
      // A strong match has to quote the CV; an unverifiable quote is at best partial
      const evidenceFound = quotedIn(m.cvEvidence, resume.text)
      return {
        ...r,
        match: m.match === 'strong' && !evidenceFound ? ('partial' as const) : m.match,
        cvEvidence: evidenceFound ? m.cvEvidence : null,
        gap: m.gap,
      }
    })

    const score = Math.round(Math.min(5, Math.max(1, matched.score)) * 10) / 10
    return {
      score,
      verdict: verdictFor(score),
      confidence: matched.confidence,
      confidenceGaps: matched.confidenceGaps.slice(0, 3),
      summary: matched.summary,
      seniority: extracted.seniority,
      level: matched.level,
      requirements: sortRows(rows),
      gaps: matched.gaps,
      model: this.ollama.modelName,
    }
  }
}

// "Stated" needs the posting's own words, and only stated or structural evidence can make a
// requirement critical or high: a guess about the market must not create a blocker.
function applyGate(r: Requirement, jobText: string): Requirement {
  let { tier, jdQuote, importance } = r
  // an unverifiable quote is dropped: structural rows name a section, not a quote
  if (tier === 'stated' && !quotedIn(jdQuote, jobText)) {
    tier = 'structural'
    jdQuote = null
  }
  if (tier === 'inferred') jdQuote = null
  if (tier === 'inferred' && (importance === 'critical' || importance === 'high')) importance = 'meaningful'
  return { ...r, tier, jdQuote, importance }
}

const rank = (importance: Requirement['importance']) => IMPORTANCE.indexOf(importance)

// Keep every critical and high requirement, then fill up to the budget by importance
function selectRequirements(requirements: Requirement[]): Requirement[] {
  const sorted = [...requirements].sort((a, b) => rank(a.importance) - rank(b.importance))
  const mustKeep = sorted.filter((r) => rank(r.importance) <= rank('high')).length
  return sorted.slice(0, Math.max(MAX_REQUIREMENTS, mustKeep))
}

// Importance descending, then unmet before met, so the most important gaps come first
const MATCH_ORDER: Record<(typeof MATCH)[number], number> = { missing: 0, partial: 1, strong: 2, 'n/a': 3 }
function sortRows<T extends { importance: Requirement['importance']; match: (typeof MATCH)[number] }>(rows: T[]) {
  return [...rows].sort(
    (a, b) => rank(a.importance) - rank(b.importance) || MATCH_ORDER[a.match] - MATCH_ORDER[b.match],
  )
}
