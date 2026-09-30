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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useResumes } from '@/components/resume-library'
import { api, errorMessage } from '@/lib/api'

export function ChatList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [resumeId, setResumeId] = useState<string | null>(null)
  const resumes = useResumes()

  const chats = useQuery({
    queryKey: ['chats'],
    queryFn: async () => {
      const res = await api.chat.$get()
      if (!res.ok) throw new Error('Failed to load chats')
      return res.json()
    },
  })

  const createChat = useMutation({
    mutationFn: async (input: { name: string; resumeId: string }) => {
      const res = await api.chat.$post({ json: input })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not create chat'))
      return res.json()
    },
    onSuccess: (chat) => {
      setName('')
      onSelect(chat.id)
      return queryClient.invalidateQueries({ queryKey: ['chats'] })
    },
  })

  return (
    <Card className="min-h-0 flex-1 gap-0">
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
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = name.trim()
            if (trimmed && resumeId) createChat.mutate({ name: trimmed, resumeId })
          }}
        >
          <Select
            items={(resumes.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            value={resumeId}
            onValueChange={setResumeId}
            disabled={!resumes.data?.length}
          >
            <SelectTrigger className="w-full" aria-label="CV for this chat">
              <SelectValue placeholder="Choose a CV" />
            </SelectTrigger>
            <SelectContent>
              {resumes.data?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {resumes.data?.length === 0 && (
            <p className="text-xs text-muted-foreground">Add a CV above to start a chat.</p>
          )}
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
                disabled={!name.trim() || !resumeId || createChat.isPending}
              >
                <PlusIcon />
                <span className="sr-only">Create chat</span>
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        {createChat.isError && (
          <p className="text-xs text-destructive">{createChat.error.message}</p>
        )}
      </CardFooter>
    </Card>
  )
}
