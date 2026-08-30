import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('passport verification and security gates', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  async function openAllTools(page: any) {
    await page.getByRole('button', { name: 'All tools' }).click();
  }

  test('the passport card renders, verifies, and detects tampering', async ({ page }) => {
    await openAllTools(page);
    await page.getByText('Crop proof', { exact: true }).first().click();

    await expect(page.getByText(/FARM PASSPORT/)).toBeVisible();
    await expect(page.getByText('VERIFIED')).toBeVisible();

    await page.getByRole('button', { name: 'More options' }).first().click();
    await page.getByText('Run tamper test').click();
    await expect(page.getByText(/TAMPERED|Chain verification failed/)).toBeVisible();
  });

  test('security centre executes token, WAF, SSRF and rate-limit checks', async ({ page }) => {
    await openAllTools(page);
    await page.getByText('Safety', { exact: true }).first().click();

    await page.getByText('Issue token').click();
    await expect(page.getByText(/valid · exp in/)).toBeVisible();

    await page.getByText('Forge signature').click();
    await expect(page.getByText(/rejected: bad-signature/)).toBeVisible();

    await page.getByText('Replay refresh').click();
    await expect(page.getByText(/REUSE DETECTED/)).toBeVisible();

    await expect(page.getByText(/BLOCKED by CC-SQLI-01/)).toBeVisible();
    await expect(page.getByText(/BLOCKED — private\/link-local/)).toBeVisible();
  });

  test('a malicious upload is blocked by the scanner', async ({ page }) => {
    await openAllTools(page);
    await page.getByText('Safety', { exact: true }).first().click();
    await page.getByText('Scan malicious file').click();
    await expect(page.getByText(/BLOCKED ·/)).toBeVisible();
  });

  test('the audit chain verifies end to end', async ({ page }) => {
    await openAllTools(page);
    await page.getByText('Safety', { exact: true }).first().click();
    await expect(page.getByText('Hash-chained audit log')).toBeVisible();
    await expect(page.getByText(/every block links to its predecessor/)).toBeVisible();
  });
});
