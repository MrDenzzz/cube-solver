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

/** Makes every camera request fail the way a busy camera does on Windows, until freed. */
async function busyCamera(page: Page) {
  await page.addInitScript(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const flags = window as unknown as { cameraBusy: boolean };
    flags.cameraBusy = true;
    navigator.mediaDevices.getUserMedia = (constraints) =>
      flags.cameraBusy
        ? Promise.reject(new DOMException('Could not start video source', 'NotReadableError'))
        : real(constraints);
  });
}

const playing = (page: Page) =>
  page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth);

test('falls back to the default camera when the picked one is gone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cube-solver.camera', 'a-camera-unplugged-since');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect.poll(() => playing(page)).toBeGreaterThan(0);
});

test('explains a busy camera and starts it on request', async ({ page }) => {
  await busyCamera(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect(page.getByText(/The camera is busy or would not start/)).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { cameraBusy: boolean }).cameraBusy = false;
  });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => playing(page)).toBeGreaterThan(0);
});

test('says so when the camera sends no picture, and starts again on request', async ({ page }) => {
  // The first camera opened is a canvas that is never drawn: a stream without a single frame.
  await page.addInitScript(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let first = true;
    navigator.mediaDevices.getUserMedia = (constraints) => {
      if (!first) return real(constraints);
      first = false;
      return Promise.resolve(document.createElement('canvas').captureStream(0));
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect(page.getByText('This camera sends no picture.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => playing(page)).toBeGreaterThan(0);
});
