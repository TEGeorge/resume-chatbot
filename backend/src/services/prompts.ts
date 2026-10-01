import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Prompts the app needs. Each must have an active version in the config.
export const PROMPT_NAMES = ['chat', 'score'] as const
export type PromptName = (typeof PROMPT_NAMES)[number]

export interface Prompt {
  name: PromptName
  version: string
  text: string
}

// name -> version -> text
type Library = Record<string, Record<string, string>>

// A leading <!-- ... --> comment is for people (what changed), not for the model
const stripLeadingComment = (text: string) => text.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim()

export class PromptService {
  private readonly library: Library
  private readonly active: Record<string, string>

  constructor(library: Library, active: Record<string, string>) {
    this.library = Object.fromEntries(
      Object.entries(library).map(([name, versions]) => [
        name,
        Object.fromEntries(
          Object.entries(versions).map(([version, text]) => [version, stripLeadingComment(text)]),
        ),
      ]),
    )
    this.active = active

    for (const name of PROMPT_NAMES) {
      const version = active[name]
      const versions = Object.keys(this.library[name] ?? {})
      if (!version) throw new Error(`No active version configured for prompt "${name}"`)
      if (!versions.includes(version)) {
        throw new Error(
          `Prompt "${name}" has no version "${version}". Available: ${versions.join(', ') || 'none'}`,
        )
      }
    }
  }

  // Reads `<dir>/<name>/<version>.md` for every prompt
  static fromDirectory(dir: string, active: Record<string, string>) {
    const library: Library = {}
    for (const name of PROMPT_NAMES) {
      const folder = join(dir, name)
      const files = readdirSync(folder).filter((file) => file.endsWith('.md'))
      library[name] = Object.fromEntries(
        files.map((file) => [file.slice(0, -3), readFileSync(join(folder, file), 'utf8')]),
      )
    }
    return new PromptService(library, active)
  }

  // The active version of a prompt
  get(name: PromptName): Prompt {
    const version = this.active[name]!
    return { name, version, text: this.library[name]![version]! }
  }

  versions(name: PromptName): string[] {
    return Object.keys(this.library[name] ?? {})
  }
}

// How a reply records which prompt produced it, e.g. "chat@v2"
export const promptLabel = (prompt: Prompt) => `${prompt.name}@${prompt.version}`
