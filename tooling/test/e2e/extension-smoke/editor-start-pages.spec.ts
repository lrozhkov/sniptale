import { test, expect } from '../support/extension-fixture';

const VIEWPORT = { width: 1280, height: 720 };
const CASES = [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const;

for (const [name, path] of [
  ['image', '/apps/extension/src/editor/index.html'],
  ['video', '/apps/extension/src/video-editor/index.html'],
  ['scenario', '/apps/extension/src/scenario-editor/index.html'],
] as const) {
  for (const appearance of CASES) {
    test(`${name} editor starts and creates at HD in ${appearance.locale}/${appearance.theme}`, async ({
      page,
      extensionId,
    }, testInfo) => {
      await page.setViewportSize(VIEWPORT);
      await page.goto(`chrome-extension://${extensionId}${path}`);
      await page.evaluate(async ({ locale, theme }) => {
        await chrome.storage.local.set({
          'sniptale-locale-preference': locale,
          'sniptale-theme-preference': theme,
        });
        localStorage.setItem('sniptale-locale-preference', locale);
        localStorage.setItem('sniptale-theme-preference', theme);
      }, appearance);
      await page.reload();
      await expect(page.locator('[data-ui="editor.start"]')).toBeVisible();
      await expect(page.locator('[data-ui="editor.start"] button').first()).toBeVisible();
      await expect(page.locator('[data-ui="editor.start"] button').nth(1)).toBeVisible();
      await expect(page.locator('[data-ui="editor.start"] h1')).toBeVisible();
      await testInfo.attach(`${name}-${appearance.locale}-${appearance.theme}-hd`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      if (name === 'image') {
        await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
        await expect(page.locator('[data-ui="editor.canvas.layer"]')).toBeAttached();
      }
      if (name === 'video')
        await expect(page.locator('[data-ui="video-editor.workspace"]')).toHaveCount(0);
      if (name === 'scenario') await expect(page.locator('.guide-page-header')).toHaveCount(0);
      await page.locator('[data-ui="editor.start"] button').first().click();
      await expect(page.locator('[data-ui="editor.start"]')).toHaveCount(0);
    });
  }
}

for (const [name, path] of [
  ['video', '/apps/extension/src/video-editor/index.html'],
  ['scenario', '/apps/extension/src/scenario-editor/index.html'],
] as const) {
  test(`${name} recent project reopens from the start page`, async ({ page, extensionId }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`chrome-extension://${extensionId}${path}`);
    await expect(page.locator('[data-ui="editor.start"]')).toBeVisible();
    await page.locator('[data-ui="editor.start"] button').first().click();
    await expect(page.locator('[data-ui="editor.start"]')).toHaveCount(0);
    await page.goto(`chrome-extension://${extensionId}${path}`);
    await expect(page.locator('[data-ui="editor.start"] section button').first()).toBeVisible();
    await page.locator('[data-ui="editor.start"] section button').first().click();
    await expect(page.locator('[data-ui="editor.start"]')).toHaveCount(0);
  });
}
