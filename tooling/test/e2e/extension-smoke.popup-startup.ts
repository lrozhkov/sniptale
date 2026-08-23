import { mkdir } from 'node:fs/promises';
import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

const POPUP_PATH = '/apps/extension/src/popup/index.html';
const POPUP_ROOT_SELECTOR = '[data-ui="popup.app.root"]';
const REMOVED_STARTUP_SELECTOR = '[data-ui="popup.app.startup-shell"]';
const THEME_STORAGE_KEY = 'sniptale-theme-preference';
const LOCALE_STORAGE_KEY = 'sniptale-locale-preference';

async function verifyCriticalCanvas(
  context: BrowserContext,
  extensionId: string,
  testInfo: TestInfo
): Promise<void> {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.route('**/*.js', (route) => route.abort());
  await page.goto(`chrome-extension://${extensionId}${POPUP_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 242, 237)');
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator(REMOVED_STARTUP_SELECTOR)).toHaveCount(0);
  await mkdir(testInfo.outputDir, { recursive: true });
  await page.screenshot({ path: testInfo.outputPath('popup-critical-canvas-light.png') });

  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(9, 9, 11)');
  await page.screenshot({ path: testInfo.outputPath('popup-critical-canvas-dark.png') });
  await page.close();
}

async function verifyImmediateApplication(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const popupUrl = `chrome-extension://${extensionId}${POPUP_PATH}`;
  const seedPage = await context.newPage();
  await seedPage.route('**/*.js', (route) => route.abort());
  await seedPage.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await seedPage.evaluate(
    async ({ localeStorageKey }) => {
      localStorage.setItem(localeStorageKey, 'en');
      await chrome.storage.local.set({ [localeStorageKey]: 'en' });
    },
    { localeStorageKey: LOCALE_STORAGE_KEY }
  );
  await seedPage.close();

  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return originalSendMessage(...args);
    };
  });
  await page.route('**/assets/app-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  await page.goto(popupUrl, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator(REMOVED_STARTUP_SELECTOR)).toHaveCount(0);
  await page.locator(POPUP_ROOT_SELECTOR).waitFor({ state: 'visible' });
  await expect(page.locator('[data-ui="shared.ui.popup-footer"]')).toHaveCount(0);
  const pendingTabs = page.locator('[data-ui="popup.app.tabs"] button');
  await expect(pendingTabs).toHaveCount(5);
  await expect(pendingTabs.nth(0)).toHaveAttribute('aria-label', 'Screenshots');
  await expect(pendingTabs.nth(1)).toHaveAttribute('aria-label', 'Video');
  await expect(pendingTabs.nth(2)).toHaveAttribute('aria-label', 'Menu');
  await expect(pendingTabs.nth(3)).toHaveAttribute('aria-label', 'Tools');
  await expect(pendingTabs.nth(4)).toHaveAttribute('aria-label', 'Export');
  await expect(page.locator('[data-ui="popup.app.tabs"] button:disabled')).toHaveCount(0);
  await expect(page.locator('[data-ui="popup.app.route-skeleton"]')).toBeVisible();
  await expect(page.locator('[data-ui="popup.app.content"] > *')).toHaveCount(1, {
    timeout: 5_000,
  });
  await expect(page.locator('[data-ui="popup.app.route-skeleton"]')).toHaveCount(0, {
    timeout: 5_000,
  });
  await expect(page.locator('[data-ui="popup.app.tabs"] button').nth(0)).toHaveAttribute(
    'aria-label',
    'Screenshots'
  );
  await expect(page.locator(REMOVED_STARTUP_SELECTOR)).toHaveCount(0);
  await page.evaluate(
    (storageKey) => chrome.storage.local.set({ [storageKey]: 'light' }),
    THEME_STORAGE_KEY
  );
  await expect
    .poll(() => page.evaluate((storageKey) => localStorage.getItem(storageKey), THEME_STORAGE_KEY))
    .toBe('light');
  await page.evaluate(
    async ({ localeStorageKey }) => {
      localStorage.setItem(localeStorageKey, 'ru');
      await chrome.storage.local.set({ [localeStorageKey]: 'ru' });
    },
    { localeStorageKey: LOCALE_STORAGE_KEY }
  );
  await page.close();
}

async function installFirstFrameThemeProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { backgrounds: [] as string[], stopped: false };
    Object.assign(window, { __sniptalePopupFirstFrameThemeProbe: probe });
    const sample = () => {
      const background = getComputedStyle(
        document.body ?? document.documentElement
      ).backgroundColor;
      if (background && !probe.backgrounds.includes(background)) probe.backgrounds.push(background);
      if (document.querySelector('[data-ui="popup.app.root"]')) {
        probe.stopped = true;
        return;
      }
      window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  });
}

async function verifyStoredThemeFirstFrames(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.route('**/assets/app-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  await installFirstFrameThemeProbe(page);
  await page.goto(`chrome-extension://${extensionId}${POPUP_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(POPUP_ROOT_SELECTOR).waitFor({ state: 'visible' });
  const proof = await page.evaluate(() => ({
    entryMarkCount: performance.getEntriesByName('sniptale-popup-entry-evaluated').length,
    firstPaintAt:
      performance.getEntriesByType('paint').find((entry) => entry.name === 'first-paint')
        ?.startTime ?? null,
    ...(
      window as typeof window & {
        __sniptalePopupFirstFrameThemeProbe: { backgrounds: string[]; stopped: boolean };
      }
    ).__sniptalePopupFirstFrameThemeProbe,
  }));

  expect(proof.entryMarkCount).toBe(1);
  expect(proof.firstPaintAt).not.toBeNull();
  expect(proof.stopped).toBe(true);
  expect(proof.backgrounds.length).toBeGreaterThan(0);
  expect(proof.backgrounds).toEqual(['rgb(246, 242, 237)']);
  await expect(page.locator(REMOVED_STARTUP_SELECTOR)).toHaveCount(0);
  await page.evaluate(
    (storageKey) => chrome.storage.local.set({ [storageKey]: 'system' }),
    THEME_STORAGE_KEY
  );
  await page.close();
}

async function verifyShellPaintsBeforeCapabilities(
  context: BrowserContext,
  extensionId: string
): Promise<void> {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const originalQuery = chrome.tabs.query.bind(chrome.tabs);
    Object.assign(window, { __sniptaleCapabilityQueryPending: false });
    chrome.tabs.query = async (...args) => {
      Object.assign(window, { __sniptaleCapabilityQueryPending: true });
      await new Promise((resolve) => setTimeout(resolve, 800));
      Object.assign(window, { __sniptaleCapabilityQueryPending: false });
      return originalQuery(...args);
    };
  });
  await page.goto(`chrome-extension://${extensionId}${POPUP_PATH}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator(POPUP_ROOT_SELECTOR).waitFor({ state: 'visible' });
  await expect(page.locator('[data-ui="popup.app.tabs"] button')).toHaveCount(5);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __sniptaleCapabilityQueryPending: boolean;
          }
        ).__sniptaleCapabilityQueryPending
    )
  ).toBe(true);
  await page.close();
}

export async function verifyPopupStartupLifecycle(
  context: BrowserContext,
  extensionId: string,
  testInfo: TestInfo
): Promise<void> {
  await verifyCriticalCanvas(context, extensionId, testInfo);
  await verifyImmediateApplication(context, extensionId);
  await verifyStoredThemeFirstFrames(context, extensionId);
  await verifyShellPaintsBeforeCapabilities(context, extensionId);
}
