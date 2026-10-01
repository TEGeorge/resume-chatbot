import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // must be set before src/db/index.ts is imported
    env: { DATABASE_URL: ':memory:' },
  },
})
