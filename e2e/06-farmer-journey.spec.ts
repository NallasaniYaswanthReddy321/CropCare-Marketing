import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('everyday farmer journey', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('the home screen answers the two questions that matter', async ({ page }) => {
    await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Best price:/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Next 5 days')).toBeVisible({ timeout: 15000 });
  });

  test('a farmer can add a field with the picture wizard', async ({ page }) => {
    const moreOptionsBtn = page.getByRole('button', { name: 'More options' }).first();
    await moreOptionsBtn.waitFor({ state: 'visible', timeout: 10000 });
    await moreOptionsBtn.click();
    
    const addFieldBtn = page.getByRole('button', { name: 'Add a field' });
    await addFieldBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addFieldBtn.click();

    await expect(page.getByText('What are you growing?')).toBeVisible({ timeout: 15000 });
    
    const nextBtn1 = page.getByText('Next', { exact: true }).first();
    await nextBtn1.waitFor({ state: 'visible', timeout: 10000 });
    await nextBtn1.click();
    
    await expect(page.getByText('How big is the field?')).toBeVisible({ timeout: 15000 });
    
    const nextBtn2 = page.getByText('Next', { exact: true }).first();
    await nextBtn2.waitFor({ state: 'visible', timeout: 10000 });
    await nextBtn2.click();
    
    await expect(page.getByText('How do you water it?')).toBeVisible({ timeout: 15000 });
    
    const nextBtn3 = page.getByText('Next', { exact: true }).first();
    await nextBtn3.waitFor({ state: 'visible', timeout: 10000 });
    await nextBtn3.click();
    
    const saveFieldText = page.getByText('Save my field');
    await saveFieldText.waitFor({ state: 'visible', timeout: 10000 });
    await saveFieldText.click();
    
    await expect(page.getByText('Your field is saved')).toBeVisible({ timeout: 15000 });
  });

  test('a farmer can pin and unpin their own tools', async ({ page }) => {
    const addToolText = page.getByText('+ ADD TOOL');
    await addToolText.waitFor({ state: 'visible', timeout: 10000 });
    await addToolText.click();
    
    await expect(page.getByText('Add tools to your home')).toBeVisible({ timeout: 15000 });
    
    const learnBtn = page.getByRole('button').filter({ hasText: /^Learn$/ }).first();
    await learnBtn.waitFor({ state: 'visible', timeout: 15000 });
    await learnBtn.click();
    
    const doneBtn = page.getByText('Done', { exact: true });
    await doneBtn.waitFor({ state: 'visible', timeout: 10000 });
    await doneBtn.click();
    
    await expect(page.getByText('My tools')).toBeVisible({ timeout: 15000 });
  });

  test('elder mode and night mode apply from the overflow menu', async ({ page }) => {
    const moreOptionsBtn1 = page.getByRole('button', { name: 'More options' }).first();
    await moreOptionsBtn1.waitFor({ state: 'visible', timeout: 10000 });
    await moreOptionsBtn1.click();
    
    const biggerTextBtn = page.getByText('Bigger text');
    await biggerTextBtn.waitFor({ state: 'visible', timeout: 10000 });
    await biggerTextBtn.click();
    
    const moreOptionsBtn2 = page.getByRole('button', { name: 'More options' }).first();
    await moreOptionsBtn2.waitFor({ state: 'visible', timeout: 10000 });
    await moreOptionsBtn2.click();
    
    const nightModeBtn = page.getByText(/Night colours|Day colours/);
    await nightModeBtn.waitFor({ state: 'visible', timeout: 10000 });
    await nightModeBtn.click();
    
    await expect(page.getByText('My tools')).toBeVisible({ timeout: 15000 });
  });

  test('the irrigation screen explains the decision in plain words', async ({ page }) => {
    const waterPlanText = page.getByText('Open water plan');
    await waterPlanText.waitFor({ state: 'visible', timeout: 10000 });
    await waterPlanText.click();
    
    await expect(page.getByText('Soil water balance')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Reference evapotranspiration')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('7-day irrigation plan')).toBeVisible({ timeout: 15000 });
  });

  test('market screen ranks by net value and labels the estimate', async ({ page }) => {
    const bestPriceBtn = page.getByRole('button', { name: 'Best price', exact: true });
    await bestPriceBtn.waitFor({ state: 'visible', timeout: 10000 });
    await bestPriceBtn.click();
    
    await expect(page.getByText('Net value ranking')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/AI ESTIMATE/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not a guaranteed price/i)).toBeVisible({ timeout: 15000 });
  });
});
