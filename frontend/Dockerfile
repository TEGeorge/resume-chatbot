# Build context: the repository root, because the frontend type-checks the
# backend files it imports types from (src/lib/api.ts), so those need the
# backend source and its dependencies too.
FROM node:24-bookworm
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate

WORKDIR /app/backend
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY backend/ ./

WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# vite preview serves the build and proxies /api to the backend (API_URL),
# using the same proxy settings as the dev server (vite.config.ts)
ENV API_URL=http://backend:3000
EXPOSE 4173
CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
