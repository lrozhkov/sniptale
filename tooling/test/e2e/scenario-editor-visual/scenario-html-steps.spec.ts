import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`HTML preserves grouped steps and offline navigation in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    const issues = createPageIssueCollector(page);
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    const reader = page.locator('.guide-reader');
    await expect(reader.locator('.guide-read-document > section')).toHaveCount(1);
    await expect(reader.locator('.guide-read-document > article')).toHaveCount(1);
    await expect(reader.locator('.guide-reading-nav a')).toHaveCount(2);
    await expect(reader.locator('.guide-reader-pagination')).toContainText('1 / 2');
    const intro = await reader.locator('.guide-read-document > section').boundingBox();
    const scroll = await reader.locator('.guide-document-scroll').boundingBox();
    expect(intro!.y).toBeGreaterThanOrEqual(scroll!.y);
    if (theme === 'dark') {
      await page.getByRole('button', { name: 'Step navigation', exact: true }).click();
      await page.getByRole('option', { name: 'On the left', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Step by step', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.evaluate(() => {
      const chunks: Uint8Array[] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write: (chunk) => {
                chunks.push(chunk);
              },
            }),
        }),
      });
      Object.defineProperty(window, 'readingExportHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Document', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Step by step', exact: true }).click();
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-html-settings > [role=status]')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'readingExportHtml');
      if (typeof value !== 'string') throw new Error('Missing HTML');
      return value;
    });
    const filename = testInfo.outputPath('guide.html');
    await writeFile(filename, html);
    const network: string[] = [];
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) network.push(request.url());
    });
    await page.goto(pathToFileURL(filename).href);
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await expect(page.locator('.guide-reading-layout')).toHaveAttribute(
      'data-navigation',
      theme === 'dark' ? 'side' : 'top'
    );
    await expect(page.locator('.guide-read-document > section')).toBeVisible();
    await expect(page.locator('.guide-read-document > article:visible')).toHaveCount(1);
    const openImage = page.locator('[data-guide-open]').first();
    await openImage.click();
    await expect(page.locator('dialog')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await page.keyboard.press('Escape');
    await expect(openImage).toBeFocused();
    await page.getByRole('button', { name: 'Next step', exact: true }).click();
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await expect(page.locator('.guide-read-document > section')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Next step', exact: true })).toBeDisabled();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await page.locator('[data-guide-target]').last().click();
    await page.reload();
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await page.evaluate(() => {
      location.hash = '%E0%A4%A';
    });
    await expect(page.locator('[data-guide-progress]')).toHaveText('2 / 2');
    await page.evaluate(() => {
      location.hash = 'guide-item-intro';
    });
    await expect(page.locator('[data-guide-progress]')).toHaveText('1 / 2');
    await page.setViewportSize({ width: 640, height: 640 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true
    );
    await page.evaluate(() => document.fonts.ready);
    await testInfo.attach(`html-${theme}`, {
      body: await page.screenshot({ path: `tasks/scenario-html-steps/html-${theme}.png` }),
      contentType: 'image/png',
    });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.guide-read-document > article:visible')).toHaveCount(2);
    expect(network).toEqual([]);
    issues.assertClean();
    const noScript = await page.context().browser()!.newContext({ javaScriptEnabled: false });
    try {
      const fallback = await noScript.newPage();
      await fallback.goto(pathToFileURL(filename).href);
      await expect(fallback.locator('.guide-read-document > article:visible')).toHaveCount(2);
      await expect(fallback.locator('.guide-read-document > section')).toBeVisible();
      await expect(fallback.locator('[data-guide-pagination]')).toBeHidden();
    } finally {
      await noScript.close();
    }
  });
}
