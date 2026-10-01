import { useChat } from '@ai-sdk/react'
import { useQuery } from '@tanstack/react-query'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { MenuIcon, PanelRightIcon, SparklesIcon } from 'lucide-react'
import { useState } from 'react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input'
import { ContextPanel } from '@/components/context-panel'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useChats } from '@/lib/queries'

interface Props {
  chatId: string
  onOpenSidebar: () => void
}

const CONTEXT_KEY = 'context-panel-open'

// Remembering the panel is a per-viewer convenience, so storage failures are ignored
function readPanelPreference(): boolean {
  try {
    return localStorage.getItem(CONTEXT_KEY) !== 'false'
  } catch {
    return true
  }
}

export function ChatView({ chatId, onOpenSidebar }: Props) {
  const chats = useChats()
  const chat = chats.data?.find((c) => c.id === chatId)

  // wide screens show the panel beside the chat; narrower ones open it as a drawer
  const [panelOpen, setPanelOpen] = useState(readPanelPreference)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const togglePanel = () => {
    if (window.matchMedia('(min-width: 1280px)').matches) {
      const next = !panelOpen
      setPanelOpen(next)
      try {
        localStorage.setItem(CONTEXT_KEY, String(next))
      } catch {
        // not worth failing over
      }
    } else {
      setDrawerOpen(true)
    }
  }

  if (!chat) {
    return (
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title="" subtitle="" onOpenSidebar={onOpenSidebar} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-8">
          {chats.isPending ? (
            <>
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This chat does not exist (it may have been removed).</p>
          )}
        </div>
      </div>
    )
  }

  const context = chat.resumeId ? (
    <ContextPanel resumeId={chat.resumeId} resumeName={chat.resumeName ?? 'Resume'} jobs={chat.jobs} />
  ) : (
    <p className="p-5 text-sm text-muted-foreground">
      This chat was created before resumes and jobs existed, so it has no documents attached.
    </p>
  )

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={chat.name}
          subtitle={`${chat.resumeName ?? 'No resume'} · ${chat.jobs.length} ${chat.jobs.length === 1 ? 'job' : 'jobs'}`}
          onOpenSidebar={onOpenSidebar}
          onTogglePanel={togglePanel}
        />
        {/* key resets the conversation when switching chats */}
        <ChatSession key={chat.id} chatId={chat.id} jobCount={chat.jobs.length} />
      </div>

      {panelOpen && <aside className="hidden w-80 shrink-0 border-l bg-muted/20 xl:block">{context}</aside>}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-sm gap-0 p-0 xl:hidden">
          <SheetHeader className="border-b">
            <SheetTitle>About this chat</SheetTitle>
            <SheetDescription>The resume and jobs it uses, and their scores.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{context}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function Header(props: {
  title: string
  subtitle: string
  onOpenSidebar: () => void
  onTogglePanel?: () => void
}) {
  return (
    <header className="flex items-center gap-2 border-b px-4 py-3">
      <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open menu" onClick={props.onOpenSidebar}>
        <MenuIcon />
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-semibold tracking-tight">{props.title}</h1>
        <p className="truncate text-sm text-muted-foreground">{props.subtitle}</p>
      </div>
      {props.onTogglePanel && (
        <Button variant="ghost" size="sm" onClick={props.onTogglePanel} aria-label="Show chat details">
          <PanelRightIcon /> <span className="hidden sm:inline">Details</span>
        </Button>
      )}
    </header>
  )
}

function ChatSession({ chatId, jobCount }: { chatId: string; jobCount: number }) {
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
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-16 w-2/3 self-end" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (history.isError) {
    return <p className="p-6 text-sm text-destructive">Could not load the messages.</p>
  }

  return <Messages chatId={chatId} initialMessages={history.data} jobCount={jobCount} />
}

function suggestionsFor(jobCount: number): string[] {
  if (jobCount <= 1) {
    return [
      'What skills am I missing for this role?',
      'How does my experience align with this job?',
      'Help me prepare for the interview.',
    ]
  }
  return [
    'What skills am I missing for Job #1?',
    'How does my experience align with Job #2?',
    'Which job is the better fit for me, and why?',
    'Help me prepare for the interview for Job #1.',
  ]
}

function Messages({
  chatId,
  initialMessages,
  jobCount,
}: {
  chatId: string
  initialMessages: UIMessage[]
  jobCount: number
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

  const busy = status === 'submitted' || status === 'streaming'

  return (
    <>
      <div className="min-h-0 flex-1">
        <Conversation className="h-full">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 md:px-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-6 py-10 text-center">
                <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                  <SparklesIcon className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">What would you like to know?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ask about your fit, skill gaps, or interview preparation. Refer to jobs as “Job #1”, “Job #2”.
                  </p>
                </div>
                <div className="flex w-full max-w-md flex-col gap-2">
                  {suggestionsFor(jobCount).map((text) => (
                    <Button
                      key={text}
                      variant="outline"
                      className="h-auto justify-start px-4 py-3 text-left font-normal whitespace-normal"
                      disabled={busy}
                      onClick={() => void sendMessage({ text })}
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, i) =>
                      part.type === 'text' ? <MessageResponse key={i}>{part.text}</MessageResponse> : null,
                    )}
                  </MessageContent>
                </Message>
              ))
            )}

            {status === 'submitted' && (
              <p className="animate-pulse text-sm text-muted-foreground" role="status">
                Thinking…
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
                {error.message}
              </p>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4 md:px-6 md:pb-6">
        <PromptInput
          onSubmit={({ text }) => {
            if (text.trim()) void sendMessage({ text })
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask about your fit, gaps or interview prep…" />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  )
}
