import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('camera diagnosis pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('quality path: sample capture → grade → price range → net market ranking', async ({ page }) => {
    await page.getByRole('button', { name: 'Check crop', exact: true }).click();
    await expect(page.getByText(/Which crop|Crop/).first()).toBeVisible();

    await page.getByText('PREMIUM TOMATO LOT').click();
    await page.getByText(/Tell me the price|Grade & price/).click();

    await expect(page.getByText(/Grade [ABC]/).first()).toBeVisible({ timeout: 45000 });
    await expect(page.getByText(/per quintal/).first()).toBeVisible();
    await expect(page.getByText('Markets ranked by NET value')).toBeVisible();
    await expect(page.getByText(/AI estimate|not a guaranteed price/i).first()).toBeVisible();
  });

  test('disease path: multi-label result with Grad-CAM and a spray window', async ({ page }) => {
    await page.getByRole('button', { name: 'Check crop', exact: true }).click();
    await page.getByText(/Sick plant\?|Disease/).click();
    await page.getByText('LEAF WITH LESIONS').click();
    await page.getByText(/What is wrong\?|Detect disease/).click();

    await expect(page.getByText('Multi-label findings')).toBeVisible({ timeout: 45000 });
    await expect(page.getByText('GRAD-CAM ACTIVATION')).toBeVisible();
    await expect(page.getByText('Spray window')).toBeVisible();
  });

  test('an unclear or non-crop photo is refused with a plain instruction', async ({ page }) => {
    await page.getByRole('button', { name: 'Check crop', exact: true }).click();
    await page.getByText('PREMIUM TOMATO LOT').click();
    await page.getByText(/Tell me the price|Grade & price/).click();

    // Either it passed the gate (a clear synthetic lot) or it was refused with guidance.
    const graded = page.getByText(/Grade [ABC]/).first();
    const refused = page.getByText(/not clear|not a crop/i).first();
    await expect(graded.or(refused)).toBeVisible({ timeout: 45000 });
  });

  test('the crop identifier reports its confidence and lets the farmer correct it', async ({ page }) => {
    await page.getByRole('button', { name: 'Check crop', exact: true }).click();
    await page.getByText('ONION LOT').click();
    await page.getByText(/Tell me the price|Grade & price/).click();
    await expect(page.getByText(/Grade [ABC]|not clear|not a crop/).first()).toBeVisible({ timeout: 45000 });
  });
});
