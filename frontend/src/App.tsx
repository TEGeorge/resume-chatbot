import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ChatList } from '@/components/chat-list'
import { ChatPane } from '@/components/chat-pane'
import { JobLibrary, ResumeLibrary } from '@/components/libraries'
import { TooltipProvider } from '@/components/ui/tooltip'

const queryClient = new QueryClient()

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="mx-auto flex h-svh max-w-5xl gap-4 p-4">
          <div className="flex min-h-0 w-72 shrink-0 flex-col gap-4">
            <ResumeLibrary />
            <JobLibrary />
            <ChatList selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <ChatPane chatId={selectedId} />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
