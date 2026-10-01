import { BriefcaseBusinessIcon, LibraryIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChats, useJobs, useResumes } from '@/lib/queries'
import { hrefFor, type Route } from '@/lib/route'
import { cn } from '@/lib/utils'

interface Props {
  route: Route
  onNewChat: () => void
  // called after any navigation, so a mobile drawer can close
  onNavigate: () => void
}

export function Sidebar({ route, onNewChat, onNavigate }: Props) {
  const chats = useChats()
  const resumes = useResumes()
  const jobs = useJobs()

  const activeChat = route.view === 'chat' ? route.chatId : null

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <BriefcaseBusinessIcon className="size-4" />
        </div>
        <span className="font-semibold tracking-tight">Resume Chatbot</span>
      </div>

      <div className="px-3">
        <Button
          className="w-full justify-start"
          onClick={() => {
            onNewChat()
            onNavigate()
          }}
        >
          <PlusIcon /> New chat
        </Button>
      </div>

      <nav aria-label="Chats" className="mt-5 flex min-h-0 flex-1 flex-col">
        <h2 className="px-4 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Chats</h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {chats.isPending && (
            <div className="flex flex-col gap-2 px-2 pt-1">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {chats.isError && <p className="px-3 text-sm text-destructive">Could not load chats.</p>}
          {chats.data?.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No chats yet. Start one with a resume and a job.</p>
          )}
          <ul className="flex flex-col gap-0.5">
            {chats.data?.map((chat) => (
              <li key={chat.id}>
                <a
                  href={hrefFor({ view: 'chat', chatId: chat.id })}
                  onClick={onNavigate}
                  aria-current={chat.id === activeChat ? 'page' : undefined}
                  className={cn(
                    'block rounded-lg px-3 py-2 transition-colors hover:bg-accent',
                    chat.id === activeChat && 'bg-accent',
                  )}
                >
                  <span className="block truncate text-sm font-medium">{chat.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {chat.resumeName ?? 'No resume'} · {chat.jobs.length} {chat.jobs.length === 1 ? 'job' : 'jobs'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="border-t p-2">
        <a
          href={hrefFor({ view: 'library', tab: 'resumes' })}
          onClick={onNavigate}
          aria-current={route.view === 'library' ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent',
            route.view === 'library' && 'bg-accent',
          )}
        >
          <LibraryIcon className="size-4 text-muted-foreground" />
          <span className="font-medium">Library</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {resumes.data?.length ?? '–'} {resumes.data?.length === 1 ? 'resume' : 'resumes'} · {jobs.data?.length ?? '–'} {jobs.data?.length === 1 ? 'job' : 'jobs'}
          </span>
        </a>
      </div>
    </div>
  )
}
