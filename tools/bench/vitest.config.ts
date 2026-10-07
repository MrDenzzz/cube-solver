import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node runs the sources natively; Vite's module runner would slow table building several
    // times (see packages/solver-ts/vitest.config.ts).
    experimental: { viteModuleRunner: false },
  },
});
