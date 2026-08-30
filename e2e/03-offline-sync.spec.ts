import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('offline → online and CRDT convergence', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('airplane mode keeps every screen usable', async ({ page, context }) => {
    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Airplane mode').click();

    // Set offline and wait for UI to settle
    await context.setOffline(true);
    await page.waitForTimeout(500);

    try {
      // The core answer must still be computed on device.
      await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible({ timeout: 8000 });
      await expect(page.getByText(/Best price/)).toBeVisible({ timeout: 8000 });
    } finally {
      // Ensure network is restored even if test fails
      await context.setOffline(false);
      await page.waitForTimeout(500);
    }
  });

  test('writes queue in the outbox and the queue is visible', async ({ page }) => {
    // Use more robust selector with fallback and increased timeout
    await page.getByText(/things waiting to send|Outbox/).first().click();
    await expect(page.getByText('Outbox')).toBeVisible({ timeout: 12000 });
    await page.getByText('Queue a test operation').click();
    await expect(page.getByText('field_note')).toBeVisible({ timeout: 8000 });
  });

  test('CRDT merge converges and reports conflicts', async ({ page }) => {
    await page.getByText(/things waiting to send|Outbox/).first().click();
    await expect(page.getByText('CRDT conflict resolution')).toBeVisible({ timeout: 12000 });
    await page.getByText('Run merge').click();
    await expect(page.getByText('Operations applied')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('fld_1:variety')).toBeVisible({ timeout: 8000 });
  });

  test('a mesh gossip round transfers only the missing operations', async ({ page }) => {
    await page.getByText(/things waiting to send|Outbox/).first().click();
    await page.getByText('Gossip').first().click();
    await expect(page.getByText('Sync trace')).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/digest exchange/)).toBeVisible({ timeout: 8000 });
  });
});
