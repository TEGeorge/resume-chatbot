import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ChatList } from '@/components/chat-list'
import { ChatPane } from '@/components/chat-pane'
import { TooltipProvider } from '@/components/ui/tooltip'

const queryClient = new QueryClient()

function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="mx-auto flex h-svh max-w-5xl gap-4 p-4">
          <ChatList selectedId={selectedId} onSelect={setSelectedId} />
          <ChatPane chatId={selectedId} />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
