import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration tests share one Mongo replica set and Redis db.
    fileParallelism: false,
    env: { STEPPOOL_DISABLE_QUEUE: '1', REDIS_URL: 'redis://127.0.0.1:6379/9' },
  },
});
