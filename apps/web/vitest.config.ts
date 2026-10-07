import { defineConfig } from 'vitest/config';

// Tests cover plain TypeScript modules, which Node runs natively. Vite's module runner would turn
// every imported constant into a getter call and slow the solvers' table building several times.
export default defineConfig({
  test: {
    // e2e/ holds Playwright's tests, run against a build by `pnpm e2e`.
    include: ['src/**/*.test.ts'],
    experimental: { viteModuleRunner: false },
  },
});
