import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  // does the action; throw to show the message and keep the dialog open
  onConfirm: () => Promise<void>
}

// A "are you sure" step for something that cannot be undone
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Confirm
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onCancel={() => onOpenChange(false)}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function Confirm({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  onDone,
}: Pick<Props, 'title' | 'description' | 'confirmLabel' | 'onConfirm'> & {
  onCancel: () => void
  onDone: () => void
}) {
  const run = useMutation({ mutationFn: onConfirm, onSuccess: onDone })

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {run.isError && <p className="text-sm text-destructive">{run.error.message}</p>}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={run.isPending}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Working…' : confirmLabel}
        </Button>
      </DialogFooter>
    </div>
  )
}
