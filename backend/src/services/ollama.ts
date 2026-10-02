import {
  APICallError,
  convertToModelMessages,
  generateObject,
  generateText,
  NoObjectGeneratedError,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai'
import type { ZodType } from 'zod'
import { createOllama } from 'ollama-ai-provider-v2'
import type { OllamaConfig } from '../config.js'

// Some models wrap JSON in a ```json fence or add a sentence around it even when asked
// for bare JSON (gemma does). Pull the JSON out so it can be parsed.
export function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) return fenced[1]!
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start !== -1 && end > start ? text.slice(start, end + 1) : null
}

export class OllamaService {
  private readonly model: LanguageModel
  private readonly numCtx: number | undefined
  // recorded with stored results so they can be compared across models
  readonly modelName: string

  // `model` is only passed by tests, to script replies without a real Ollama
  constructor(config: OllamaConfig, model?: LanguageModel) {
    this.model =
      model ??
      createOllama({
        baseURL: config.baseURL,
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
      })(config.model)
    this.numCtx = config.numCtx
    this.modelName = config.model
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

  async complete(input: { system: string; prompt: string; signal?: AbortSignal }): Promise<string> {
    const { text } = await generateText({
      model: this.model,
      system: input.system,
      prompt: input.prompt,
      providerOptions: this.numCtx ? { ollama: { options: { num_ctx: this.numCtx } } } : undefined,
      abortSignal: input.signal,
      maxRetries: 1,
    })
    return text
  }

  // One structured answer that must match `schema`. Models that ignore the requested
  // structure are asked again (`attempts` tries in total); other failures are not retried.
  async generateObject<T>(input: {
    system: string
    prompt: string
    schema: ZodType<T>
    signal?: AbortSignal
    attempts?: number
  }): Promise<T> {
    this.warnIfTooLong(input.system, [])
    const attempts = input.attempts ?? 2

    for (let attempt = 1; ; attempt++) {
      try {
        const { object } = await generateObject({
          model: this.model,
          system: input.system,
          prompt: input.prompt,
          schema: input.schema,
          repairText: async ({ text }) => extractJson(text),
          providerOptions: this.numCtx ? { ollama: { options: { num_ctx: this.numCtx } } } : undefined,
          abortSignal: input.signal,
        })
        return object
      } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error) || attempt >= attempts) throw error
        console.warn(`model gave an unusable structured result (try ${attempt} of ${attempts}), retrying`)
      }
    }
  }

  describeError(error: unknown): string {
    console.error('model call failed', error)
    if (NoObjectGeneratedError.isInstance(error)) {
      return 'The model did not return a usable structured result. Try again.'
    }
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
