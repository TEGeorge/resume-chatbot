import type { OllamaService } from './ollama.js'
import type { PromptService } from './prompts.js'

const MAX_INPUT_CHARS = 12_000
const MAX_SUMMARY_CHARS = 900

// Writes the short summary of a job posting that stays in every prompt
export class SummaryService {
  private readonly ollama: OllamaService
  private readonly prompts: PromptService

  constructor(ollama: OllamaService, prompts: PromptService) {
    this.ollama = ollama
    this.prompts = prompts
  }

  // Throws if the model fails or returns nothing
  async summarize(text: string, signal?: AbortSignal): Promise<string> {
    const summary = (
      await this.ollama.complete({
        system: this.prompts.get('summary').text,
        prompt: `Summarise this job posting:\n\n${text.slice(0, MAX_INPUT_CHARS)}`,
        signal,
      })
    )
      .replace(/\s+/g, ' ')
      .trim()
    if (!summary) throw new Error('the model returned an empty summary')
    return summary.slice(0, MAX_SUMMARY_CHARS)
  }
}
