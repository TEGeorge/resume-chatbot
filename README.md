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

# Backend

Hono used for a lightweight, edge supported runtime. Using Drizzle for the ORM with SQLite to keep the environment simple, Hono basic auth and TBD on AI provider.

Setup and run (from `backend/`):

```bash
cp .env.example .env   # Basic Auth credentials
pnpm install
pnpm dev               # http://localhost:3000
```

- API docs: Swagger UI at `/swagger`, OpenAPI spec at `/doc`.
- Hono RPC: the frontend can import `AppType` from `backend/src/app.ts`.

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
