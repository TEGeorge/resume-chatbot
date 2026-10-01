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
