import { defineConfig } from 'vitest/config';

// Building the pruning tables is CPU-bound, and CI runs every package's tests at once on a few
// cores, so the defaults (5 s per test, 10 s per hook) are too tight there.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
