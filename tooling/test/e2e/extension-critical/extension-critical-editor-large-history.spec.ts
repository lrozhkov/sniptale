import { Buffer } from 'node:buffer';
import { test, expect } from '../support/extension-fixture';

// The optional local fixture supports user-reported images without committing private assets.
const externalImage = process.env.SNIPTALE_LARGE_HISTORY_IMAGE;
test.use({ actionTimeout: 15000 });

test('large shared source keeps pencil Undo and Redo', async ({ page, extensionId }, info) => {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/editor/index.html`);
  const input = page.locator('[data-ui="editor.page.start"] input[type="file"]').first();
  await expect(input).toBeAttached();
  if (externalImage) {
    await input.setInputFiles(externalImage);
  } else {
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 1536;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(canvas.width, canvas.height);
      let value = 123456789;
      for (let i = 0; i < image.data.length; i++) {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        image.data[i] = i % 4 === 3 ? 255 : value & 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    });
    expect(data.length).toBeGreaterThan(8 * 1024 * 1024);
    await input.setInputFiles({
      name: 'Large source.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.split(',')[1]!, 'base64'),
    });
  }
  const canvas = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-ui="editor.page.open-loading"]')).toHaveCount(0);
  await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
  const box = (await page.locator('[data-ui="editor.canvas.document-boundary"]').boundingBox())!;
  const viewport = page.viewportSize()!;
  const left = Math.max(box.x, 30);
  const right = Math.min(box.x + box.width, viewport.width - 400);
  const top = Math.max(box.y, 100);
  const bottom = Math.min(box.y + box.height, viewport.height - 100);
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + Math.min(10, (right - left) / 4),
    y + Math.min(40, (bottom - top) / 4),
    { steps: 6 }
  );
  await page.mouse.up();
  const layers = page.locator('[data-ui="editor.layers.list-viewport"] > div');
  await expect(layers).toHaveCount(2);
  const undo = page.locator('[data-ui="editor.floating.tool-rail.history.undo"]');
  const redo = page.locator('[data-ui="editor.floating.tool-rail.history.redo"]');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(layers).toHaveCount(1);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(layers).toHaveCount(2);
  await expect(undo).toBeEnabled();
  await page.screenshot({
    path: info.outputPath('large-source-pencil-restored.png'),
    fullPage: false,
  });
});
