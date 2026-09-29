import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { api } from '@/lib/api'
import { mockTransport } from '@/lib/mock-transport'

type Chats = Awaited<ReturnType<Awaited<ReturnType<typeof api.chat.$get>>['json']>>

export function ChatPane({ chatId }: { chatId: string | null }) {
  const queryClient = useQueryClient()
  const chat = queryClient
    .getQueryData<Chats>(['chats'])
    ?.find((c) => c.id === chatId)

  return (
    <Card className="min-w-0 flex-1 gap-0">
      <CardHeader className="border-b">
        <CardTitle>{chat?.name ?? 'No chat selected'}</CardTitle>
        <CardDescription>
          {chat
            ? 'Ask about your resume and the jobs you are targeting.'
            : 'Create or pick a chat to get started.'}
        </CardDescription>
      </CardHeader>
      {chatId ? (
        // key resets the conversation when switching chats (messages are in memory only for now)
        <ChatSession key={chatId} chatId={chatId} />
      ) : (
        <CardContent className="flex flex-1 items-center justify-center">
          <ConversationEmptyState
            title="Nothing here yet"
            description="Create a chat from the sidebar."
          />
        </CardContent>
      )}
    </Card>
  )
}

function ChatSession({ chatId }: { chatId: string }) {
  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    transport: mockTransport,
  })

  return (
    <>
      <CardContent className="flex-1 overflow-hidden p-0">
        <Conversation>
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                title="No messages yet"
                description="Send a message to start the conversation."
              />
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, i) =>
                      part.type === 'text' ? (
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </CardContent>
      <CardFooter>
        <PromptInput
          className="w-full"
          onSubmit={({ text }) => {
            if (text.trim()) void sendMessage({ text })
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about your fit for a role…" />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </CardFooter>
    </>
  )
}
