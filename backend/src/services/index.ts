import { createMiddleware } from 'hono/factory'
import type { Config } from '../config.js'
import { FileProcessingService } from './file-processing.js'
import { OllamaService } from './ollama.js'
import { PromptService } from './prompts.js'

export interface Services {
  ollama: OllamaService
  files: FileProcessingService
  prompts: PromptService
}

// Env type for `new Hono<AppEnv>()`: makes `c.get('services')` typed in routes
export type AppEnv = { Variables: { services: Services } }

export function createServices(config: Config): Services {
  return {
    ollama: new OllamaService(config.ollama),
    files: new FileProcessingService(),
    prompts: PromptService.fromDirectory(config.prompts.dir, config.prompts.active),
  }
}

// Makes the services available to every route. Swap the object to swap implementations.
export const servicesMiddleware = (services: Services) =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('services', services)
    await next()
  })
