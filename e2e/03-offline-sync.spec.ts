import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('offline → online and CRDT convergence', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  test('airplane mode keeps every screen usable', async ({ page, context }) => {
    const moreOptionsBtn = page.getByRole('button', { name: 'More options' }).first();
    await moreOptionsBtn.waitFor({ state: 'visible', timeout: 10000 });
    await moreOptionsBtn.click();
    
    const airplaneModeText = page.getByText('Airplane mode');
    await airplaneModeText.waitFor({ state: 'visible', timeout: 10000 });
    await airplaneModeText.click();

    await context.setOffline(true);
    await page.waitForTimeout(2000); // Allow UI to settle after going offline

    // The core answer must still be computed on device.
    await expect(page.getByText(/Give water today|No water needed today/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /^Best price/i }).first()).toBeVisible({ timeout: 20000 });

    await context.setOffline(false);
    await page.waitForTimeout(1000); // Allow UI to settle after coming online
  });

  test('writes queue in the outbox and the queue is visible', async ({ page }) => {
    const outboxLink = page.getByText(/things waiting to send/).first();
    await outboxLink.waitFor({ state: 'visible', timeout: 10000 });
    await outboxLink.click();
    
    await expect(page.getByRole('heading', { name: 'Outbox', exact: true }).or(page.getByText('Outbox', { exact: true }))).toBeVisible({ timeout: 15000 });
    
    const queueOpsText = page.getByText('Queue a test operation');
    await queueOpsText.waitFor({ state: 'visible', timeout: 10000 });
    await queueOpsText.click();
    
    await expect(page.getByText('field_note')).toBeVisible({ timeout: 10000 });
  });

  test('CRDT merge converges and reports conflicts', async ({ page }) => {
    const outboxLink = page.getByText(/things waiting to send/).first();
    await outboxLink.waitFor({ state: 'visible', timeout: 10000 });
    await outboxLink.click();
    
    await expect(page.getByText('CRDT conflict resolution')).toBeVisible({ timeout: 15000 });
    
    const runMergeBtn = page.getByText('Run merge');
    await runMergeBtn.waitFor({ state: 'visible', timeout: 10000 });
    await runMergeBtn.click();
    
    await expect(page.getByText('Operations applied')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('fld_1:variety')).toBeVisible({ timeout: 10000 });
  });

  test('a mesh gossip round transfers only the missing operations', async ({ page }) => {
    const outboxLink = page.getByText(/things waiting to send/).first();
    await outboxLink.waitFor({ state: 'visible', timeout: 10000 });
    await outboxLink.click();
    
    const gossipBtn = page.getByText('Gossip').first();
    await gossipBtn.waitFor({ state: 'visible', timeout: 10000 });
    await gossipBtn.click();
    
    await expect(page.getByText('Sync trace')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/digest exchange/)).toBeVisible({ timeout: 10000 });
  });
});
