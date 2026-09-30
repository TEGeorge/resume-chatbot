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

Simple React chat frontend, using Shadcn/UI components with Tanstack for rapid development.

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

### CVs

Every new chat is created against a CV from the CV library. Uploads accept PDF, DOCX, MD and TXT (max 5 MB), or pasted text. The text is extracted and stored, and only that text reaches the model. It goes into the system prompt, marked as user-supplied data so that instructions hidden in a CV are ignored. Scanned (image-only) PDFs are rejected, so paste the text instead. CVs cannot be edited: upload again to change one. A CV that a chat uses cannot be deleted. Chats created before CVs existed keep working without one.

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
