import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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

export type AddForm = { file?: File; text?: string; name?: string }

interface Props {
  // 'resume' or 'job'
  noun: string
  queryKey: 'resumes' | 'jobs'
  // jobs must be named; a resume falls back to the file name
  nameRequired?: boolean
  add: (form: AddForm) => Promise<Response>
}

// Upload a file or paste text to add a resume or job posting
export function AddDocumentDialog({ noun, queryKey, nameRequired = false, add }: Props) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [name, setName] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const res = await add({
        ...(mode === 'file' && file ? { file } : {}),
        ...(mode === 'text' ? { text } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      if (!res.ok) throw new Error(await errorMessage(res, `Could not add the ${noun}`))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] })
      setOpen(false)
    },
  })

  const reset = () => {
    setMode('file')
    setFile(null)
    setText('')
    setName('')
    create.reset()
  }

  const ready = (mode === 'file' ? !!file : !!text.trim()) && (!nameRequired || !!name.trim())

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon /> Add {noun}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
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
              Upload a PDF, DOCX, Markdown or text file (up to 5 MB), or paste the text.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as 'file' | 'text')}>
            <TabsList>
              <TabsTrigger value="file">Upload file</TabsTrigger>
              <TabsTrigger value="text">Paste text</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-3">
              <Input
                type="file"
                accept=".pdf,.docx,.md,.txt"
                aria-label={`${noun} file`}
                onChange={(e) => {
                  const chosen = e.target.files?.[0] ?? null
                  setFile(chosen)
                  // start from the file name; it can be edited
                  if (chosen && !name.trim()) setName(chosen.name.replace(/\.[^.]+$/, ''))
                }}
              />
            </TabsContent>
            <TabsContent value="text" className="pt-3">
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
            <Label htmlFor="document-name">Name{nameRequired ? '' : ' (optional)'}</Label>
            <Input
              id="document-name"
              required={nameRequired}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                nameRequired
                  ? 'e.g. Senior Engineer at Acme'
                  : mode === 'file'
                    ? 'Defaults to the file name'
                    : `Pasted ${noun}`
              }
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
