import { expect } from '@playwright/test';
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter, TextWriter } from '@zip.js/zip.js';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  test(`exports Markdown with cropped raster frames in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 900 });
    const figure = page.locator('article#compare figure').first();
    await figure.hover();
    await figure.getByRole('button', { name: 'Frame and image', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Frame width', exact: true }).fill('200');
    await page.getByRole('spinbutton', { name: 'Frame height', exact: true }).fill('200');
    await page.getByRole('spinbutton', { name: 'Zoom, %', exact: true }).fill('50');
    await page.getByRole('button', { name: 'Fill', exact: true }).click();
    const frame = figure.locator('.guide-image-frame');
    await frame.focus();
    for (let n = 0; n < 2; n++) await frame.press('ArrowRight');
    await page
      .locator('.guide-image-inspector')
      .getByRole('button', { name: 'Done', exact: true })
      .click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.evaluate(() => {
      const chunks: number[][] = [];
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: async () => ({
          createWritable: async () =>
            new WritableStream<Uint8Array>({
              write: (chunk) => {
                chunks.push(Array.from(chunk));
              },
            }),
        }),
      });
      Object.defineProperty(window, 'savedGuideZip', {
        configurable: true,
        get: () => chunks.flat(),
      });
    });
    await page
      .getByRole('button', { name: 'Save Markdown with images (ZIP)', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText('Markdown saved');
    const bytes = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'savedGuideZip');
      if (
        !Array.isArray(value) ||
        !value.every(
          (byte) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255
        )
      )
        throw new Error('Missing ZIP');
      return value;
    });
    const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)), {
      useWebWorkers: false,
    });
    try {
      const entries = await zip.getEntries();
      expect(entries.map((entry) => entry.filename)).toEqual([
        'guide.md',
        'images/0001.png',
        'images/0002.png',
      ]);
      const markdown = entries[0]!;
      const raster = entries[1]!;
      if (markdown.directory || raster.directory) throw new Error('Unexpected directory');
      expect(await markdown.getData(new TextWriter())).toContain('Compare two images');
      const png = await raster.getData(new Uint8ArrayWriter());
      await testInfo.attach(`markdown-frame-${theme}`, {
        body: Buffer.from(png),
        contentType: 'image/png',
      });
      const samples = await page.evaluate(async (data) => {
        const image = await createImageBitmap(
          new Blob([new Uint8Array(data)], { type: 'image/png' })
        );
        try {
          const canvas = new OffscreenCanvas(image.width, image.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(image, 0, 0);
          const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
          return {
            width: image.width,
            height: image.height,
            left: alpha(40, 100),
            middle: alpha(100, 100),
            right: alpha(170, 100),
            top: alpha(100, 40),
            shifted: alpha(155, 100),
          };
        } finally {
          image.close();
        }
      }, Array.from(png));
      expect(samples).toEqual({
        width: 200,
        height: 200,
        left: 0,
        middle: 255,
        right: 0,
        top: 0,
        shifted: 255,
      });
    } finally {
      await zip.close();
    }
  });
}
