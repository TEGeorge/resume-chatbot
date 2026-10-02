const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Stop a document from closing its own wrapper tag
const neutralizeClosingTag = (text: string, tag: string) =>
  text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)

interface Doc {
  name: string
  text: string
}

export function buildSystemPrompt(prompt: string, resume: Doc | null, jobs: Doc[] = []): string {
  const parts = [prompt]

  if (resume) {
    parts.push(
      `<resume name="${escapeAttr(resume.name)}">\n${neutralizeClosingTag(resume.text, 'resume')}\n</resume>`,
    )
  }
  jobs.forEach((job, index) => {
    parts.push(
      `<job number="${index + 1}" name="${escapeAttr(job.name)}">\n${neutralizeClosingTag(job.text, 'job')}\n</job>`,
    )
  })

  return parts.join('\n\n')
}

interface RagJob {
  name: string
  summary: string
  excerpts: Array<{ label: string; text: string }>
}

// Neutralise closing tags inside any user-supplied text we wrap
const safe = (text: string) => text.replace(/<\/(resume|job|summary|excerpts)/gi, '<\\/$1')

function ragJobBlock(job: RagJob, number: number): string {
  const excerpts = job.excerpts.map((e) => safe(e.text)).join('\n\n')
  return [
    `<job number="${number}" name="${escapeAttr(job.name)}">`,
    `<summary>${safe(job.summary)}</summary>`,
    `<excerpts>\n${excerpts}\n</excerpts>`,
    `</job>`,
  ].join('\n')
}

export function buildRagSystemPrompt(prompt: string, resume: Doc | null, jobs: RagJob[]): string {
  return [
    prompt,
    resume ? `<resume name="${escapeAttr(resume.name)}">\n${neutralizeClosingTag(resume.text, 'resume')}\n</resume>` : null,
    ...jobs.map((job, index) => ragJobBlock(job, index + 1)),
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n')
}
