import { defineConfig, devices } from '@playwright/test';
import { CAMERA_VIDEOS } from './e2e/cubes.ts';

const PORT = 4173;

// End-to-end tests against the production build, served by Vite's preview server with the same
// cross-origin isolation headers as the real host. They use the installed Chrome rather than a
// downloaded browser, with a fake camera that plays a rendered video of a cube's faces.

const camera = (video: string) => ({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${video}`,
    ],
  },
});
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    channel: 'chrome',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'desktop',
      testIgnore: /camera4/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', ...camera(CAMERA_VIDEOS[3]) },
    },
    {
      name: 'phone',
      testIgnore: /camera4/,
      use: { ...devices['Pixel 7'], channel: 'chrome', ...camera(CAMERA_VIDEOS[3]) },
    },
    {
      // The 4×4×4 scan needs a video of its own, so it runs in a browser of its own.
      name: 'camera-4x4',
      testMatch: /camera4/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', ...camera(CAMERA_VIDEOS[4]) },
    },
  ],
  webServer: {
    command: `pnpm exec vite preview --port ${String(PORT)} --strictPort`,
    port: PORT,
    reuseExistingServer: process.env['CI'] === undefined,
  },
});
