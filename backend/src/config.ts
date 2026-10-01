export interface OllamaConfig {
  baseURL: string
  model: string
  apiKey?: string
  // context window in tokens; Ollama silently truncates longer prompts
  numCtx?: number
}

export interface Config {
  auth: { username: string; password: string }
  ollama: OllamaConfig
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
  }
}
