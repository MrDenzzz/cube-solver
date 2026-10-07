import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Tables ready/)).toBeVisible();
});

test('solves a 3×3×3 scramble and steps through the guide', async ({ page }) => {
  await page.getByLabel(/Moves in WCA notation/).fill("R U R' U' F2 D L2 B'");
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByText(/moves found in/)).toBeVisible();
  await expect(page.getByText(/^Move 1 of \d+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText(/^Move 2 of \d+$/)).toBeVisible();
});

test('points at a notation error', async ({ page }) => {
  await page.getByLabel(/Moves in WCA notation/).fill('R U Q');
  await expect(page.getByText(/Unexpected character “Q” at position 5/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Solve', exact: true })).toBeDisabled();
});

test('solves a random 4×4×4 state with wide turns in the guide', async ({ page }) => {
  await page.getByRole('button', { name: '4×4×4' }).click();
  await expect(page.getByText(/4×4×4 tables ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Random state' }).click();
  await expect(page.getByLabel(/Moves in WCA notation/)).not.toHaveValue('');
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByText(/moves found in .*: reduction/)).toBeVisible();
  await expect(page.getByText(/Hold the cube the way you held it/)).toBeVisible();
});
