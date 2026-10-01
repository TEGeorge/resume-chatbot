import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../src/db/index.js'
import { chatJobs, messages } from '../src/db/schema.js'
import {
  api,
  createTestApp,
  readStream,
  scriptedModel,
  seedChat,
  seedDocuments,
  sendMessage,
  waitFor,
  storedMessages,
} from './helpers.js'

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const app = () => createTestApp(scriptedModel({ words: ['Hi '] }))

describe('a job needs a name', () => {
  const addJob = (a: ReturnType<typeof app>, fields: Record<string, string | File>) => {
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return api(a, '/jobs', { method: 'POST', body: form })
  }

  it('rejects pasted text without a name', async () => {
    expect((await addJob(app(), { text: 'Backend role' })).status).toBe(400)
  })

  it('rejects a blank name', async () => {
    expect((await addJob(app(), { text: 'Backend role', name: '   ' })).status).toBe(400)
  })

  it('rejects an uploaded file without a name', async () => {
    const file = new File(['Backend role'], 'posting.txt', { type: 'text/plain' })
    expect((await addJob(app(), { file })).status).toBe(400)
  })

  it('accepts a job with a name, for text and for a file', async () => {
    const a = app()
    const file = new File(['Backend role'], 'posting.txt', { type: 'text/plain' })

    const pasted = await addJob(a, { text: 'Backend role', name: ' Acme ' })
    const uploaded = await addJob(a, { file, name: 'Globex' })

    expect(pasted.status).toBe(201)
    expect(((await pasted.json()) as { name: string }).name).toBe('Acme')
    expect(uploaded.status).toBe(201)
    expect(((await uploaded.json()) as { name: string }).name).toBe('Globex')
  })

  it('still lets a resume go without a name', async () => {
    const form = new FormData()
    form.set('text', 'Ten years of Go.')
    const res = await api(app(), '/resumes', { method: 'POST', body: form })

    expect(res.status).toBe(201)
    expect(((await res.json()) as { name: string }).name).toBe('Pasted resume')
  })
})

describe.each([
  ['resumes', 'resumeId'],
  ['jobs', 'jobId'],
] as const)('renaming a %s', (path, idKey) => {
  it('changes the name and trims it, leaving the text alone', async () => {
    const a = app()
    const ids = await seedDocuments(a)
    const id = ids[idKey]

    const res = await api(a, `/${path}/${id}`, json('PATCH', { name: '  Renamed  ' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id, name: 'Renamed' })
    const full = (await (await api(a, `/${path}/${id}`)).json()) as { name: string; text: string }
    expect(full.name).toBe('Renamed')
    expect(full.text.length).toBeGreaterThan(0)
  })

  it('rejects an empty name and an unknown id', async () => {
    const a = app()
    const ids = await seedDocuments(a)

    expect((await api(a, `/${path}/${ids[idKey]}`, json('PATCH', { name: '   ' }))).status).toBe(400)
    expect((await api(a, `/${path}/nope`, json('PATCH', { name: 'Fine' }))).status).toBe(404)
  })

  it('shows the new name in chats that use it', async () => {
    const a = app()
    const chatId = await seedChat(a)
    const chats = (await (await api(a, '/chat')).json()) as Array<any>
    const chat = chats.find((c) => c.id === chatId)
    const id = path === 'resumes' ? chat.resumeId : chat.jobs[0].id

    await api(a, `/${path}/${id}`, json('PATCH', { name: 'Shiny new name' }))

    const after = ((await (await api(a, '/chat')).json()) as Array<any>).find((c) => c.id === chatId)
    expect(path === 'resumes' ? after.resumeName : after.jobs[0].name).toBe('Shiny new name')
  })
})

describe('renaming a chat', () => {
  it('changes only its name', async () => {
    const a = app()
    const chatId = await seedChat(a)

    const res = await api(a, `/chat/${chatId}`, json('PATCH', { name: ' My new chat ' }))

    expect(res.status).toBe(200)
    const chat = (await res.json()) as any
    expect(chat.name).toBe('My new chat')
    expect(chat.resumeName).toBeTruthy()
    expect(chat.jobs).toHaveLength(1)
  })

  it('rejects an empty name and an unknown chat', async () => {
    const a = app()
    const chatId = await seedChat(a)

    expect((await api(a, `/chat/${chatId}`, json('PATCH', { name: '' }))).status).toBe(400)
    expect((await api(a, '/chat/nope', json('PATCH', { name: 'Fine' }))).status).toBe(404)
  })
})

describe('deleting a chat', () => {
  it('removes the chat, its messages and its job links', async () => {
    const a = app()
    const chatId = await seedChat(a)
    await readStream(await sendMessage(a, chatId, 'Hello'))
    await waitFor(async () => (await storedMessages(chatId)).length === 2)

    const res = await api(a, `/chat/${chatId}`, { method: 'DELETE' })

    expect(res.status).toBe(204)
    const remaining = (await (await api(a, '/chat')).json()) as Array<{ id: string }>
    expect(remaining.find((c) => c.id === chatId)).toBeUndefined()
    expect((await api(a, `/chat/${chatId}/messages`)).status).toBe(404)
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toEqual([])
    expect(await db.select().from(chatJobs).where(eq(chatJobs.chatId, chatId))).toEqual([])
  })

  it('leaves other chats alone', async () => {
    const a = app()
    const keep = await seedChat(a)
    const drop = await seedChat(a)

    await api(a, `/chat/${drop}`, { method: 'DELETE' })

    const ids = ((await (await api(a, '/chat')).json()) as Array<{ id: string }>).map((c) => c.id)
    expect(ids).toContain(keep)
    expect(ids).not.toContain(drop)
  })

  it('keeps the resume and job, and frees them to be deleted', async () => {
    const a = app()
    const chatId = await seedChat(a)
    const chat = ((await (await api(a, '/chat')).json()) as Array<any>).find((c) => c.id === chatId)
    const jobId = chat.jobs[0].id

    // in use while the chat exists
    expect((await api(a, `/jobs/${jobId}`, { method: 'DELETE' })).status).toBe(409)
    expect((await api(a, `/resumes/${chat.resumeId}`, { method: 'DELETE' })).status).toBe(409)

    await api(a, `/chat/${chatId}`, { method: 'DELETE' })

    expect((await api(a, `/jobs/${jobId}`)).status).toBe(200)
    expect((await api(a, `/jobs/${jobId}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(a, `/resumes/${chat.resumeId}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('returns 404 for an unknown chat', async () => {
    expect((await api(app(), '/chat/nope', { method: 'DELETE' })).status).toBe(404)
  })
})
