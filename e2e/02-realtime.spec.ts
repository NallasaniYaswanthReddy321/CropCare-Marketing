import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('realtime stream', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('the live badge is present and opens the event console', async ({ page }) => {
    await page.getByRole('button', { name: /Connection status/ }).click();
    await expect(page.getByText('Connection health')).toBeVisible();
    await expect(page.getByText('Delivery correctness')).toBeVisible();
  });

  test('device ticks appear in the event table with sequence numbers', async ({ page }) => {
    await page.getByRole('button', { name: /Connection status/ }).click();
    await expect(page.getByText('Event stream')).toBeVisible();
    // The device publishes field/price/sync ticks on mount; each row is
    // numbered with its monotonic sequence.
    await expect(page.getByText(/^#\d+$/).first()).toBeVisible({ timeout: 40000 });
    await expect(page.getByText('Latest values on the wire')).toBeVisible();
  });

  test('reconnect is offered and does not break the UI', async ({ page }) => {
    await page.getByRole('button', { name: /Connection status/ }).click();
    await page.getByText('Reconnect', { exact: true }).first().click();
    await expect(page.getByText('Connection health')).toBeVisible();
  });

  test('correctness counters are exposed (dedup, gaps, denials)', async ({ page }) => {
    await page.getByRole('button', { name: /Connection status/ }).click();
    await expect(page.getByText('Duplicates dropped')).toBeVisible();
    await expect(page.getByText('Sequence gaps detected')).toBeVisible();
    await expect(page.getByText('Authorization denials')).toBeVisible();
  });
});
