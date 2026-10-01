import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ChatView } from '@/components/chat-view'
import { LibraryView } from '@/components/library-view'
import { NewChatDialog } from '@/components/new-chat-dialog'
import { Sidebar } from '@/components/sidebar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Welcome } from '@/components/welcome'
import { useRoute } from '@/lib/route'

const queryClient = new QueryClient()

function Shell() {
  const [route, navigate] = useRoute()
  const [menuOpen, setMenuOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)
  const openLibrary = () => navigate({ view: 'library', tab: 'resumes' })

  return (
    <div className="flex h-svh bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 border-r bg-muted/30 md:block">
        <Sidebar route={route} onNewChat={() => setNewChatOpen(true)} onNavigate={closeMenu} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-80 max-w-[85vw] gap-0 bg-muted/30 p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Your chats and library.</SheetDescription>
          </SheetHeader>
          <Sidebar route={route} onNewChat={() => setNewChatOpen(true)} onNavigate={closeMenu} />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1">
        {route.view === 'library' ? (
          <LibraryView tab={route.tab} onNavigate={navigate} onOpenSidebar={() => setMenuOpen(true)} />
        ) : route.chatId ? (
          <ChatView chatId={route.chatId} onOpenSidebar={() => setMenuOpen(true)} />
        ) : (
          <Welcome
            onNewChat={() => setNewChatOpen(true)}
            onGoToLibrary={openLibrary}
            onOpenSidebar={() => setMenuOpen(true)}
          />
        )}
      </main>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onCreated={(chatId) => navigate({ view: 'chat', chatId })}
        onGoToLibrary={openLibrary}
      />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
