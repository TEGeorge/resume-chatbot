import { useQueryClient } from '@tanstack/react-query'
import { EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { RenameDialog } from '@/components/rename-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  chat: { id: string; name: string }
  // runs after the chat is deleted, e.g. to leave its page
  onDeleted: () => void
  className?: string
}

// "..." menu for a chat: rename or delete
export function ChatMenu({ chat, onDeleted, className }: Props) {
  const queryClient = useQueryClient()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Options for ${chat.name}`}
              className={cn(className)}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <PencilIcon /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename chat"
        current={chat.name}
        save={(name) => api.chat[':id'].$patch({ param: { id: chat.id }, json: { name } })}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['chats'] })}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this chat?"
        description={`“${chat.name}” and its messages will be removed. Your resume and jobs are kept.`}
        confirmLabel="Delete chat"
        onConfirm={async () => {
          const res = await api.chat[':id'].$delete({ param: { id: chat.id } })
          if (!res.ok) throw new Error(await errorMessage(res, 'Could not delete the chat'))
          queryClient.setQueryData<Array<{ id: string }>>(['chats'], (old) =>
            old?.filter((c) => c.id !== chat.id),
          )
          queryClient.removeQueries({ queryKey: ['messages', chat.id] })
          void queryClient.invalidateQueries({ queryKey: ['chats'] })
          onDeleted()
        }}
      />
    </>
  )
}
