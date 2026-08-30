import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('everyday farmer journey', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('the home screen answers the two questions that matter', async ({ page }) => {
    await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible();
    await expect(page.getByText(/Best price:/)).toBeVisible();
    await expect(page.getByText('Next 5 days')).toBeVisible();
  });

  test('a farmer can add a field with the picture wizard', async ({ page }) => {
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Add a field').click();

    await expect(page.getByText('What are you growing?')).toBeVisible();
    await page.getByText('Next', { exact: true }).first().click();
    await expect(page.getByText('How big is the field?')).toBeVisible();
    await page.getByText('Next', { exact: true }).first().click();
    await expect(page.getByText('How do you water it?')).toBeVisible();
    await page.getByText('Next', { exact: true }).first().click();
    await page.getByText('Save my field').click();
    await expect(page.getByText('Your field is saved')).toBeVisible();
  });

  test('a farmer can pin and unpin their own tools', async ({ page }) => {
    await page.getByText('+ ADD TOOL').click();
    await expect(page.getByText('Add tools to your home')).toBeVisible();
    await page.getByText('Learn', { exact: false }).first().click();
    await page.getByText('Done', { exact: true }).click();
    await expect(page.getByText('My tools')).toBeVisible();
  });

  test('elder mode and night mode apply from the overflow menu', async ({ page }) => {
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Bigger text').click();
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText(/Night colours|Day colours/).click();
    await expect(page.getByText('My tools')).toBeVisible();
  });

  test('the irrigation screen explains the decision in plain words', async ({ page }) => {
    await page.getByText('Open water plan').click();
    await expect(page.getByText('Soil water balance')).toBeVisible();
    await expect(page.getByText('Reference evapotranspiration')).toBeVisible();
    await expect(page.getByText('7-day irrigation plan')).toBeVisible();
  });

  test('market screen ranks by net value and labels the estimate', async ({ page }) => {
    await page.getByRole('button', { name: 'Best price', exact: true }).click();
    await expect(page.getByText('Net value ranking')).toBeVisible();
    await expect(page.getByText(/AI ESTIMATE/)).toBeVisible();
    await expect(page.getByText(/not a guaranteed price/i)).toBeVisible();
  });
});
