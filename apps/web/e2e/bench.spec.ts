import { expect, test } from '@playwright/test';

test('shows the recorded results and runs the 3×3×3 benchmark here', async ({ page }) => {
  await page.goto('/#/bench');
  await expect(page.getByRole('table')).toHaveCount(3);
  await page.getByRole('button', { name: /3×3×3 fast mode, 20 cubes/ }).click();
  await expect(page.getByText(/^20 cubes: [\d.]+ moves on average/)).toBeVisible();

  await page.getByRole('link', { name: 'Solver', exact: true }).click();
  await expect(page.getByLabel(/Moves in WCA notation/)).toBeVisible();
});
