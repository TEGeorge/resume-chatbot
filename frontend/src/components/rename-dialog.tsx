import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/api'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  current: string
  // sends the new name to the API
  save: (name: string) => Promise<Response>
  // runs after a successful save, e.g. to refresh cached lists
  onSaved?: () => void | Promise<void>
}

// Rename anything that has a name: a chat, a resume or a job
export function RenameDialog({ open, onOpenChange, title, current, save, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* mounted only while open, so it starts from the current name every time */}
        <RenameForm
          title={title}
          current={current}
          save={save}
          onSaved={async () => {
            await onSaved?.()
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({
  title,
  current,
  save,
  onSaved,
}: Pick<Props, 'title' | 'current' | 'save'> & { onSaved: () => Promise<void> }) {
  const [name, setName] = useState(current)

  const rename = useMutation({
    mutationFn: async () => {
      const res = await save(name.trim())
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not rename'))
    },
    onSuccess: onSaved,
  })

  const unchanged = name.trim() === current.trim()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && !unchanged) rename.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Choose a name that is easy to recognise.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rename-input">Name</Label>
        <Input
          id="rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>

      {rename.isError && <p className="text-sm text-destructive">{rename.error.message}</p>}

      <DialogFooter>
        <Button type="submit" disabled={!name.trim() || unchanged || rename.isPending}>
          {rename.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
