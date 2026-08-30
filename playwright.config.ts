import { defineConfig, devices } from '@playwright/test';

/**
 * CropCare acceptance suite.
 * Runs against the exported static web build (`npx expo export --platform all`)
 * so the tests exercise exactly the artefact that ships.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'e2e-results.json' }]] : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    permissions: ['geolocation'],
    geolocation: { latitude: 18.83, longitude: 74.37 }, // Shirur, Maharashtra
    locale: 'en-IN',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx serve dist -l 8080 --single',
        port: 8080,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
