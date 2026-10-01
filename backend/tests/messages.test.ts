import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  authHeaders,
  createTestApp,
  listen,
  readStream,
  scriptedModel,
  seedChat,
  sendMessage,
  storedMessages,
  waitFor,
} from './helpers.js'

const WORDS = ['One ', 'two ', 'three ', 'four ', 'five ', 'six ']
const FULL_REPLY = WORDS.join('')

describe('POST /chat/:id/messages', () => {
  it('streams the reply and saves both messages', async () => {
    const app = createTestApp(scriptedModel({ words: WORDS }))
    const chatId = await seedChat(app)

    const res = await sendMessage(app, chatId, 'Hello')
    expect(res.status).toBe(200)

    const { text, error } = await readStream(res)
    expect(error).toBeUndefined()
    expect(text).toBe(FULL_REPLY)

    const stored = await waitFor(async () => {
      const rows = await storedMessages(chatId)
      return rows.length === 2 && rows
    })
    expect(stored).toEqual([
      { role: 'user', text: 'Hello' },
      { role: 'assistant', text: FULL_REPLY },
    ])
  })

  it('keeps the part of the reply produced before the browser disconnected', async () => {
    const app = createTestApp(scriptedModel({ words: WORDS, delayMs: 50 }))
    const chatId = await seedChat(app)

    const controller = new AbortController()
    const res = await sendMessage(app, chatId, 'Hello', controller.signal)
    const reader = res.body!.getReader()

    // wait until some of the reply has arrived, then walk away like a closed tab
    let received = ''
    while (!received.includes('text-delta')) {
      const { value, done } = await reader.read()
      if (done) break
      received += new TextDecoder().decode(value)
    }
    controller.abort()
    await reader.cancel().catch(() => {})

    const assistant = await waitFor(async () =>
      (await storedMessages(chatId)).find((m) => m.role === 'assistant'),
    )

    expect(assistant, 'the partial reply should have been saved').toBeDefined()
    expect(assistant!.text.length).toBeGreaterThan(0)
    expect(FULL_REPLY.startsWith(assistant!.text)).toBe(true)
  })

  it('keeps the partial reply when a real HTTP client disconnects', async () => {
    const app = createTestApp(scriptedModel({ words: WORDS, delayMs: 50 }))
    const chatId = await seedChat(app)
    const server = await listen(app)

    try {
      const controller = new AbortController()
      const res = await fetch(`${server.url}/chat/${chatId}/messages`, {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ parts: [{ type: 'text', text: 'Hello' }] }),
        signal: controller.signal,
      })
      const reader = res.body!.getReader()

      let received = ''
      while (!received.includes('text-delta')) {
        const { value, done } = await reader.read()
        if (done) break
        received += new TextDecoder().decode(value)
      }
      controller.abort()

      const assistant = await waitFor(async () =>
        (await storedMessages(chatId)).find((m) => m.role === 'assistant'),
      )

      expect(assistant, 'the partial reply should have been saved').toBeDefined()
      expect(FULL_REPLY.startsWith(assistant!.text)).toBe(true)
    } finally {
      server.close()
    }
  })

  it('saves no reply when the browser disconnects before any text', async () => {
    const app = createTestApp(scriptedModel({ words: WORDS, delayMs: 200 }))
    const chatId = await seedChat(app)

    const controller = new AbortController()
    const res = await sendMessage(app, chatId, 'Hello', controller.signal)
    controller.abort()
    await res.body!.cancel().catch(() => {})

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await storedMessages(chatId)).toEqual([{ role: 'user', text: 'Hello' }])
  })

  it('keeps the text produced before the model failed partway through', async () => {
    const app = createTestApp(scriptedModel({ words: WORDS, failAfter: 3 }))
    const chatId = await seedChat(app)

    const { text, error } = await readStream(await sendMessage(app, chatId, 'Hello'))
    expect(text).toBe('One two three ')
    expect(error).toBeDefined()

    const assistant = await waitFor(async () =>
      (await storedMessages(chatId)).find((m) => m.role === 'assistant'),
    )
    expect(assistant, 'the partial reply should have been saved').toBeDefined()
    expect(assistant!.text).toBe('One two three ')
  })

  it('reports a model failure in the stream and saves no reply', async () => {
    const error = new APICallError({
      message: 'denied',
      url: 'http://model',
      requestBodyValues: {},
      statusCode: 401,
      responseBody: '{"error":"Unauthorized"}',
    })
    const app = createTestApp(scriptedModel({ error }))
    const chatId = await seedChat(app)

    const { text, error: errorText } = await readStream(await sendMessage(app, chatId, 'Hello'))

    expect(text).toBe('')
    expect(errorText).toContain('401')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(await storedMessages(chatId)).toEqual([{ role: 'user', text: 'Hello' }])
  })
})
