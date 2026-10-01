import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OllamaConfig {
  baseURL: string
  model: string
  apiKey?: string
  // context window in tokens; Ollama silently truncates longer prompts
  numCtx?: number
}

// Prompt text lives in backend/prompts/*.md so it can be edited and reviewed as prose
export interface Prompts {
  // chat system prompt
  chat: string
  // how to treat the CV and job documents
  documents: string
  // how to use stored job scores in chat
  scores: string
  // job scoring pass 1 (posting only) and pass 2 (CV against requirements)
  scoreRequirements: string
  scoreMatch: string
}

export interface Config {
  auth: { username: string; password: string }
  ollama: OllamaConfig
  prompts: Prompts
}

// HTML comments (attribution, notes for editors) are stripped so they never reach the model
export function loadPrompts(dir = join(import.meta.dirname, '..', 'prompts')): Prompts {
  const read = (file: string) =>
    readFileSync(join(dir, file), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim()
  return {
    chat: read('chat.md'),
    documents: read('documents.md'),
    scores: read('scores.md'),
    scoreRequirements: read('score-requirements.md'),
    scoreMatch: read('score-match.md'),
  }
}

// Reads and validates the environment once, at startup
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const { BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD, OLLAMA_BASE_URL, OLLAMA_MODEL } = env

  if (!BASIC_AUTH_USERNAME || !BASIC_AUTH_PASSWORD) {
    throw new Error('BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set')
  }
  if (!OLLAMA_BASE_URL || !OLLAMA_MODEL) {
    throw new Error('OLLAMA_BASE_URL and OLLAMA_MODEL must be set')
  }

  const numCtx = env.OLLAMA_NUM_CTX ? Number(env.OLLAMA_NUM_CTX) : undefined
  if (numCtx !== undefined && !Number.isInteger(numCtx)) {
    throw new Error('OLLAMA_NUM_CTX must be an integer')
  }

  return {
    auth: { username: BASIC_AUTH_USERNAME, password: BASIC_AUTH_PASSWORD },
    ollama: {
      baseURL: OLLAMA_BASE_URL,
      model: OLLAMA_MODEL,
      apiKey: env.OLLAMA_API_KEY || undefined,
      numCtx,
    },
    prompts: loadPrompts(env.PROMPTS_DIR || undefined),
  }
}
