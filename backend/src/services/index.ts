import { createMiddleware } from 'hono/factory'
import type { Config } from '../config.js'
import type { ChatPrompts } from '../lib/chat-context.js'
import { FileProcessingService } from './file-processing.js'
import { OllamaService } from './ollama.js'
import { ScoringService } from './scoring.js'

export interface Services {
  ollama: OllamaService
  files: FileProcessingService
  scoring: ScoringService
  // prompt text the chat route builds the system prompt from
  prompts: ChatPrompts
}

// Env type for `new Hono<AppEnv>()`: makes `c.get('services')` typed in routes
export type AppEnv = { Variables: { services: Services } }

export function createServices(config: Config): Services {
  const ollama = new OllamaService(config.ollama)
  return {
    ollama,
    files: new FileProcessingService(),
    scoring: new ScoringService(ollama, config.prompts),
    prompts: config.prompts,
  }
}

// Makes the services available to every route. Swap the object to swap implementations.
export const servicesMiddleware = (services: Services) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('services', services)
    await next()
  })
