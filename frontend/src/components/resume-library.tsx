import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { api, errorMessage } from '@/lib/api'

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: async () => {
      const res = await api.resumes.$get()
      if (!res.ok) throw new Error('Failed to load CVs')
      return res.json()
    },
  })
}

export function ResumeLibrary() {
  const queryClient = useQueryClient()
  const resumes = useResumes()

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.resumes[':id'].$delete({ param: { id } })
      if (!res.ok) {
        throw new Error(
          res.status === 409 ? 'Used by a chat' : await errorMessage(res, 'Could not delete'),
        )
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resumes'] }),
  })

  return (
    <Card className="max-h-64 shrink-0 gap-0">
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle>CVs</CardTitle>
        <AddResumeDialog />
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-2">
        {resumes.isPending && (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        )}
        {resumes.isError && (
          <p className="p-2 text-sm text-destructive">Could not load CVs.</p>
        )}
        {resumes.data?.length === 0 && (
          <p className="p-2 text-sm text-muted-foreground">
            No CVs yet. Add one to start a chat.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {resumes.data?.map((resume) => (
            <li key={resume.id} className="rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{resume.name}</div>
                  {resume.fileName && (
                    <div className="truncate text-xs text-muted-foreground">{resume.fileName}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${resume.name}`}
                  disabled={remove.isPending && remove.variables === resume.id}
                  onClick={() => remove.mutate(resume.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
              {remove.isError && remove.variables === resume.id && (
                <p className="pl-6 text-xs text-destructive">{remove.error.message}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function AddResumeDialog() {
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
      const res = await api.resumes.$post({
        form: {
          ...(mode === 'file' && file ? { file } : {}),
          ...(mode === 'text' ? { text } : {}),
          ...(name.trim() ? { name: name.trim() } : {}),
        },
      })
      if (!res.ok) throw new Error(await errorMessage(res, 'Could not add CV'))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['resumes'] })
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
        Add CV
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
            <DialogTitle>Add a CV</DialogTitle>
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
                aria-label="CV file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </TabsContent>
            <TabsContent value="text" className="pt-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your CV text here"
                aria-label="CV text"
                className="min-h-40"
              />
            </TabsContent>
          </Tabs>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cv-name">Name (optional)</Label>
            <Input
              id="cv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'file' ? 'Defaults to the file name' : 'Pasted CV'}
            />
          </div>

          {create.isError && <p className="text-sm text-destructive">{create.error.message}</p>}

          <DialogFooter>
            <Button type="submit" disabled={!ready || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add CV'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
