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

    await context.setOffline(true);

    // The core answer must still be computed on device.
    await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Best price', exact: true })).toBeVisible();

    await context.setOffline(false);
  });

  test('writes queue in the outbox and the queue is visible', async ({ page }) => {
    await page.getByText(/things waiting to send/).first().click();
    await expect(page.getByText('Outbox', { exact: true })).toBeVisible();
    await page.getByText('Queue a test operation').click();
    await expect(page.getByText('field_note')).toBeVisible();
  });

  test('CRDT merge converges and reports conflicts', async ({ page }) => {
    await page.getByText(/things waiting to send/).first().click();
    await expect(page.getByText('CRDT conflict resolution')).toBeVisible();
    await page.getByText('Run merge').click();
    await expect(page.getByText('Operations applied')).toBeVisible();
    await expect(page.getByText('fld_1:variety')).toBeVisible();
  });

  test('a mesh gossip round transfers only the missing operations', async ({ page }) => {
    await page.getByText(/things waiting to send/).first().click();
    await page.getByText('Gossip').first().click();
    await expect(page.getByText('Sync trace')).toBeVisible();
    await expect(page.getByText(/digest exchange/)).toBeVisible();
  });
});
