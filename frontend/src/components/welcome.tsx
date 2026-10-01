import { BriefcaseBusinessIcon, FileTextIcon, MenuIcon, MessageSquarePlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useJobs, useResumes } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface Props {
  onNewChat: () => void
  onGoToLibrary: () => void
  onOpenSidebar: () => void
}

// Shown when no chat is selected: a short guide to the three steps
export function Welcome({ onNewChat, onGoToLibrary, onOpenSidebar }: Props) {
  const resumes = useResumes()
  const jobs = useJobs()
  const hasCv = !!resumes.data?.length
  const hasJob = !!jobs.data?.length

  const steps = [
    { icon: FileTextIcon, title: 'Add your resume', done: hasCv, text: 'Upload it or paste the text.' },
    { icon: BriefcaseBusinessIcon, title: 'Add job postings', done: hasJob, text: 'One or several to compare.' },
    { icon: MessageSquarePlusIcon, title: 'Start a chat', done: false, text: 'Ask about fit, gaps and interviews.' },
  ]

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Open menu" onClick={onOpenSidebar}>
          <MenuIcon />
        </Button>
        <span className="font-semibold tracking-tight">Resume Chatbot</span>
      </header>

      <div className="grid flex-1 place-items-center overflow-y-auto p-6">
        <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Find out how you fit a role</h1>
            <p className="mt-2 text-muted-foreground">
              Compare your resume with job postings, see where the gaps are, and prepare for the interview.
            </p>
          </div>

          <ol className="grid w-full gap-3 text-left sm:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className={cn('rounded-xl border bg-card p-4', step.done && 'border-primary/40 bg-accent/50')}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <step.icon className="size-4 text-muted-foreground" />
                  <span>
                    {index + 1}. {step.title}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{step.done ? 'Done' : step.text}</p>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap justify-center gap-2">
            {hasCv && hasJob ? (
              <Button onClick={onNewChat}>New chat</Button>
            ) : (
              <Button onClick={onGoToLibrary}>Open the library</Button>
            )}
            {hasCv && hasJob && (
              <Button variant="outline" onClick={onGoToLibrary}>
                Manage library
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
