import { test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

/** Visual smoke: renders the twin, map and crop guide so regressions are visible. */
test('capture key screens', async ({ page }) => {
  await freshStart(page);
  await signIn(page, { name: 'Anjali', district: 'Shirur' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/shots/home.png', fullPage: false });

  await page.getByRole('button', { name: 'Field map', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'e2e/shots/map.png', fullPage: false });
});
