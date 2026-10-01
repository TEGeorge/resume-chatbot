# Career Intelligence Assistant

## Spec

Build a system that analyzes resumes against job descriptions. Upload a resume and multiple job postings, then answer questions about:

- Fit
- Skill gaps
- Experience alignment
- Interview preparation

### Example queries

- "What skills am I missing for this role?"
- "How does my experience align with Job #2?"

## Systems Diagram

[Excalidraw: resume-chatbot](https://excalidraw.com/resume-chatbot)

## Development

Built using Typescript, with React for the frontend and Hono for the backend. SQLite for the database and TBD on the AI provider.

# Frontend

Resume Chatbot: a React chat frontend using Shadcn/UI components, TanStack Query and AI Elements for rapid development.

- **Sidebar:** a **New chat** button, your chats (with the resume and number of jobs each uses), and a link to the library. Each chat has a **…** menu to rename or delete it; deleting a chat removes its messages but keeps its resume and jobs.
- **New chat:** pick a resume and one or more jobs. The order you pick the jobs in is Job #1, Job #2, and so on, which is how you can refer to them in the chat.
- **Chat:** a centered conversation with suggested questions on an empty chat. The **Details** panel on the right shows the chat's resume and jobs, and lets you score each job: a global score out of 5, a band, confidence, the five dimensions with their evidence, things worth checking, and earlier runs. On smaller screens the sidebar and details open as drawers.
- **Library:** add, preview, rename and delete resumes and job postings (upload a file or paste text). A job must be given a name (a resume falls back to its file name). A resume or job that a chat uses cannot be deleted until those chats are deleted.
- **Links:** the address reflects where you are (`#/chat/<id>`, `#/library/resumes`), so refreshing keeps your place and the back button works.

Setup and run (from `frontend/`, with the backend running):

```bash
pnpm install
pnpm dev               # http://localhost:5173
```

The frontend has no credentials of its own. The browser shows its Basic Auth prompt on first use (enter the `BASIC_AUTH_*` values from `backend/.env`) and remembers the login. The Vite dev server proxies `/api/*` to the backend (`http://localhost:3000`, override with `API_URL`) so the browser sees a single origin, which is what lets that prompt and stored login apply to every request. API calls use the typed Hono RPC client in `src/lib/api.ts`.

# Backend

Hono used for a lightweight, edge supported runtime. Using Drizzle for the ORM with SQLite to keep the environment simple, Hono basic auth. Chat replies come from an Ollama API (`ollama-ai-provider-v2` with the Vercel AI SDK).

Setup and run (from `backend/`):

```bash
cp .env.example .env   # Basic Auth credentials and Ollama settings
pnpm install
pnpm dev               # http://localhost:3000
```

Configuration (`backend/.env`):

- `OLLAMA_BASE_URL` (includes the `/api` path), `OLLAMA_MODEL`: required.
- `OLLAMA_API_KEY`: optional, sent as a Bearer token.
- `OLLAMA_NUM_CTX`: optional context window in tokens. Ollama silently truncates prompts longer than its default, and a CV in the prompt makes that easy to hit, so the server logs a warning when the prompt looks too long for this value.

- API docs: Swagger UI at `/swagger`, OpenAPI spec at `/doc`.
- Hono RPC: the frontend can import `AppType` from `backend/src/app.ts`.

### CVs and jobs

Every new chat is created with one CV and one or more job postings from the libraries. Both are uploaded the same way: PDF, DOCX, MD or TXT (max 5 MB), or pasted text. The text is extracted and stored, and only that text reaches the model. CVs are capped at 50,000 characters and job postings at 20,000 each, since several postings share one prompt.

The CV and the jobs go into the system prompt, marked as user-supplied data so that instructions hidden inside them are ignored. Jobs are numbered in the order they were picked, so "Job #2" in a question means the second one chosen (the chat header shows the numbering). Scanned (image-only) PDFs are rejected, so paste the text instead. Documents cannot be edited: upload again to change one. A CV or job that a chat uses cannot be deleted. Chats created before these existed keep working without them.

### Scoring

`POST /scores` with `{ resumeId, jobId }` asks the model to evaluate one job against one CV and stores the result. It returns a global score from 1.0 to 5.0, a rating of five dimensions (CV match, trajectory fit, compensation, culture, red flags), a short summary, and up to three checks that could change the decision. `GET /scores` (filter with `?resumeId=` and `?jobId=`) and `GET /scores/:id` read stored scores. Every run is stored as its own record with the prompt version and model that produced it, so runs can be compared. Deleting a CV or job deletes its scores.

The rules come from [Career Ops](https://github.com/career-ops-hq/career-ops) (MIT). The model returns the dimension scores, an evidence status for each (supported, partial or unknown) and a holistic global score. The server then derives two things in code, so they are consistent:

- **Band:** 4.5+ strong (apply immediately), 4.0-4.4 good (worth applying), 3.5-3.9 decent (apply only with a specific reason), below 3.5 weak (recommend against).
- **Confidence** in the evidence, not the chance of an offer: low if the posting is too thin, CV match or trajectory evidence is unknown, or two or more dimensions are unknown; high only if every dimension is supported and no checks remain; medium otherwise. A posting that says nothing about pay or culture therefore caps confidence at low.

Differences from Career Ops: "North Star alignment" became `trajectoryFit`, judged from the CV's own career path, because this app has no target-role profile. The scoring prompt is versioned like the chat prompt (`backend/prompts/score/`, `PROMPT_SCORE_VERSION` overrides it). `v2` adds an exact JSON example, because `gemma4:31b` sometimes returned a flat object with repeated keys under `v1`; a test checks that the example matches the schema. The server also unwraps JSON that a model puts in a code fence, and asks the model again once if its answer still does not match the structure.

### Prompts

The prompts are versioned. Files live in `backend/prompts/<name>/<version>.md` (currently `chat/v1.md`, `chat/v2.md`, `score/v1.md` and `score/v2.md`), and `backend/config/prompts.json` picks the active version. To change the prompt, add the next version file and point the config at it; old versions stay for comparison and rollback. Set `PROMPT_CHAT_VERSION=v1` in `backend/.env` to try or roll back a version without editing files. The server refuses to start if the configured version does not exist, and every assistant reply is stored with the version that produced it (for example `chat@v2`). `backend/prompts/README.md` describes the document format a prompt can rely on. The v2 prompt borrows its grounding rules from [Career Ops](https://github.com/career-ops-hq/career-ops) (MIT).

## Database

Schema lives in `backend/src/db/schema.ts`. Migrations are Drizzle SQL files in `backend/drizzle/` and are committed.

```bash
pnpm db:generate                     # generate a migration after changing the schema
pnpm db:generate --name add_messages # same, with a custom name: 0001_add_messages.sql
pnpm db:migrate                      # apply pending migrations manually (drizzle-kit)
```

Pending migrations are also applied automatically on server startup, so `pnpm dev` is enough for local work. The database file defaults to `backend/local.db`; set `DATABASE_URL` to change it.


# Deployment

Initially focusing on local environment only, but will attempt to natively support Cloudflare with reasonable abstractions.

# Dev Log

29 Sept: stand up initial chat interface, deciding between a custom chat interface and API design or adopting AI Elements. Driver for this decision is adopting Vercel AI SDK as the base for the AI Chat.
