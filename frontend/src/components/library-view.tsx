import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BriefcaseBusinessIcon, FileTextIcon, MenuIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { AddDocumentDialog, type AddForm } from '@/components/add-document-dialog'
import { DocumentPreview } from '@/components/document-preview'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { useJobs, useResumes } from '@/lib/queries'
import type { Route } from '@/lib/route'

interface Item {
  id: string
  name: string
  fileName: string | null
  createdAt: string
  preview: string
}

interface ListProps {
  noun: string
  kind: 'resumes' | 'jobs'
  items: Item[] | undefined
  isPending: boolean
  isError: boolean
  emptyText: string
  add: (form: AddForm) => Promise<Response>
  remove: (id: string) => Promise<Response>
}

function DocumentList({ noun, kind, items, isPending, isError, emptyText, add, remove }: ListProps) {
  const queryClient = useQueryClient()
  // delete takes two clicks, so one stray click cannot remove something
  const [confirming, setConfirming] = useState<string | null>(null)

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await remove(id)
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? `A chat uses this ${noun}, so it cannot be deleted.`
            : await errorMessage(res, 'Could not delete'),
        )
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [kind] }),
    onSettled: () => setConfirming(null),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items ? `${items.length} saved` : 'Loading…'}
        </p>
        <AddDocumentDialog noun={noun} queryKey={kind} add={add} />
      </div>

      {isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {isError && <p className="text-sm text-destructive">Could not load the library.</p>}
      {items?.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {items?.map((item) => (
          <li key={item.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                {kind === 'resumes' ? <FileTextIcon className="size-4" /> : <BriefcaseBusinessIcon className="size-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h3 className="truncate font-medium">{item.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {item.fileName ? `${item.fileName} · ` : 'Pasted · '}
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.preview}</p>
                {del.isError && del.variables === item.id && (
                  <p className="mt-2 text-sm text-destructive">{del.error.message}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DocumentPreview kind={kind} id={item.id} name={item.name} />
                {confirming === item.id ? (
                  <>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => del.mutate(item.id)}
                    >
                      {del.isPending ? 'Deleting…' : 'Delete'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => {
                      del.reset()
                      setConfirming(item.id)
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Props {
  tab: 'resumes' | 'jobs'
  onNavigate: (route: Route) => void
  onOpenSidebar: () => void
}

export function LibraryView({ tab, onNavigate, onOpenSidebar }: Props) {
  const resumes = useResumes()
  const jobs = useJobs()

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 md:px-8">
          <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open menu" onClick={onOpenSidebar}>
            <MenuIcon />
          </Button>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Library</h1>
            <p className="text-sm text-muted-foreground">Your resumes and the job postings you want to compare them with.</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
          <Tabs value={tab} onValueChange={(v) => onNavigate({ view: 'library', tab: v as 'resumes' | 'jobs' })}>
            <TabsList>
              <TabsTrigger value="resumes">Resumes{resumes.data ? ` (${resumes.data.length})` : ''}</TabsTrigger>
              <TabsTrigger value="jobs">Jobs{jobs.data ? ` (${jobs.data.length})` : ''}</TabsTrigger>
            </TabsList>
            <TabsContent value="resumes" className="pt-5">
              <DocumentList
                noun="resume"
                kind="resumes"
                items={resumes.data}
                isPending={resumes.isPending}
                isError={resumes.isError}
                emptyText="No resumes yet. Add the resume you want the assistant to compare against jobs."
                add={(form) => api.resumes.$post({ form })}
                remove={(id) => api.resumes[':id'].$delete({ param: { id } })}
              />
            </TabsContent>
            <TabsContent value="jobs" className="pt-5">
              <DocumentList
                noun="job"
                kind="jobs"
                items={jobs.data}
                isPending={jobs.isPending}
                isError={jobs.isError}
                emptyText="No jobs yet. Add a posting you are considering, or several to compare."
                add={(form) => api.jobs.$post({ form })}
                remove={(id) => api.jobs[':id'].$delete({ param: { id } })}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
