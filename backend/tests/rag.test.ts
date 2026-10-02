import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../src/db/index.js'
import { chunks } from '../src/db/schema.js'
import { mentionedJobs, RagError } from '../src/services/rag.js'
import {
  addJob,
  api,
  createTestApp,
  forgetIndex,
  HashEmbeddings,
  makeRag,
  makeSummaries,
  readStream,
  scriptedModel,
  seedChat,
  sendMessage,
  storedMessages,
  systemPromptSent,
  waitFor,
} from './helpers.js'

// Twelve unrelated requirements, so a question about one of them has a clear best match
const TOPICS = [
  'kubernetes helm argocd', 'golang goroutines concurrency', 'postgres replication indexing',
  'kafka streaming consumers', 'terraform modules provisioning', 'react typescript frontend',
  'accessibility wcag audits', 'python pandas notebooks', 'gardening allotment tomatoes',
  'chess tournaments rating', 'photography lenses portraits', 'cycling touring routes',
]
const BIG_JOB = `Platform role\n\nA role about many things.\n\nRequirements\n${TOPICS.map((t) => `- Experience with ${t} in production`).join('\n')}`
const requirements = (prefix: string) =>
  `Role for ${prefix}\n\nRequirements\n` +
  Array.from({ length: 8 }, (_, i) => `- ${prefix} requirement number ${i + 1} about ${prefix}${i}`).join('\n')
// a resume whose last line is easy to look for
const RESUME = '# Sam Test\n\n## Experience\n\nTen years of Go.\n\n## Skills\n\nGo, Kafka.\n\n## Interests\n\nZebra-handling certification and kayaking.'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const chunksOf = (jobId: string) =>
  db.select().from(chunks).where(and(eq(chunks.sourceType, 'job'), eq(chunks.sourceId, jobId))).orderBy(chunks.position)
const names = async (app: ReturnType<typeof createTestApp>, path: string) =>
  ((await (await api(app, path)).json()) as Array<{ name: string }>).map((d) => d.name)

describe('indexing a job on upload', () => {
  it('stores one chunk per requirement with embeddings, and a summary', async () => {
    const app = createTestApp(scriptedModel({}))
    const id = await addJob(app, 'Job', BIG_JOB)

    const rows = await chunksOf(id)
    expect(rows).toHaveLength(13) // overview plus twelve requirements
    expect(rows[0]!.label).toBe('Overview')
    expect(rows.slice(1).every((r) => r.label === 'Requirements')).toBe(true)
    expect(rows.every((r) => r.model === 'test-embed')).toBe(true)
    expect(rows[0]!.embedding.length).toBe(64 * 4) // 64 float32 values

    const listed = (await (await api(app, '/jobs')).json()) as Array<{ id: string; summary: string | null }>
    expect(listed.find((j) => j.id === id)!.summary).toMatch(/^Summary of the job/)
  })

  it('rejects the upload and saves nothing when embeddings are down', async () => {
    const embeddings = new HashEmbeddings()
    embeddings.failing = true
    const app = createTestApp(scriptedModel({}), { embeddings })

    const res = await api(app, '/jobs', { method: 'POST', body: form({ name: 'Rejected job', text: BIG_JOB }) })

    expect(res.status).toBe(502)
    expect(((await res.json()) as { error: string }).error).toContain('Could not index the job')
    expect(await names(app, '/jobs')).not.toContain('Rejected job')
  })

  it('rejects the upload and saves nothing when the summary model is down', async () => {
    const summaries = makeSummaries()
    summaries.failing = true
    const app = createTestApp(scriptedModel({}), { summaries })

    const res = await api(app, '/jobs', { method: 'POST', body: form({ name: 'No summary job', text: BIG_JOB }) })

    expect(res.status).toBe(502)
    expect(await names(app, '/jobs')).not.toContain('No summary job')
  })

  it('removes the chunks when the job is deleted', async () => {
    const app = createTestApp(scriptedModel({}))
    const id = await addJob(app, 'Job', BIG_JOB)
    expect((await chunksOf(id)).length).toBeGreaterThan(0)

    expect((await api(app, `/jobs/${id}`, { method: 'DELETE' })).status).toBe(204)

    expect(await chunksOf(id)).toHaveLength(0)
  })
})

describe('resumes are not indexed', () => {
  it('uploads without touching the embedding or summary models, so they work while those are down', async () => {
    const embeddings = new HashEmbeddings()
    embeddings.failing = true
    const summaries = makeSummaries()
    summaries.failing = true
    const app = createTestApp(scriptedModel({}), { embeddings, summaries })

    const res = await api(app, '/resumes', { method: 'POST', body: form({ name: 'Plain resume', text: RESUME }) })

    expect(res.status).toBe(201)
    expect(embeddings.calls).toBe(0)
    const created = (await res.json()) as Record<string, unknown>
    expect(created).not.toHaveProperty('summary')
    const stored = await db.select().from(chunks).where(eq(chunks.sourceId, created.id as string))
    expect(stored).toHaveLength(0)
  })

})

describe('mentionedJobs', () => {
  it.each([
    ['What about Job #2?', 2, [2]],
    ['compare job 1 and job 2', 2, [1, 2]],
    ['is the second job better', 2, [2]],
    ['Job #5 looks good', 2, []],
    ['what skills am I missing', 2, []],
  ])('%s', (question, jobCount, expected) => {
    expect([...mentionedJobs(question, jobCount as number)].sort()).toEqual(expected)
  })
})

describe('retrieveContext', () => {
  it('brings back the requirements closest to the question, not the whole posting', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const id = await addJob(app, 'Platform', BIG_JOB)

    const [job] = await makeRag(embeddings).retrieveContext({
      jobs: [{ id, name: 'Platform' }],
      question: 'Do they want kubernetes helm argocd experience?',
    })

    expect(job!.excerpts).toHaveLength(4)
    expect(job!.excerpts.some((e) => e.text.includes('argocd'))).toBe(true)
    expect(job!.summary).toMatch(/^Summary of the job/)
  })

  it('returns excerpts in posting order', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const id = await addJob(app, 'Platform', BIG_JOB)

    const [job] = await makeRag(embeddings).retrieveContext({
      jobs: [{ id, name: 'Platform' }],
      question: 'kubernetes golang postgres kafka',
    })

    const positions = job!.excerpts.map((e) => TOPICS.findIndex((t) => e.text.includes(t.split(' ')[0]!)))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('gives more room to the job the question names, and less to the others', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const jobs = [
      { id: await addJob(app, 'First job', requirements('alpha')), name: 'First job' },
      { id: await addJob(app, 'Second job', requirements('beta')), name: 'Second job' },
    ]
    const rag = makeRag(embeddings)

    const named = await rag.retrieveContext({ jobs, question: 'What does Job #2 require?' })
    const unnamed = await rag.retrieveContext({ jobs, question: 'What do the jobs require?' })

    expect(named.map((j) => j.excerpts.length)).toEqual([2, 6])
    expect(unnamed.map((j) => j.excerpts.length)).toEqual([4, 4])
  })

  it('finds the matching requirement inside a job', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const jobs = [
      { id: await addJob(app, 'First job', requirements('alpha')), name: 'First job' },
      { id: await addJob(app, 'Second job', requirements('beta')), name: 'Second job' },
    ]

    const context = await makeRag(embeddings).retrieveContext({ jobs, question: 'something about beta3 for Job #2' })

    expect(context[1]!.excerpts.some((e) => e.text.includes('beta3'))).toBe(true)
  })

  it('indexes jobs saved before retrieval existed, the first time they are needed', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const id = await addJob(app, 'Job', requirements('alpha'))
    await forgetIndex(id)

    const [job] = await makeRag(embeddings).retrieveContext({ jobs: [{ id, name: 'Job' }], question: 'alpha requirement' })

    expect(job!.excerpts.length).toBeGreaterThan(0)
    expect(job!.summary).toMatch(/^Summary of the job/)
    expect(await chunksOf(id)).toHaveLength(9)
  })

  it('throws a RagError when embeddings are unavailable, instead of returning something partial', async () => {
    const embeddings = new HashEmbeddings()
    const app = createTestApp(scriptedModel({}), { embeddings })
    const id = await addJob(app, 'Job', BIG_JOB)
    embeddings.failing = true

    const error = await makeRag(embeddings)
      .retrieveContext({ jobs: [{ id, name: 'Job' }], question: 'kubernetes' })
      .catch((e) => e)

    expect(error).toBeInstanceOf(RagError)
    expect(error.message).toContain('Could not search the job postings')
    expect(error.message).toContain('unreachable')
  })

  it('does nothing for a chat with no jobs', async () => {
    const embeddings = new HashEmbeddings()
    expect(await makeRag(embeddings).retrieveContext({ jobs: [], question: 'anything' })).toEqual([])
    expect(embeddings.calls).toBe(0)
  })
})

describe('the chat prompt', () => {
  const topicsIn = (text: string) => TOPICS.filter((t) => text.includes(t.split(' ')[0]!)).length

  it('has the whole resume, and each job as a summary plus the excerpts for the question', async () => {
    const model = scriptedModel({ words: ['ok '] })
    const app = createTestApp(model)
    const chatId = await seedChat(app, { resume: RESUME, job: BIG_JOB })

    await readStream(await sendMessage(app, chatId, 'Do they want kubernetes helm argocd experience?'))

    const system = systemPromptSent(model)
    expect(system.startsWith('PROMPT-TWO')).toBe(true)
    // the resume is complete, including its very last line
    expect(system).toContain('<resume name="')
    expect(system).toContain(RESUME)
    expect(system).not.toContain('<summary>Summary of the resume')
    // the job is a summary and four excerpts out of twelve requirements
    expect(system).toContain('<job number="1"')
    expect(system).toContain('<summary>Summary of the job')
    expect(system).toContain('<excerpts>')
    expect(system).toContain('argocd')
    expect(topicsIn(system)).toBeLessThanOrEqual(4)
  })

  it('also searches with the previous question, so a short follow-up keeps its topic', async () => {
    const model = scriptedModel({ words: ['ok '] })
    const app = createTestApp(model)
    const chatId = await seedChat(app, { resume: RESUME, job: BIG_JOB })

    await readStream(await sendMessage(app, chatId, 'Do they want kubernetes helm argocd experience?'))
    await waitFor(async () => (await storedMessages(chatId)).length === 2)
    await readStream(await sendMessage(app, chatId, 'and what about the second one?'))

    expect(model.doStreamCalls).toHaveLength(2)
    const followUp = model.doStreamCalls[1]!.prompt.find((m) => m.role === 'system')!.content as string
    expect(followUp).toContain('argocd')
  })

  it('reports an error, calls no model and saves nothing when the job search fails', async () => {
    const embeddings = new HashEmbeddings()
    const model = scriptedModel({ words: ['should ', 'not ', 'appear'] })
    const app = createTestApp(model, { embeddings })
    const chatId = await seedChat(app, { resume: RESUME, job: BIG_JOB })
    embeddings.failing = true

    const { text, error } = await readStream(await sendMessage(app, chatId, 'Tell me about the kubernetes requirement'))

    expect(text).toBe('')
    expect(error).toContain('Could not search the job postings')
    expect(model.doStreamCalls).toHaveLength(0)
    // not even the question is kept, so there is no unanswered message left behind
    expect(await storedMessages(chatId)).toEqual([])
  })

  it('indexes jobs saved before retrieval existed, on the first message', async () => {
    const model = scriptedModel({ words: ['ok '] })
    const app = createTestApp(model)
    const chatId = await seedChat(app, { resume: RESUME, job: BIG_JOB })
    const chat = ((await (await api(app, '/chat')).json()) as Array<any>).find((c) => c.id === chatId)
    await forgetIndex(chat.jobs[0].id)

    await readStream(await sendMessage(app, chatId, 'Do they want kubernetes helm argocd experience?'))

    const system = systemPromptSent(model)
    expect(system).toContain('<excerpts>')
    expect(system).toContain('argocd')
    expect(system).toContain('<summary>Summary of the job')
  })
})
