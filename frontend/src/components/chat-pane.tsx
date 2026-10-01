import { useChat } from '@ai-sdk/react'
import { useQuery } from '@tanstack/react-query'
import { DefaultChatTransport, type UIMessage } from 'ai'
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
import { JobScores } from '@/components/job-scores'
import { api } from '@/lib/api'
import { useChats } from '@/lib/queries'

export function ChatPane({ chatId }: { chatId: string | null }) {
  const chats = useChats()
  const chat = chats.data?.find((c) => c.id === chatId)

  return (
    <Card className="min-w-0 flex-1 gap-0">
      <CardHeader className="border-b">
        <CardTitle>{chat?.name ?? 'No chat selected'}</CardTitle>
        <CardDescription>
          {chat
            ? chat.resumeName
              ? [
                  `CV: ${chat.resumeName}`,
                  ...chat.jobs.map((job, i) => `Job #${i + 1}: ${job.name}`),
                ].join(' · ')
              : 'Ask about your resume and the jobs you are targeting.'
            : 'Create or pick a chat to get started.'}
        </CardDescription>
        {chat?.resumeId && chat.jobs.length > 0 && (
          <JobScores resumeId={chat.resumeId} jobs={chat.jobs} />
        )}
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
  const history = useQuery({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      const res = await api.chat[':id'].messages.$get({ param: { id: chatId } })
      if (!res.ok) throw new Error('Failed to load messages')
      return (await res.json()) as UIMessage[]
    },
    // history seeds useChat once; live updates come from the stream
    staleTime: Infinity,
    gcTime: 0,
  })

  if (history.isPending) {
    return (
      <CardContent className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </CardContent>
    )
  }
  if (history.isError) {
    return (
      <CardContent className="flex flex-1 items-center justify-center text-sm text-destructive">
        Could not load messages.
      </CardContent>
    )
  }

  return <ChatSessionView chatId={chatId} initialMessages={history.data} />
}

function ChatSessionView({
  chatId,
  initialMessages,
}: {
  chatId: string
  initialMessages: UIMessage[]
}) {
  const { messages, sendMessage, status, stop, error } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/chat/${chatId}/messages`,
      // the server owns the history and the message role/id; send only the new parts
      prepareSendMessagesRequest: ({ messages }) => ({
        body: { parts: messages.at(-1)!.parts },
      }),
    }),
  })

  return (
    <>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <Conversation className="min-h-0">
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
      {error && (
        <p className="px-4 pb-2 text-sm text-destructive">
          Something went wrong sending that message.
        </p>
      )}
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
