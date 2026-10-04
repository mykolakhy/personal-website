import { defineConfig, devices } from '@playwright/test';
import { chromiumOnlyTag } from './tests/browser/coverage.mjs';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', grepInvert: new RegExp(chromiumOnlyTag), use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: 'node scripts/serve.mjs --dir dist --port 4180', url: 'http://127.0.0.1:4180', reuseExistingServer: !process.env.CI },
});
