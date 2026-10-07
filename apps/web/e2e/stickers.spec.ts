import { expect, test } from '@playwright/test';

/** Colour keys of each face, in the editor's entry order. */
const ENTRY = [
  ['Front', 'g'],
  ['Right', 'r'],
  ['Back', 'b'],
  ['Left', 'o'],
  ['Top', 'w'],
  ['Bottom', 'y'],
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
});

test('types a cube in, flags a wrong sticker and solves the fixed cube', async ({ page }) => {
  await page.getByRole('button', { name: /^Front face, row 1, column 1/ }).focus();
  for (const [face, key] of ENTRY) {
    // One wrong sticker on the first face: white where green belongs.
    for (let i = 0; i < 8; i++) await page.keyboard.press(face === 'Front' && i === 0 ? 'w' : key);
  }
  await expect(page.getByText('White stickers: 10 instead of 9')).toBeVisible();

  await page.getByRole('radio', { name: /^Green/ }).click();
  await page.getByRole('button', { name: /^Front face, row 1, column 1/ }).click();
  await expect(page.getByText('The state is valid and ready to solve.')).toBeVisible();
  await expect(page.getByText(/Tables ready/)).toBeVisible();
  await page.getByRole('button', { name: 'Solve', exact: true }).click();
  await expect(page.getByText('The cube is already solved.')).toBeVisible();
});
