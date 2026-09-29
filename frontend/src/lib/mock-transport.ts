import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

// Stand-in until the backend streaming route exists. Streams a canned reply
// word by word. Replace with:
//   new DefaultChatTransport({ api: `/api/chat/${chatId}/messages` })
export const mockTransport: ChatTransport<UIMessage> = {
  async sendMessages({ messages, abortSignal }) {
    const last = messages.at(-1)
    const asked = last?.parts.find((p) => p.type === 'text')?.text ?? ''
    const words = `This is a **mock reply**. The backend is not connected yet, so I can only echo what you asked:\n\n> ${asked}`.split(' ')
    const id = crypto.randomUUID()

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        controller.enqueue({ type: 'start' })
        controller.enqueue({ type: 'text-start', id })
        for (const word of words) {
          if (abortSignal?.aborted) break
          await new Promise((r) => setTimeout(r, 40))
          controller.enqueue({ type: 'text-delta', id, delta: `${word} ` })
        }
        controller.enqueue({ type: 'text-end', id })
        controller.enqueue({ type: 'finish' })
        controller.close()
      },
    })
  },
  async reconnectToStream() {
    return null
  },
}
