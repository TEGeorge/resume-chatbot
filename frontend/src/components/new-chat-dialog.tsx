import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { useJobs, useResumes } from '@/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (chatId: string) => void
  onGoToLibrary: () => void
}

export function NewChatDialog({ open, onOpenChange, onCreated, onGoToLibrary }: Props) {
  const queryClient = useQueryClient()
  const resumes = useResumes()
  const jobs = useJobs()

  const [pickedResumeId, setPickedResumeId] = useState<string | null>(null)
  // in the order picked: the first one is "Job #1"
  const [jobIds, setJobIds] = useState<string[]>([])
  const [name, setName] = useState('')

  // with a single resume there is nothing to choose
  const resumeId = pickedResumeId ?? (resumes.data?.length === 1 ? resumes.data[0]!.id : null)

  const pickedJobs = jobIds.flatMap((id) => jobs.data?.find((j) => j.id === id) ?? [])
  const suggestedName = pickedJobs[0]
    ? `${pickedJobs[0].name}${pickedJobs.length > 1 ? ` +${pickedJobs.length - 1}` : ''}`
    : ''

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.chat.$post({
        json: { name: name.trim() || suggestedName, resumeId: resumeId!, jobIds },
      })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not create the chat'))
      return res.json()
    },
    onSuccess: (chat) => {
      // show it in the list immediately, then refresh from the server
      queryClient.setQueryData<(typeof chat)[]>(['chats'], (old) => [chat, ...(old ?? [])])
      void queryClient.invalidateQueries({ queryKey: ['chats'] })
      onOpenChange(false)
      onCreated(chat.id)
    },
  })

  const reset = () => {
    setPickedResumeId(null)
    setJobIds([])
    setName('')
    create.reset()
  }

  const loading = resumes.isPending || jobs.isPending
  const missingDocuments = !loading && (!resumes.data?.length || !jobs.data?.length)
  const ready = !!resumeId && jobIds.length > 0 && !create.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) create.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>New chat</DialogTitle>
            <DialogDescription>Pick the resume and the jobs you want to talk about.</DialogDescription>
          </DialogHeader>

          {loading && <Skeleton className="h-40 w-full" />}

          {missingDocuments && (
            <div className="rounded-xl border border-dashed p-5 text-sm">
              <p className="font-medium">You need a resume and at least one job first.</p>
              <p className="mt-1 text-muted-foreground">
                {resumes.data?.length ? 'Add a job posting' : 'Add your resume'}
                {!resumes.data?.length || !jobs.data?.length ? ' in the library, then come back here.' : ''}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => {
                  onOpenChange(false)
                  onGoToLibrary()
                }}
              >
                Open the library
              </Button>
            </div>
          )}

          {!loading && !!resumes.data?.length && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Resume</legend>
              <RadioGroup value={resumeId ?? ''} onValueChange={setPickedResumeId} className="gap-1.5">
                {resumes.data.map((r) => (
                  <Label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal has-data-checked:border-primary has-data-checked:bg-accent"
                  >
                    <RadioGroupItem value={r.id} />
                    <span className="truncate">{r.name}</span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
          )}

          {!loading && !!jobs.data?.length && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Jobs <span className="font-normal text-muted-foreground">(the order you pick is Job #1, #2, …)</span>
              </legend>
              <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {jobs.data.map((j) => {
                  const position = jobIds.indexOf(j.id)
                  return (
                    <Label
                      key={j.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal has-data-checked:border-primary has-data-checked:bg-accent"
                    >
                      <Checkbox
                        checked={position !== -1}
                        onCheckedChange={(checked) =>
                          setJobIds((ids) => (checked ? [...ids, j.id] : ids.filter((id) => id !== j.id)))
                        }
                      />
                      <span className="truncate">{j.name}</span>
                      {position !== -1 && (
                        <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
                          Job #{position + 1}
                        </span>
                      )}
                    </Label>
                  )
                })}
              </div>
            </fieldset>
          )}

          {!loading && !missingDocuments && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="chat-name">Name (optional)</Label>
              <Input
                id="chat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={suggestedName || 'Named after your first job'}
              />
            </div>
          )}

          {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!ready}>
              {create.isPending ? 'Creating…' : 'Start chat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
