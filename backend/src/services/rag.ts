import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { chunks, jobs } from '../db/schema.js'
import type { ChunkingService } from './chunking.js'
import type { EmbeddingService } from './embeddings.js'
import type { SummaryService } from './summaries.js'

// Retrieval over job postings: a posting is split into one chunk per requirement, each chunk is
// embedded and stored in SQLite, and a question pulls back the closest chunks (ranked with
// sqlite-vec). If the embedding or summary model is unavailable, indexing and searching throw a
// RagError.

// status is the HTTP status the route should return
export class RagError extends Error {
  status: 502

  constructor(message: string) {
    super(message)
    this.status = 502
  }
}

// How many chunks to bring back from each job
const JOB_K = 4
// when the question names particular jobs ("Job #2"), those get more and the rest fewer
const MENTIONED_JOB_K = 6
const OTHER_JOB_K = 2

const toBlob = (vector: number[]) => Buffer.from(new Float32Array(vector).buffer)
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

// The database or one of its transactions
type Writer = Pick<typeof db, 'insert' | 'delete'>

// Everything worked out from a posting's text, ready to store
export interface Analysis {
  summary: string
  chunks: Array<{ label: string; text: string; embedding: number[] }>
}

export interface RetrievedJob {
  name: string
  summary: string
  excerpts: Array<{ label: string; text: string }>
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 }

// Which jobs (1-based) the question names: "Job #2", "job 2", "the second job"
export function mentionedJobs(question: string, jobCount: number): Set<number> {
  const found = new Set<number>()
  for (const m of question.matchAll(/\bjob\s*#?\s*(\d+)\b/gi)) found.add(Number(m[1]))
  for (const m of question.matchAll(/\b(first|second|third|fourth|fifth|sixth)\s+job\b/gi)) found.add(ORDINALS[m[1]!.toLowerCase()]!)
  return new Set([...found].filter((n) => n >= 1 && n <= jobCount))
}

export class RagService {
  private readonly chunking: ChunkingService
  private readonly embeddings: EmbeddingService
  private readonly summaries: SummaryService

  constructor(chunking: ChunkingService, embeddings: EmbeddingService, summaries: SummaryService) {
    this.chunking = chunking
    this.embeddings = embeddings
    this.summaries = summaries
  }

  // Splits, embeds and summarises a job posting. Stores nothing, so an upload can run this before
  // saving anything. Throws a RagError if the embedding model or the summary model fails.
  async analyse(text: string, signal?: AbortSignal): Promise<Analysis> {
    const pieces = this.chunking.chunkJob(text)
    try {
      const [vectors, summary] = await Promise.all([
        this.embeddings.embedDocuments(pieces.map((p) => p.text), signal),
        this.summaries.summarize(text, signal),
      ])
      return { summary, chunks: pieces.map((piece, i) => ({ ...piece, embedding: vectors[i]! })) }
    } catch (error) {
      throw new RagError(`Could not index the job: ${describe(error)}`)
    }
  }

  // Replaces a job's stored chunks. Pass a transaction to make it atomic with other writes.
  saveChunks(writer: Writer, jobId: string, analysis: Analysis) {
    writer.delete(chunks).where(and(eq(chunks.sourceType, 'job'), eq(chunks.sourceId, jobId))).run()
    if (analysis.chunks.length === 0) return
    writer
      .insert(chunks)
      .values(
        analysis.chunks.map((piece, position) => ({
          sourceType: 'job' as const,
          sourceId: jobId,
          position,
          label: piece.label,
          text: piece.text,
          model: this.embeddings.modelName,
          embedding: toBlob(piece.embedding),
        })),
      )
      .run()
  }

  deleteChunks(jobId: string) {
    return db.delete(chunks).where(and(eq(chunks.sourceType, 'job'), eq(chunks.sourceId, jobId)))
  }

  // Builds the index and summary of a job that is already saved, replacing any earlier ones.
  // Throws a RagError on failure and leaves the earlier index untouched.
  private async indexJob(jobId: string, signal?: AbortSignal): Promise<{ chunks: number }> {
    const [row] = await db.select({ text: jobs.text }).from(jobs).where(eq(jobs.id, jobId)).limit(1)
    if (!row) throw new Error(`job ${jobId} not found`)

    const analysis = await this.analyse(row.text, signal)
    db.transaction((tx) => {
      this.saveChunks(tx, jobId, analysis)
      tx.update(jobs).set({ summary: analysis.summary }).where(eq(jobs.id, jobId)).run()
    })
    return { chunks: analysis.chunks.length }
  }

  // Indexes a job on first use if it has no chunks for the current embedding model
  private async ensureIndexed(jobId: string, signal?: AbortSignal) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(chunks)
      .where(and(eq(chunks.sourceType, 'job'), eq(chunks.sourceId, jobId), eq(chunks.model, this.embeddings.modelName)))
    if (!row || row.n === 0) await this.indexJob(jobId, signal)
  }

  // The chunks of one job nearest to the question, back in posting order
  private async nearestChunks(jobId: string, query: Buffer, k: number) {
    const distance = sql<number>`vec_distance_cosine(${chunks.embedding}, ${query})`
    const rows = await db
      .select({ position: chunks.position, label: chunks.label, text: chunks.text })
      .from(chunks)
      .where(and(eq(chunks.sourceType, 'job'), eq(chunks.sourceId, jobId), eq(chunks.model, this.embeddings.modelName)))
      .orderBy(distance)
      .limit(k)
    return rows.sort((a, b) => a.position - b.position).map(({ label, text }) => ({ label, text }))
  }

  // For each job (in Job #1, #2, ... order): its summary plus the chunks best matching the question.
  // Indexes jobs that are not indexed yet. Throws a RagError if that or the search fails.
  async retrieveContext(
    input: { jobs: Array<{ id: string; name: string }>; question: string },
    signal?: AbortSignal,
  ): Promise<RetrievedJob[]> {
    if (input.jobs.length === 0) return []
    try {
      await Promise.all(input.jobs.map((job) => this.ensureIndexed(job.id, signal)))

      const query = toBlob(await this.embeddings.embedQuery(input.question, signal))
      const mentioned = mentionedJobs(input.question, input.jobs.length)

      return await Promise.all(
        input.jobs.map(async (job, index): Promise<RetrievedJob> => {
          const k = mentioned.size ? (mentioned.has(index + 1) ? MENTIONED_JOB_K : OTHER_JOB_K) : JOB_K
          const [row] = await db.select({ summary: jobs.summary }).from(jobs).where(eq(jobs.id, job.id)).limit(1)
          return { name: job.name, summary: row?.summary ?? '', excerpts: await this.nearestChunks(job.id, query, k) }
        }),
      )
    } catch (error) {
      if (error instanceof RagError) throw error
      throw new RagError(`Could not search the job postings: ${describe(error)}`)
    }
  }
}
