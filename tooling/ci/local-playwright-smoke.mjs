import fs from 'node:fs';

import { chromium } from 'playwright';

const lock = JSON.parse(fs.readFileSync('tooling/configs/ci/toolchain.lock.json', 'utf8'));
const installed = JSON.parse(fs.readFileSync('node_modules/playwright/package.json', 'utf8'));

if (installed.version !== lock.playwright.version) {
  throw new Error(
    `Local Playwright version drift: expected ${lock.playwright.version}, got ${installed.version}`
  );
}

const executable = chromium.executablePath();
fs.accessSync(executable, fs.constants.X_OK);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto('data:text/plain,sniptale-playwright-smoke');
} finally {
  await browser.close();
}
