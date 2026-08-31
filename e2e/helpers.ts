import { Page, expect } from '@playwright/test';

/** Clear persisted state so every spec starts from a true first run. */
export async function freshStart(page: Page) {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch { /* storage may be blocked */ }
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/** Walk the language → OTP → profile → location onboarding. */
export async function signIn(page: Page, opts: { name?: string; district?: string } = {}) {
  const name = opts.name ?? 'Test Farmer';
  const district = opts.district ?? 'Shirur';

  await expect(page.getByText('CropCare', { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await page.getByText('English', { exact: true }).first().click();
  await page.getByText('Continue', { exact: true }).click();

  await page.getByPlaceholder(/98765|you@mail/i).fill('9876543210');
  await page.getByText('Send me the code').click();

  // Local-mode challenge renders the six digits on screen; read them back from
  // the labelled container so unrelated numerals cannot be picked up.
  await expect(page.getByText('YOUR ONE-TIME CODE')).toBeVisible({ timeout: 20000 });
  const label = await page.locator('[aria-label^="one-time-code"]').first().getAttribute('aria-label');
  const code = (label ?? '').replace(/\D/g, '');
  expect(code).toHaveLength(6);

  await page.getByPlaceholder('000000').fill(code);
  await page.getByText('Verify', { exact: true }).click();

  await expect(page.getByText('What is your name?')).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder('Your name').fill(name);
  await page.getByText('Next', { exact: true }).click();

  await expect(page.getByText('Where is your farm?')).toBeVisible({ timeout: 20000 });
  await page.getByPlaceholder(/Type a district/i).fill(district);
  await page.getByText(district, { exact: true }).first().click();
  await page.getByText('Start using CropCare').click();

  await expect(page.getByText('My tools')).toBeVisible({ timeout: 25000 });
}

export async function openTool(page: Page, label: string) {
  const allToolsBtn = page.getByRole('button', { name: 'All tools' });
  await allToolsBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await allToolsBtn.click().catch(() => {});
  const toolText = page.getByText(label, { exact: false }).first();
  await toolText.waitFor({ state: 'visible', timeout: 10000 });
  await toolText.click();
}

export async function openOverflow(page: Page) {
  const moreOptionsBtn = page.getByRole('button', { name: 'More options' }).first();
  await moreOptionsBtn.waitFor({ state: 'visible', timeout: 10000 });
  await moreOptionsBtn.click();
}
