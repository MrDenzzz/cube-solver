import { expect, test } from '@playwright/test';
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
