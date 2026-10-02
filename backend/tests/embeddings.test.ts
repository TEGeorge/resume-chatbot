import { APICallError } from 'ai'
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { OllamaService } from '../src/services/ollama.js'
import { EmbeddingService } from '../src/services/embeddings.js'
import { PromptService } from '../src/services/prompts.js'
import { SummaryService } from '../src/services/summaries.js'
import { textModel } from './helpers.js'

const embedder = () =>
  new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: 100,
    doEmbed: async ({ values }) => ({ embeddings: values.map((_, i) => [i, 1, 0]), warnings: [] }),
  })

describe('EmbeddingService', () => {
  it('adds the document and query prefixes that nomic-embed-text expects', async () => {
    const mock = embedder()
    const service = new EmbeddingService({ baseURL: 'http://unused', model: 'nomic-embed-text' }, mock)

    const vectors = await service.embedDocuments(['Go and Kafka', 'React'])
    await service.embedQuery('backend skills')

    expect(vectors).toEqual([[0, 1, 0], [1, 1, 0]])
    expect(mock.doEmbedCalls[0]!.values).toEqual(['search_document: Go and Kafka', 'search_document: React'])
    expect(mock.doEmbedCalls[1]!.values).toEqual(['search_query: backend skills'])
  })

  it('adds no prefix for other models', async () => {
    const mock = embedder()
    const service = new EmbeddingService({ baseURL: 'http://unused', model: 'all-minilm' }, mock)

    await service.embedDocuments(['text'])

    expect(mock.doEmbedCalls[0]!.values).toEqual(['text'])
  })

  it('does not call the model for no texts', async () => {
    const mock = embedder()
    const service = new EmbeddingService({ baseURL: 'http://unused', model: 'nomic-embed-text' }, mock)

    expect(await service.embedDocuments([])).toEqual([])
    expect(mock.doEmbedCalls).toHaveLength(0)
  })
})

describe('SummaryService', () => {
  const prompts = new PromptService(
    { chat: { v1: 'C' }, score: { v1: 'S' }, summary: { v1: 'SUMMARY-PROMPT' } },
    { chat: 'v1', score: 'v1', summary: 'v1' },
  )
  const serviceFor = (model: ConstructorParameters<typeof OllamaService>[1]) =>
    new SummaryService(new OllamaService({ baseURL: 'http://unused', model: 'm' }, model), prompts)

  it('asks the model with the summary prompt and returns tidy text', async () => {
    const model = textModel('  Backend role\nat a payments   company.  ')

    const summary = await serviceFor(model).summarize('Senior Backend Engineer at Northwind. Go and Kafka.')

    expect(summary).toBe('Backend role at a payments company.')
    const call = JSON.stringify(model.doGenerateCalls[0]!.prompt)
    expect(call).toContain('SUMMARY-PROMPT')
    expect(call).toContain('Summarise this job posting')
    expect(call).toContain('Go and Kafka.')
  })

  it('fails when the model fails, instead of making something up', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: 'down', url: 'http://m', requestBodyValues: {}, statusCode: 503, isRetryable: false })
      },
    })

    await expect(serviceFor(model).summarize('A job posting.')).rejects.toThrow()
  })

  it('fails when the model returns nothing', async () => {
    await expect(serviceFor(textModel('   ')).summarize('A posting.')).rejects.toThrow('empty summary')
  })
})
