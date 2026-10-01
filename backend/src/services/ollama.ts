import { APICallError, convertToModelMessages, streamText, type LanguageModel, type UIMessage } from 'ai'
import { createOllama } from 'ollama-ai-provider-v2'
import type { OllamaConfig } from '../config.js'

export class OllamaService {
  private readonly model: LanguageModel
  private readonly numCtx: number | undefined

  constructor(config: OllamaConfig) {
    const ollama = createOllama({
      baseURL: config.baseURL,
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    })
    this.model = ollama(config.model)
    this.numCtx = config.numCtx
  }

  // Streams a reply to the conversation so far. `onFinish` runs once with the text produced,
  // whether the reply completed or was aborted (stop, closed tab), even if nobody is still
  // reading the response.
  async stream(input: {
    system: string
    history: UIMessage[]
    signal?: AbortSignal
    onFinish?: (reply: { text: string; aborted: boolean }) => void | Promise<void>
  }) {
    this.warnIfTooLong(input.system, input.history)

    let text = ''
    return streamText({
      model: this.model,
      system: input.system,
      messages: await convertToModelMessages(input.history),
      providerOptions: this.numCtx ? { ollama: { options: { num_ctx: this.numCtx } } } : undefined,
      abortSignal: input.signal,
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') text += chunk.text
      },
      onFinish: () => input.onFinish?.({ text, aborted: false }),
      onAbort: () => input.onFinish?.({ text, aborted: true }),
    })
  }

  // Message shown to the user when a stream fails
  describeError(error: unknown): string {
    console.error('chat stream failed', error)
    if (APICallError.isInstance(error)) {
      return `Model request failed (${error.statusCode ?? 'no status'}): ${error.responseBody ?? error.message}`
    }
    return 'The model could not be reached. Check OLLAMA_BASE_URL, OLLAMA_API_KEY and OLLAMA_MODEL.'
  }

  // Ollama truncates prompts longer than num_ctx without saying so
  private warnIfTooLong(system: string, history: UIMessage[]) {
    if (!this.numCtx) return
    const chars = history.reduce(
      (total, m) => total + m.parts.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 0), 0),
      system.length,
    )
    // rough estimate: ~4 characters per token
    const approxTokens = Math.ceil(chars / 4)
    if (approxTokens > this.numCtx) {
      console.warn(
        `prompt is ~${approxTokens} tokens but OLLAMA_NUM_CTX is ${this.numCtx}; Ollama may truncate it`,
      )
    }
  }
}
