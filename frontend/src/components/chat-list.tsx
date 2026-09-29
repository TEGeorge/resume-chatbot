import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { api } from '@/lib/api'

export function ChatList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')

  const chats = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await api.chat.$get()
      if (!res.ok) throw new Error('Failed to load chats')
      return res.json()
    },
  })

  const createChat = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.chat.$post({ json: { name } })
      if (!res.ok) throw new Error('Failed to create chat')
      return res.json()
    },
    onSuccess: (chat) => {
      setName('')
      onSelect(chat.id)
      return queryClient.invalidateQueries({ queryKey: ['chats'] })
    },
  })

  return (
    <Card className="w-72 shrink-0 gap-0">
      <CardHeader className="border-b">
        <CardTitle>Chats</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2">
        {chats.isPending && (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        )}
        {chats.isError && (
          <p className="p-2 text-sm text-destructive">Could not load chats.</p>
        )}
        {chats.data?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">No chats yet.</p>
        )}
        <ul className="flex flex-col gap-1">
          {chats.data?.map((chat) => (
            <li key={chat.id}>
              <Button
                variant={chat.id === selectedId ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => onSelect(chat.id)}
              >
                <span className="truncate">{chat.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = name.trim()
            if (trimmed) createChat.mutate(trimmed)
          }}
        >
          <InputGroup>
            <InputGroupInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New chat name"
              aria-label="New chat name"
              disabled={createChat.isPending}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                disabled={!name.trim() || createChat.isPending}
              >
                <PlusIcon />
                <span className="sr-only">Create chat</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        {createChat.isError && (
          <p className="text-xs text-destructive">Could not create chat.</p>
        )}
      </CardFooter>
    </Card>
  )
}
