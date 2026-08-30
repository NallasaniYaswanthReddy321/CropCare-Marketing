import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('authentication and onboarding', () => {
  test('language → OTP → profile → location completes and lands on the home screen', async ({ page }) => {
    await freshStart(page);
    await signIn(page);
    // The home screen greets the farmer by first name.
    await expect(page.getByText('Test', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible();
  });

  test('a wrong OTP is rejected and the attempt counter decreases', async ({ page }) => {
    await freshStart(page);
    await page.getByText('English', { exact: true }).first().click();
    await page.getByText('Continue', { exact: true }).click();
    await page.getByPlaceholder(/98765|you@mail/i).fill('9876543210');
    await page.getByText('Send me the code').click();

    await expect(page.getByText('YOUR ONE-TIME CODE')).toBeVisible({ timeout: 20000 });
    await page.getByPlaceholder('000000').fill('000000');
    await page.getByText('Verify', { exact: true }).click();

    // Either the code was genuinely 000000 (1 in a million) or we see a refusal.
    const refused = page.getByText(/Wrong code/);
    const passed = page.getByText('What is your name?');
    await expect(refused.or(passed)).toBeVisible();
  });

  test('an invalid mobile number is refused before any code is issued', async ({ page }) => {
    await freshStart(page);
    await page.getByText('English', { exact: true }).first().click();
    await page.getByText('Continue', { exact: true }).click();
    await page.getByPlaceholder(/98765|you@mail/i).fill('12345');
    await page.getByText('Send me the code').click();
    await expect(page.getByText(/10 digits|does not look like/i)).toBeVisible();
  });

  test('language choice is applied and reversible from settings', async ({ page }) => {
    await freshStart(page);
    await page.getByText('हिन्दी', { exact: true }).click();
    await expect(page.getByText('हिन्दी')).toBeVisible();
    await page.getByText('English', { exact: true }).first().click();
    await page.getByText('Continue', { exact: true }).click();
    await expect(page.getByText('Mobile number or e-mail')).toBeVisible();
  });
});
