import path from 'node:path';

import { defineConfig } from '@playwright/test';

const headless = process.env.PLAYWRIGHT_HEADLESS !== '0';
const browserPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.resolve('.playwright-browsers');

export default defineConfig({
  testDir: './tooling/test/e2e',
  outputDir: '.tmp/test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.tmp/playwright-report' }]],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    headless,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  metadata: {
    extensionBuildDir: 'dist',
    playwrightBrowsersPath: browserPath,
  },
});
