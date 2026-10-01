import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'
import { PromptService } from '../src/services/prompts.js'

const ENV = {
  BASIC_AUTH_USERNAME: 'u',
  BASIC_AUTH_PASSWORD: 'p',
  OLLAMA_BASE_URL: 'http://unused',
  OLLAMA_MODEL: 'unused',
}

describe('PromptService', () => {
  const library = { chat: { v1: '<!-- note -->\nOld text', v2: 'New text' } }

  it('returns the active version', () => {
    expect(new PromptService(library, { chat: 'v2' }).get('chat')).toEqual({
      name: 'chat',
      version: 'v2',
      text: 'New text',
    })
  })

  it('strips the leading human-only comment', () => {
    expect(new PromptService(library, { chat: 'v1' }).get('chat').text).toBe('Old text')
  })

  it('lists the available versions', () => {
    expect(new PromptService(library, { chat: 'v2' }).versions('chat')).toEqual(['v1', 'v2'])
  })

  it('refuses to start when the active version does not exist', () => {
    expect(() => new PromptService(library, { chat: 'v9' })).toThrow(
      'Prompt "chat" has no version "v9". Available: v1, v2',
    )
  })

  it('refuses to start when no version is configured', () => {
    expect(() => new PromptService(library, {})).toThrow('No active version configured')
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
      const text = PromptService.fromDirectory(config.prompts.dir, { chat: version }).get('chat').text
      expect(text, version).not.toContain('<!--')
      expect(text, version).toContain('<job number=')
    }
  })

  it('lets PROMPT_CHAT_VERSION override the config', () => {
    const overridden = loadConfig({ ...ENV, PROMPT_CHAT_VERSION: 'v1' })
    expect(overridden.prompts.active.chat).toBe('v1')
    expect(PromptService.fromDirectory(overridden.prompts.dir, overridden.prompts.active).get('chat').version).toBe('v1')
  })
})
