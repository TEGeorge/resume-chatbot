import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PROMPT_NAMES } from './services/prompts.js'

export interface OllamaConfig {
  baseURL: string
  model: string
  apiKey?: string
  // context window in tokens; Ollama silently truncates longer prompts
  numCtx?: number
}

export interface EmbeddingConfig {
  baseURL: string
  model: string
  apiKey?: string
}

export interface PromptsConfig {
  dir: string
  // prompt name -> active version
  active: Record<string, string>
}

export interface Config {
  ollama: OllamaConfig
  embeddings: EmbeddingConfig
  prompts: PromptsConfig
}

// backend/ (this file is in src/ when running with tsx and in dist/ once built)
const backendRoot = resolve(import.meta.dirname, '..')

function loadPromptsConfig(env: NodeJS.ProcessEnv): PromptsConfig {
  const file = join(backendRoot, 'config', 'prompts.json')
  let active: Record<string, string>
  try {
    active = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error instanceof Error ? error.message : error}`)
  }
  // PROMPT_<NAME>_VERSION lets a version be tried or rolled back without editing files
  for (const name of PROMPT_NAMES) {
    const override = env[`PROMPT_${name.toUpperCase()}_VERSION`]
    if (override) active = { ...active, [name]: override }
  }
  return { dir: join(backendRoot, 'prompts'), active }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const { OLLAMA_BASE_URL, OLLAMA_MODEL } = env

  if (!OLLAMA_BASE_URL || !OLLAMA_MODEL) {
    throw new Error('OLLAMA_BASE_URL and OLLAMA_MODEL must be set')
  }

  const numCtx = env.OLLAMA_NUM_CTX ? Number(env.OLLAMA_NUM_CTX) : undefined
  if (numCtx !== undefined && !Number.isInteger(numCtx)) {
    throw new Error('OLLAMA_NUM_CTX must be an integer')
  }

  return {
    ollama: {
      baseURL: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      apiKey: env.OLLAMA_API_KEY || undefined,
      numCtx,
    },
    // Ollama's cloud API cannot embed, so embeddings use their own endpoint (a local Ollama by default)
    embeddings: {
      baseURL: env.OLLAMA_EMBED_BASE_URL || 'http://localhost:11434/api',
      model: env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
      apiKey: env.OLLAMA_EMBED_API_KEY || undefined,
    },
    prompts: loadPromptsConfig(env),
  }
}
