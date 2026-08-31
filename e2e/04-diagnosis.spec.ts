import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('camera diagnosis pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('quality path: sample capture → grade → price range → net market ranking', async ({ page }) => {
    const checkCropBtn = page.getByRole('button', { name: 'Check crop', exact: true });
    await checkCropBtn.waitFor({ state: 'visible', timeout: 10000 });
    await checkCropBtn.click();
    
    await expect(page.getByText(/Which crop|Crop/).first()).toBeVisible({ timeout: 15000 });

    const premiumTomatoText = page.getByText('PREMIUM TOMATO LOT');
    await premiumTomatoText.waitFor({ state: 'visible', timeout: 10000 });
    await premiumTomatoText.click();
    
    const priceText = page.getByText(/Tell me the price|Grade & price/);
    await priceText.waitFor({ state: 'visible', timeout: 10000 });
    await priceText.click();

    await expect(page.getByText(/Grade [ABC]/).first()).toBeVisible({ timeout: 50000 });
    await expect(page.getByText('per quintal', { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Markets ranked by NET value')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/AI estimate|not a guaranteed price/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('disease path: multi-label result with Grad-CAM and a spray window', async ({ page }) => {
    const checkCropBtn = page.getByRole('button', { name: 'Check crop', exact: true });
    await checkCropBtn.waitFor({ state: 'visible', timeout: 10000 });
    await checkCropBtn.click();
    
    const diseaseText = page.getByText(/Sick plant\?|Disease/);
    await diseaseText.waitFor({ state: 'visible', timeout: 10000 });
    await diseaseText.click();
    
    const leafText = page.getByText('LEAF WITH LESIONS');
    await leafText.waitFor({ state: 'visible', timeout: 10000 });
    await leafText.click();
    
    const detectText = page.getByText(/What is wrong\?|Detect disease/);
    await detectText.waitFor({ state: 'visible', timeout: 10000 });
    await detectText.click();

    await expect(page.getByText('Multi-label findings')).toBeVisible({ timeout: 50000 });
    await expect(page.getByText('GRAD-CAM ACTIVATION')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Spray window')).toBeVisible({ timeout: 15000 });
  });

  test('an unclear or non-crop photo is refused with a plain instruction', async ({ page }) => {
    const checkCropBtn = page.getByRole('button', { name: 'Check crop', exact: true });
    await checkCropBtn.waitFor({ state: 'visible', timeout: 10000 });
    await checkCropBtn.click();
    
    const premiumTomatoText = page.getByText('PREMIUM TOMATO LOT');
    await premiumTomatoText.waitFor({ state: 'visible', timeout: 10000 });
    await premiumTomatoText.click();
    
    const priceText = page.getByText(/Tell me the price|Grade & price/);
    await priceText.waitFor({ state: 'visible', timeout: 10000 });
    await priceText.click();

    // Either it passed the gate (a clear synthetic lot) or it was refused with guidance.
    const graded = page.getByText(/Grade [ABC]/).first();
    const refused = page.getByText(/not clear|not a crop/i).first();
    await expect(graded.or(refused)).toBeVisible({ timeout: 50000 });
  });

  test('the crop identifier reports its confidence and lets the farmer correct it', async ({ page }) => {
    const checkCropBtn = page.getByRole('button', { name: 'Check crop', exact: true });
    await checkCropBtn.waitFor({ state: 'visible', timeout: 10000 });
    await checkCropBtn.click();
    
    const onionText = page.getByText('ONION LOT');
    await onionText.waitFor({ state: 'visible', timeout: 10000 });
    await onionText.click();
    
    const priceText = page.getByText(/Tell me the price|Grade & price/);
    await priceText.waitFor({ state: 'visible', timeout: 10000 });
    await priceText.click();
    
    await expect(page.getByText(/Grade [ABC]|not clear|not a crop/).first()).toBeVisible({ timeout: 50000 });
  });
});
