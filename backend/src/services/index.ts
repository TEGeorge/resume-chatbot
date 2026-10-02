import { createMiddleware } from 'hono/factory'
import type { Config } from '../config.js'
import { ChunkingService } from './chunking.js'
import { EmbeddingService } from './embeddings.js'
import { FileProcessingService } from './file-processing.js'
import { OllamaService } from './ollama.js'
import { PromptService } from './prompts.js'
import { RagService } from './rag.js'
import { ScoringService } from './scoring.js'
import { SummaryService } from './summaries.js'

export interface Services {
  ollama: OllamaService
  files: FileProcessingService
  prompts: PromptService
  scoring: ScoringService
  rag: RagService
}

// Env type for `new Hono<AppEnv>()`: makes `c.get('services')` typed in routes
export type AppEnv = { Variables: { services: Services } }

export function createServices(config: Config): Services {
  const ollama = new OllamaService(config.ollama)
  const prompts = PromptService.fromDirectory(config.prompts.dir, config.prompts.active)

  return {
    ollama,
    files: new FileProcessingService(),
    prompts,
    scoring: new ScoringService(ollama, prompts),
    rag: new RagService(new ChunkingService(), new EmbeddingService(config.embeddings), new SummaryService(ollama, prompts)),
  }
}

export const servicesMiddleware = (services: Services) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('services', services)
    await next()
  })
