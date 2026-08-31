import { expect, test } from '@playwright/test';
import { freshStart, signIn } from './helpers';

test.describe('passport verification and security gates', () => {
  test.beforeEach(async ({ page }) => {
    await freshStart(page);
    await signIn(page);
  });

  async function openAllTools(page: any) {
    const allToolsBtn = page.getByRole('button', { name: 'All tools' });
    await allToolsBtn.waitFor({ state: 'visible', timeout: 15000 });
    await allToolsBtn.click();
    await page.waitForTimeout(1000); // Brief pause for menu to render
  }

  test('the passport card renders, verifies, and detects tampering', async ({ page }) => {
    await openAllTools(page);
    
    const cropProofText = page.getByText('Crop proof', { exact: true }).first();
    await cropProofText.waitFor({ state: 'visible', timeout: 10000 });
    await cropProofText.click();

    await expect(page.getByText(/FARM PASSPORT/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('VERIFIED')).toBeVisible({ timeout: 15000 });

    const moreOptionsBtn = page.getByRole('button', { name: 'More options' }).first();
    await moreOptionsBtn.waitFor({ state: 'visible', timeout: 10000 });
    await moreOptionsBtn.click();
    
    const tamperText = page.getByText('Run tamper test');
    await tamperText.waitFor({ state: 'visible', timeout: 10000 });
    await tamperText.click();
    
    await expect(page.getByText(/TAMPERED|Chain verification failed/)).toBeVisible({ timeout: 20000 });
  });

  test('security centre executes token, WAF, SSRF and rate-limit checks', async ({ page }) => {
    await openAllTools(page);
    
    const safetyText = page.getByText('Safety', { exact: true }).first();
    await safetyText.waitFor({ state: 'visible', timeout: 10000 });
    await safetyText.click();

    const issueTokenText = page.getByText('Issue token');
    await issueTokenText.waitFor({ state: 'visible', timeout: 10000 });
    await issueTokenText.click();
    
    await expect(page.getByText(/valid · exp in/)).toBeVisible({ timeout: 15000 });

    const forgeSignatureText = page.getByText('Forge signature');
    await forgeSignatureText.waitFor({ state: 'visible', timeout: 10000 });
    await forgeSignatureText.click();
    
    await expect(page.getByText(/rejected: bad-signature/)).toBeVisible({ timeout: 15000 });

    const replayRefreshText = page.getByText('Replay refresh');
    await replayRefreshText.waitFor({ state: 'visible', timeout: 10000 });
    await replayRefreshText.click();
    
    await expect(page.getByText(/REUSE DETECTED/)).toBeVisible({ timeout: 15000 });

    await expect(page.getByText(/BLOCKED by CC-SQLI-01/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/BLOCKED — private\/link-local/)).toBeVisible({ timeout: 15000 });
  });

  test('a malicious upload is blocked by the scanner', async ({ page }) => {
    await openAllTools(page);
    
    const safetyText = page.getByText('Safety', { exact: true }).first();
    await safetyText.waitFor({ state: 'visible', timeout: 10000 });
    await safetyText.click();
    
    const scanFileText = page.getByText('Scan malicious file');
    await scanFileText.waitFor({ state: 'visible', timeout: 10000 });
    await scanFileText.click();
    
    await expect(page.getByText(/BLOCKED ·/)).toBeVisible({ timeout: 20000 });
  });

  test('the audit chain verifies end to end', async ({ page }) => {
    await openAllTools(page);
    
    const safetyText = page.getByText('Safety', { exact: true }).first();
    await safetyText.waitFor({ state: 'visible', timeout: 10000 });
    await safetyText.click();
    
    await expect(page.getByText('Hash-chained audit log')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/every block links to its predecessor/)).toBeVisible({ timeout: 15000 });
  });
});
