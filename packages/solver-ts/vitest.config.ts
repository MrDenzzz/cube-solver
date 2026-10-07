import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Building the pruning tables is CPU-bound, and CI runs every package's tests at once on a few
    // cores, so the defaults (5 s per test, 10 s per hook) are too tight there.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    experimental: {
      // Node runs these sources natively (type stripping). Vite's module runner would turn every
      // imported constant into a getter call, which made the hot table-building loops 4–5× slower.
      viteModuleRunner: false,
    },
  },
});
