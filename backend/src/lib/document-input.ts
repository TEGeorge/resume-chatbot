import { z } from 'zod'
import { ExtractError, type FileProcessingService } from '../services/file-processing.js'

// Form body shared by the CV and job routes: exactly one of `file` or `text`
export const DocumentFormSchema = z.object({
  file: z.instanceof(File).optional(),
  text: z.string().optional(),
  name: z.string().trim().optional(),
})

export interface DocumentInput {
  name: string
  fileName: string | null
  mimeType: string | null
  text: string
}

// Turns an uploaded file or pasted text into the stored document fields.
// Throws ExtractError (with the HTTP status to return) when the input is unusable.
export async function readDocumentInput(
  files: FileProcessingService,
  form: z.infer<typeof DocumentFormSchema>,
  options: { pastedName: string; maxChars?: number },
): Promise<DocumentInput> {
  // an empty file input is submitted as a zero-byte file, so treat it as absent
  const upload = form.file && form.file.size > 0 ? form.file : undefined
  const pasted = form.text?.trim() ? form.text : undefined

  if (!upload === !pasted) {
    throw new ExtractError('Send exactly one of file or text', 400)
  }

  const text = upload
    ? await files.extractText(upload, { maxChars: options.maxChars })
    : files.normalizeText(pasted!, options.maxChars)

  return {
    name: form.name || (upload ? upload.name.replace(/\.[^.]+$/, '') : options.pastedName),
    fileName: upload?.name ?? null,
    mimeType: upload?.type || null,
    text,
  }
}
