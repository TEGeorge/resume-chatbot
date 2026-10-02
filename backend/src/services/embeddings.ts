import { type EmbeddingModel, embedMany } from 'ai'
import { createOllama } from 'ollama-ai-provider-v2'
import type { EmbeddingConfig } from '../config.js'

// Turns text into vectors so passages can be compared by meaning.
// Ollama's cloud API does not serve embedding models, so this talks to its own endpoint
// (a local Ollama by default); see OLLAMA_EMBED_* in the README.
export class EmbeddingService {
  readonly modelName: string
  private readonly model: EmbeddingModel
  // nomic-embed-text is trained with these task prefixes and retrieves better with them
  private readonly documentPrefix: string
  private readonly queryPrefix: string

  // `model` is only passed by tests
  constructor(config: EmbeddingConfig, model?: EmbeddingModel) {
    this.modelName = config.model
    this.model =
      model ??
      createOllama({
        baseURL: config.baseURL,
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      }).embedding(config.model)
    const nomic = config.model.includes('nomic')
    this.documentPrefix = nomic ? 'search_document: ' : ''
    this.queryPrefix = nomic ? 'search_query: ' : ''
  }

  async embedDocuments(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return []
    const { embeddings } = await embedMany({
      model: this.model,
      values: texts.map((t) => this.documentPrefix + t),
      maxRetries: 1,
      abortSignal: signal,
    })
    return embeddings
  }

  async embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
    const { embeddings } = await embedMany({
      model: this.model,
      values: [this.queryPrefix + text],
      maxRetries: 1,
      abortSignal: signal,
    })
    return embeddings[0]!
  }
}
