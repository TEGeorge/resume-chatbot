import type { Prompts } from '../config.js'
import type { ScoreResult } from '../services/scoring.js'
import { escapeAttr, neutralizeClosingTag } from './tags.js'

interface Doc {
  name: string
  text: string
}

interface ChatJob extends Doc {
  // stored fit score for the chat's CV against this job, if one was computed
  score?: ScoreResult | null
}

export type ChatPrompts = Pick<Prompts, 'chat' | 'documents' | 'scores'>

export function buildSystemPrompt(prompts: ChatPrompts, resume: Doc | null, jobs: ChatJob[] = []): string {
  if (!resume && jobs.length === 0) return prompts.chat

  const parts = [prompts.chat, prompts.documents]
  const scored = jobs.some((job) => job.score)
  if (scored) parts.push(prompts.scores)

  if (resume) {
    parts.push(`<resume name="${escapeAttr(resume.name)}">\n${neutralizeClosingTag(resume.text, 'resume')}\n</resume>`)
  }
  jobs.forEach((job, index) => {
    parts.push(
      `<job number="${index + 1}" name="${escapeAttr(job.name)}">\n${neutralizeClosingTag(job.text, 'job')}\n</job>`
    )
  })
  jobs.forEach((job, index) => {
    if (job.score) parts.push(formatScore(index + 1, job.score))
  })

  return parts.join('\n\n')
}

// Compact enough to include for every job in the chat
function formatScore(number: number, s: ScoreResult): string {
  const lines = [
    `Summary: ${s.summary}`,
    `Level: ${s.level}`,
    'Requirements (importance, match):',
    ...s.requirements.map(
      (r) => `- ${r.requirement} (${r.importance}, ${r.match})${r.gap ? `: ${r.gap}` : ''}`,
    ),
  ]
  if (s.gaps.length > 0) {
    lines.push('Gaps:', ...s.gaps.map((g) => `- ${g.requirement}. Risk: ${g.risk} Mitigation: ${g.mitigation}`))
  }
  if (s.confidenceGaps.length > 0) {
    lines.push(`Open questions: ${s.confidenceGaps.join('; ')}`)
  }
  return `<score job="${number}" value="${s.score}" confidence="${s.confidence}">\n${neutralizeClosingTag(lines.join('\n'), 'score')}\n</score>`
}
