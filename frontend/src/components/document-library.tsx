import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileTextIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'

interface DocumentItem {
  id: string
  name: string
  fileName: string | null
}

type AddForm = { file?: File; text?: string; name?: string }

// A list of uploaded documents (CVs, job postings) with an add dialog and delete buttons
export interface DocumentLibraryProps {
  title: string
  // singular, lowercase except for acronyms: 'CV', 'job'
  noun: string
  queryKey: string
  documents: { data?: DocumentItem[]; isPending: boolean; isError: boolean }
  add: (form: AddForm) => Promise<Response>
  remove: (id: string) => Promise<Response>
  className?: string
}

export function DocumentLibrary({
  title,
  noun,
  queryKey,
  documents,
  add,
  remove: removeRequest,
  className,
}: DocumentLibraryProps) {
  const queryClient = useQueryClient()

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await removeRequest(id)
      if (!res.ok) {
        throw new Error(
          res.status === 409 ? 'Used by a chat' : await errorMessage(res, 'Could not delete'),
        )
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [queryKey] }),
  })

  return (
    <Card className={cn('shrink-0 gap-0', className)}>
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle>{title}</CardTitle>
        <AddDialog noun={noun} queryKey={queryKey} add={add} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
        {documents.isPending && (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        )}
        {documents.isError && (
          <p className="p-2 text-sm text-destructive">Could not load {title}.</p>
        )}
        {documents.data?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No {title} yet. Add one to start a chat.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {documents.data?.map((doc) => (
            <li key={doc.id} className="rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{doc.name}</div>
                  {doc.fileName && (
                    <div className="truncate text-xs text-muted-foreground">{doc.fileName}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${doc.name}`}
                  disabled={remove.isPending && remove.variables === doc.id}
                  onClick={() => remove.mutate(doc.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
              {remove.isError && remove.variables === doc.id && (
                <p className="pl-6 text-xs text-destructive">{remove.error.message}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function AddDialog({
  noun,
  queryKey,
  add,
}: Pick<DocumentLibraryProps, 'noun' | 'queryKey' | 'add'>) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [name, setName] = useState('')

  const reset = () => {
    setMode('file')
    setFile(null)
    setText('')
    setName('')
    create.reset()
  }

  const create = useMutation({
    mutationFn: async () => {
      const res = await add({
        ...(mode === 'file' && file ? { file } : {}),
        ...(mode === 'text' ? { text } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      if (!res.ok) throw new Error(await errorMessage(res, `Could not add ${noun}`))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] })
      setOpen(false)
      reset()
    },
  })

  const ready = mode === 'file' ? !!file : !!text.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PlusIcon />
        Add {noun}
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) create.mutate()
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a {noun}</DialogTitle>
            <DialogDescription>
              Upload a PDF, DOCX, Markdown or text file (max 5 MB), or paste the text.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as 'file' | 'text')}>
            <TabsList>
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="text">Paste text</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-2">
              <Input
                type="file"
                accept=".pdf,.docx,.md,.txt"
                aria-label={`${noun} file`}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </TabsContent>
            <TabsContent value="text" className="pt-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Paste the ${noun} text here`}
                aria-label={`${noun} text`}
                className="field-sizing-fixed h-56 resize-none overflow-y-auto"
              />
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cv-name">Name (optional)</Label>
            <Input
              id="cv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'file' ? 'Defaults to the file name' : `Pasted ${noun}`}
            />
          </div>

          {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? 'Adding…' : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
