import mammoth from 'mammoth'
import { extractText as extractPdfText } from 'unpdf'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// status is the HTTP status the route should return
export class ExtractError extends Error {
  status: 400 | 415 | 422

  constructor(message: string, status: 400 | 415 | 422) {
    super(message)
    this.status = status
  }
}

type FileKind = 'pdf' | 'docx' | 'text'

export class FileProcessingService {
  private readonly maxChars: number
  private readonly minPdfChars: number

  constructor(options: { maxChars?: number; minPdfChars?: number } = {}) {
    this.maxChars = options.maxChars ?? 50_000
    this.minPdfChars = options.minPdfChars ?? 50
  }

  normalizeText(raw: string, maxChars = this.maxChars): string {
    return raw
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxChars)
  }

  async extractText(file: File, options: { maxChars?: number } = {}): Promise<string> {
    const kind = this.kindOf(file)
    if (!kind) {
      throw new ExtractError('Unsupported file type. Use PDF, DOCX, MD or TXT.', 415)
    }

    let raw: string
    try {
      raw = await this.read(file, kind)
    } catch {
      throw new ExtractError(`Could not read this ${kind.toUpperCase()} file. It may be corrupt.`, 422)
    }

    const text = this.normalizeText(raw, options.maxChars)
    if (kind === 'pdf' && text.length < this.minPdfChars) {
      throw new ExtractError(
        'No text found in this PDF. It is probably a scanned image, so paste the text instead.',
        422,
      )
    }
    if (!text) throw new ExtractError('No text found in this file.', 422)
    return text
  }

  private kindOf(file: File): FileKind | null {
    const name = file.name.toLowerCase()
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
    if (
      name.endsWith('.docx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'docx'
    }
    if (name.endsWith('.md') || name.endsWith('.txt') || file.type.startsWith('text/')) return 'text'
    return null
  }

  private async read(file: File, kind: FileKind): Promise<string> {
    if (kind === 'pdf') {
      const { text } = await extractPdfText(new Uint8Array(await file.arrayBuffer()), {
        mergePages: true,
      })
      return text
    }
    if (kind === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) })
      return value
    }
    return file.text()
  }
}
