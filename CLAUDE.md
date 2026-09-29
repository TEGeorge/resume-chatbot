# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Career Intelligence Assistant: upload a resume and multiple job postings, then chat about fit, skill gaps, experience alignment, and interview prep (e.g. "What skills am I missing for this role?", "How does my experience align with Job #2?").

The repo is at an early scaffold stage. Planned stack (from README, not yet implemented): React + Shadcn/UI + TanStack on the frontend; Hono + Drizzle ORM + SQLite + Hono basic auth on the backend; AI provider is TBD. Deployment is local-first, with an intent to support Cloudflare via reasonable abstractions, so avoid Node-only APIs in backend code where a portable alternative exists.

## Layout

Two independent pnpm packages (no root package.json or workspace); run commands from within each directory.

- `backend/`: Hono server on `@hono/node-server`, entry `src/index.ts`, listens on port 3000. ESM (`"type": "module"`).
- `frontend/`: Vite + React 19 + TypeScript app, entry `src/main.tsx`. Split tsconfigs (`tsconfig.app.json` for src, `tsconfig.node.json` for Vite config). Currently still the Vite template.

## Commands

Backend (`cd backend`):
- `pnpm dev`: run with `tsx watch`, loading `backend/.env` (copy `.env.example`; `BASIC_AUTH_USERNAME`/`BASIC_AUTH_PASSWORD` are required at startup)
- `pnpm build`: `tsc` to `dist/`
- `pnpm start`: `node --env-file=.env dist/index.js`
- `pnpm db:generate`: generate a Drizzle migration into `drizzle/` after editing `src/db/schema.ts` (commit the SQL); name it with `pnpm db:generate --name <name>` instead of the random default. Never rename a migration file by hand without also updating `drizzle/meta/_journal.json`
- `pnpm db:migrate`: apply migrations manually; the server also runs pending migrations on startup (`runMigrations()` in `src/index.ts`)

Messages: `GET /chat/:id/messages` returns history as AI SDK `UIMessage[]` (parts stored as JSON in the `messages` table); `POST /chat/:id/messages` takes `{ parts }` only (role is always `user`, the server assigns the id), saves the user message, and streams the reply as the AI SDK UI message stream over SSE (`src/routes/messages.ts`). There is no AI provider yet: the reply is a static string, so replace the `execute` body in that route when a provider is chosen. `PORT` env overrides 3000 (handy for tests alongside a running dev server).

Backend routes are plain Hono with `hono-openapi` (`describeRoute`, `validator`, zod schemas), which yields the spec at `/doc`, Swagger UI at `/swagger`, and the `AppType` export in `src/app.ts` for Hono RPC.

Frontend (`cd frontend`):
- `pnpm dev`: Vite dev server; proxies `/api/*` to the backend and injects Basic Auth from `frontend/.env` (copy `.env.example`). API calls go through the typed Hono RPC client in `src/lib/api.ts`, which imports `AppType` from `backend/src/app.ts`, so keep `hono` at the same version in both packages or the types break.
- Chat UI uses the Vercel AI SDK (`useChat` from `@ai-sdk/react`) with AI Elements components in `src/components/ai-elements/` (add more with `pnpm dlx ai-elements@latest add <name>`; don't pass `-y`, it is read as a component name). `chat-pane.tsx` loads history from `GET /chat/:id/messages`, then streams with `DefaultChatTransport`, sending only the new message's `parts` (the server owns history, role and ids). `ai-elements/prompt-input.tsx` was patched by hand for Base UI (Radix `onSelect`/hover-card delay props); re-apply if regenerated.
- Add UI components with `pnpm dlx shadcn@latest add <name>` (style `base-nova`, Base UI primitives, alias `@/`).
- `pnpm build`: `tsc -b && vite build`
- `pnpm lint`: `oxlint` (config in `.oxlintrc.json`)
- `pnpm preview`

No test framework is configured yet. Note `backend/README.md` says `npm`, but the lockfiles are pnpm.
