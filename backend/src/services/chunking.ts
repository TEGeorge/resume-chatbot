// Splits a job posting into pieces that can be embedded and retrieved on their own: one per
// requirement or responsibility. Pure text processing.

export interface Chunk {
  // the section the chunk came from, e.g. "What we are looking for"
  label: string
  // the label followed by the content, which is what gets embedded and shown to the model
  text: string
}

// Longer pieces are split so one chunk stays about one idea
const MAX_CHARS = 900

interface Heading {
  level: number
  title: string
}

interface Block {
  path: string[]
  lines: string[]
}

const JOB_SECTIONS =
  /(responsibilit|requirement|what you|what we|who you|you will|you have|you.ll|about|the role|qualification|nice to have|bonus|benefit|we offer|perks|details|compensation|salary|location|skills|experience)/i

// Sections of a job posting whose plain sentences are individual requirements
const REQUIREMENT_LIKE = /(responsibilit|requirement|what you|what we|who you|you will|you have|you.ll|qualification|nice to have|looking for)/i

const BULLET = /^\s*(?:[-*•–·]|\d+[.)])\s+(.*)$/

const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
function markdownHeading(line: string): Heading | null {
  const match = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
  return match ? { level: match[1]!.length, title: clean(match[2]!) } : null
}

// Splits text into blocks, each under the headings it appears beneath
function toBlocks(text: string, plainHeading: (line: string, next: string | undefined, prev: string | undefined) => string | null) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const firstLine = lines.find((l) => l.trim())
  const firstIsTitle = !!firstLine && markdownHeading(firstLine)?.level === 1
  // "# Name" at the top is the document title, not a section, when real sections follow it
  const titleIsDocument = firstIsTitle && lines.some((l) => (markdownHeading(l)?.level ?? 0) >= 2)

  const blocks: Block[] = [{ path: [], lines: [] }]
  const stack: Array<{ level: number; title: string }> = []

  lines.forEach((line, i) => {
    let heading: Heading | null = null
    const markdown = markdownHeading(line)
    if (markdown) {
      heading = titleIsDocument && markdown.level === 1 ? null : markdown
      if (!heading) {
        blocks[0]!.lines.push(line.replace(/^#+\s*/, ''))
        return
      }
    } else {
      const plain = plainHeading(line, lines.slice(i + 1).find((l) => l.trim()), lines[i - 1])
      if (plain) heading = { level: 2, title: plain }
    }

    if (heading) {
      while (stack.length && stack[stack.length - 1]!.level >= heading.level) stack.pop()
      stack.push(heading)
      blocks.push({ path: stack.map((h) => h.title), lines: [] })
    } else {
      blocks[blocks.length - 1]!.lines.push(line)
    }
  })

  return blocks
}

// Packs paragraphs, then lines, then sentences into pieces of at most MAX_CHARS
function splitLong(body: string): string[] {
  if (body.length <= MAX_CHARS) return [body]
  const pieces: string[] = []
  let current = ''
  const push = () => {
    if (current.trim()) pieces.push(current.trim())
    current = ''
  }
  const units = body
    .split(/\n{2,}/)
    .flatMap((paragraph) => (paragraph.length <= MAX_CHARS ? [paragraph] : paragraph.split('\n')))
    .flatMap((line) => (line.length <= MAX_CHARS ? [line] : line.split(/(?<=[.!?])\s+/)))
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > MAX_CHARS) push()
    current += (current ? '\n' : '') + unit
  }
  push()
  return pieces
}

function toChunks(label: string, body: string): Chunk[] {
  return splitLong(body).map((piece, i) => {
    const l = i === 0 ? label : `${label} (part ${i + 1})`
    return { label: l, text: `${l}\n${piece}` }
  })
}

export class ChunkingService {
  chunkJob(text: string): Chunk[] {
    const plainHeading = (line: string, next: string | undefined, prev: string | undefined) => {
      const trimmed = line.trim().replace(/[:：]$/, '')
      if (!trimmed || trimmed.length > 60 || BULLET.test(line) || /[.!?]$/.test(trimmed)) return null
      if (JOB_SECTIONS.test(trimmed)) return trimmed
      // a short line on its own, followed by a list, is a heading too
      if (trimmed.length <= 50 && (!prev || !prev.trim()) && next && BULLET.test(next)) return trimmed
      return null
    }

    return toBlocks(text, plainHeading).flatMap((block) => {
      const section = block.path.at(-1)
      const lines = block.lines
      const body = lines.join('\n').trim()
      if (!body) return []
      if (!section) return toChunks('Overview', body)

      // list items become one chunk each; wrapped lines belong to the item above
      const items: string[] = []
      const intro: string[] = []
      for (const line of lines) {
        const bullet = line.match(BULLET)
        if (bullet) items.push(bullet[1]!.trim())
        else if (line.trim() && items.length) items[items.length - 1] += ' ' + line.trim()
        else if (line.trim()) intro.push(line.trim())
      }

      if (items.length) {
        const introText = intro.join(' ')
        return [
          ...(introText.length >= 40 ? toChunks(section, introText) : []),
          ...items.flatMap((item) => toChunks(section, item)),
        ]
      }

      // no list: split a requirements-style section into sentences, keep other sections whole
      if (REQUIREMENT_LIKE.test(section)) {
        const sentences = body.split(/(?<=[.;!?])\s+/).map(clean).filter((s) => s.length >= 25)
        if (sentences.length > 1) return sentences.flatMap((s) => toChunks(section, s))
      }
      return toChunks(section, clean(body).length < 400 ? clean(body) : body)
    })
  }
}
