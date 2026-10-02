import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { ScoreOutputSchema } from '../src/services/scoring.js'
import { PromptService } from '../src/services/prompts.js'

const ENV = {
  OLLAMA_BASE_URL: 'http://unused',
  OLLAMA_MODEL: 'unused',
}

describe('PromptService', () => {
  const library = { chat: { v1: '<!-- note -->\nOld text', v2: 'New text' }, score: { v1: 'Score text' }, summary: { v1: 'Summary text' } }

  it('returns the active version', () => {
    expect(new PromptService(library, { chat: 'v2', score: 'v1', summary: 'v1' }).get('chat')).toEqual({
      name: 'chat',
      version: 'v2',
      text: 'New text',
    })
  })

  it('strips the leading human-only comment', () => {
    expect(new PromptService(library, { chat: 'v1', score: 'v1', summary: 'v1' }).get('chat').text).toBe('Old text')
  })

  it('lists the available versions', () => {
    expect(new PromptService(library, { chat: 'v2', score: 'v1', summary: 'v1' }).versions('chat')).toEqual(['v1', 'v2'])
  })

  it('refuses to start when the active version does not exist', () => {
    expect(() => new PromptService(library, { chat: 'v9', score: 'v1', summary: 'v1' })).toThrow(
      'Prompt "chat" has no version "v9". Available: v1, v2',
    )
  })

  it('refuses to start when no version is configured', () => {
    expect(() => new PromptService(library, { score: 'v1', summary: 'v1' })).toThrow('No active version configured')
  })
})

// Guards the files that ship in backend/prompts and backend/config
describe('shipped prompts', () => {
  const config = loadConfig(ENV)
  const service = PromptService.fromDirectory(config.prompts.dir, config.prompts.active)

  it('loads and the config points at a real version', () => {
    const chat = service.get('chat')
    expect(service.versions('chat')).toContain(chat.version)
    expect(chat.text.length).toBeGreaterThan(200)
  })

  it('every version is non-empty, has no comment left in, and matches the document format', () => {
    for (const version of service.versions('chat')) {
      const text = PromptService.fromDirectory(config.prompts.dir, { ...config.prompts.active, chat: version }).get('chat').text
      expect(text, version).not.toContain('<!--')
      expect(text, version).toContain('<job number=')
    }
  })

  it('every score version names the fields the scoring schema expects', () => {
    for (const version of service.versions('score')) {
      const text = PromptService.fromDirectory(config.prompts.dir, { ...config.prompts.active, score: version }).get('score').text
      for (const field of ['cvMatch', 'trajectoryFit', 'comp', 'culture', 'redFlags', 'globalScore', 'postingComplete', 'checks']) {
        expect(text, `${version} mentions ${field}`).toContain(field)
      }
    }
  })

  it('the active score prompt shows an example that matches the scoring schema', () => {
    const text = service.get('score').text
    const example = text.match(/```json\s*([\s\S]*?)```/)?.[1]
    expect(example, 'the active score prompt should contain a ```json example').toBeDefined()

    const parsed = ScoreOutputSchema.safeParse(JSON.parse(example!))
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true)
  })

  it('lets PROMPT_SCORE_VERSION override the config', () => {
    expect(loadConfig({ ...ENV, PROMPT_SCORE_VERSION: 'v7' }).prompts.active.score).toBe('v7')
  })

  it('lets PROMPT_CHAT_VERSION override the config', () => {
    const overridden = loadConfig({ ...ENV, PROMPT_CHAT_VERSION: 'v1' })
    expect(overridden.prompts.active.chat).toBe('v1')
    expect(PromptService.fromDirectory(overridden.prompts.dir, overridden.prompts.active).get('chat').version).toBe('v1')
  })
})
