import { defineConfig } from 'vitest/config';

// Tests talk to a real PostgreSQL; reuse the server's .env if present.
try {
  process.loadEnvFile('apps/server/.env');
} catch {
  /* DATABASE_URL may come from the environment instead */
}

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/server/test/**/*.test.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
