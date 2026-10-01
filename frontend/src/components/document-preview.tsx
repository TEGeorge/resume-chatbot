import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentText } from '@/lib/queries'

interface Props {
  kind: 'resumes' | 'jobs'
  id: string
  name: string
  // what the trigger button says
  label?: string
  size?: 'sm' | 'xs'
}

// Shows the text the model actually sees for a resume or job
export function DocumentPreview({ kind, id, name, label = 'View text', size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const document = useDocumentText(kind, id, open)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size={size} />}>{label}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>This is the text the assistant reads.</DialogDescription>
        </DialogHeader>
        {document.isPending && <Skeleton className="h-64 w-full" />}
        {document.isError && <p className="text-sm text-destructive">Could not load the text.</p>}
        {document.data && (
          <pre className="max-h-[60vh] overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
            {document.data.text}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  )
}
