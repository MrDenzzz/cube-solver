import { expect, test, type Page } from '@playwright/test';
import { CUBES } from './cubes.ts';

// The fake camera plays a video of a cube's faces brought into the grid one after another, in a
// mixed order and rotation (see global-setup.ts). Nothing is pressed while scanning.

test('scans a 3×3×3 shown in any order and rotation by itself', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect(page.getByRole('group', { name: 'Unfolded cube' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('The state is valid and ready to solve.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cube-solver.stickers'))).toBe(CUBES[3]);
});

/** Makes the first `failures` camera requests fail the way a busy camera does on Windows. */
async function busyCamera(page: Page, failures: number) {
  await page.addInitScript((count) => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let left = count;
    navigator.mediaDevices.getUserMedia = (constraints) => {
      if (left-- > 0) {
        return Promise.reject(new DOMException('Could not start video source', 'NotReadableError'));
      }
      return real(constraints);
    };
  }, failures);
}

const playing = (page: Page) =>
  page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth);

test('falls back to the default camera when the first choice will not start', async ({ page }) => {
  await busyCamera(page, 1);
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect.poll(() => playing(page)).toBeGreaterThan(0);
  await expect(page.getByText(/camera is busy/)).toHaveCount(0);
});

test('explains a busy camera and starts it on request', async ({ page }) => {
  await busyCamera(page, 2);
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect(page.getByText(/The camera is busy or would not start/)).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => playing(page)).toBeGreaterThan(0);
});
