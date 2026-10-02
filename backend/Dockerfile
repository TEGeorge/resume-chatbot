# Build context: backend/
FROM node:24-bookworm AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATABASE_URL=/data/app.db
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# read at runtime: prompt versions, prompt config and migrations
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/config ./config
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "dist/index.js"]
