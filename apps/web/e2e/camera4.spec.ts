import { expect, test } from '@playwright/test';
import { CUBES } from './cubes.ts';

test('scans a 4×4×4 shown in any order and rotation, and holds it by a corner', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '4×4×4' }).click();
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Scan with the camera' }).click();
  await expect(page.getByRole('group', { name: 'Unfolded cube' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('The state is valid and ready to solve.')).toBeVisible();
  // The first face shown becomes the front as shown, so the scan is the cube itself.
  expect(await page.evaluate(() => localStorage.getItem('cube-solver.stickers4'))).toBe(CUBES[4]);
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(
    page.getByText(/Hold the cube with the .* corner at the top front right/),
  ).toBeVisible();
});
