import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`saves and opens a self-contained HTML guide in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const name = 'Инструкция <script>alert(1)</script>';
    await page.getByRole('textbox', { name: 'Scenario', exact: true }).fill(name);
    await page.getByRole('button', { name: 'Export', exact: true }).click();
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
              close: () => {
                document.documentElement.dataset['fileClosed'] = 'true';
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedGuideHtml', {
        configurable: true,
        get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
      });
    });
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('HTML saved');
    await expect(page.locator('html')).toHaveAttribute('data-file-closed', 'true');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'savedGuideHtml');
      if (typeof value !== 'string') throw new Error('Missing file');
      return value;
    });
    expect(html).not.toContain('SNIPTALE_ASSET_');
    await testInfo.attach(`standalone-${theme}.html`, {
      body: Buffer.from(html),
      contentType: 'text/html',
    });
    const external: string[] = [];
    const url = `${hostOrigin}/standalone-guide.html`;
    await page.route(url, (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    page.on('request', (request) => {
      if (request.url() !== url && /^https?:/.test(request.url())) external.push(request.url());
    });
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.locator('script, input, textarea, button')).toHaveCount(0);
    await expect(page.locator('img')).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.every(
              (node) =>
                node instanceof HTMLImageElement &&
                node.complete &&
                node.naturalWidth > 0 &&
                node.src.startsWith('data:image/')
            )
          )
      )
      .toBe(true);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() =>
        [...document.fonts].some((font) => font.family === 'Guide0' && font.status === 'loaded')
      )
    ).toBe(true);
    expect(external).toEqual([]);
    await expect(page.locator('.guide-document > article').first()).toHaveCSS(
      'color',
      'rgb(32, 33, 36)'
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await testInfo.attach(`standalone-screen-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}
