import { expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

test('exports only framed pixels, applies bulk overrides and restores inheritance locally', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  const figure = page.locator('article#compare figure').first();
  await figure.hover();
  await figure.getByRole('button', { name: 'Frame and image', exact: true }).click();
  for (const [name, value] of [
    ['Frame width', '200'],
    ['Frame height', '200'],
    ['Zoom, %', '50'],
  ]) {
    const input = page.getByRole('textbox', { name, exact: true });
    await input.fill(value!);
    await input.press('Enter');
  }
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  const frame = figure.locator('.guide-image-frame');
  await frame.focus();
  await frame.press('ArrowRight');
  await frame.press('ArrowRight');
  await page
    .locator('.guide-image-inspector')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
  await page.getByRole('button', { name: 'Select all images', exact: true }).click();
  await page.getByRole('button', { name: 'Saved content', exact: true }).click();
  await page.getByRole('option', { name: 'Visible frame', exact: true }).click();
  await expect(
    page.locator('.guide-html-thumbnail small').filter({ hasText: 'Override' })
  ).toHaveCount(2);
  await page.getByRole('switch', { name: 'Click to view', exact: true }).click();
  await page.getByRole('button', { name: 'Select image 2', exact: true }).click();
  await page.getByRole('switch', { name: 'Click to view', exact: true }).click();
  await testInfo.attach('html-overrides', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await installSink(page);
  await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
  await expect(page.locator('.guide-html-settings > [role=status]')).toHaveText('HTML saved');
  const html = await page.evaluate(() => {
    const value: unknown = Reflect.get(window, 'savedGuideHtml');
    if (typeof value !== 'string') throw new Error('No HTML');
    return value;
  });
  await page.getByRole('button', { name: 'Restore guide defaults', exact: true }).click();
  await expect(
    page.locator('.guide-html-thumbnail small').filter({ hasText: 'Override' })
  ).toHaveCount(1);
  const file = testInfo.outputPath('cropped.html');
  await writeFile(file, html);
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByRole('button', { name: 'Open image', exact: true })).toHaveCount(1);
  expect(await page.locator('defs image').count()).toBe(2);
  const samples = await page
    .locator('defs image')
    .first()
    .evaluate(async (node) => {
      const image = new Image();
      image.src = node.getAttribute('href')!;
      await image.decode();
      const bitmap = await createImageBitmap(image);
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0);
        const alpha = (x: number, y: number) => ctx.getImageData(x, y, 1, 1).data[3];
        return {
          width: bitmap.width,
          height: bitmap.height,
          left: alpha(40, 100),
          middle: alpha(100, 100),
          right: alpha(170, 100),
          top: alpha(100, 40),
          shifted: alpha(155, 100),
        };
      } finally {
        bitmap.close();
      }
    });
  expect(samples).toEqual({
    width: 200,
    height: 200,
    left: 0,
    middle: 255,
    right: 0,
    top: 0,
    shifted: 255,
  });
  await page.getByRole('button', { name: 'Open image', exact: true }).click();
  await expect(page.locator('dialog img')).toHaveJSProperty('naturalWidth', 200);
  await page.keyboard.press('Escape');
  const before = await page.locator('.guide-image-frame').first().screenshot();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
  await page.reload();
  await expect(page.locator('[data-guide-open]')).toBeHidden();
  expect(await page.locator('.guide-image-frame').first().screenshot()).toEqual(before);
  await cdp.send('Emulation.setScriptExecutionDisabled', { value: false });
  await page.context().setOffline(false);
});

async function installSink(page: Page) {
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
    Object.defineProperty(window, 'savedGuideHtml', {
      configurable: true,
      get: () => chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''),
    });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`keeps Russian export controls usable at minimum size in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1024, height: 640 });
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    await page.locator('.guide-html-export button').first().click();
    await page.getByRole('switch', { name: 'Оптимизировать размер', exact: true }).click();
    await page.getByRole('button', { name: 'Качество WebP', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.guide-html-workbench')).toBeVisible();
    const bounds = await page.locator('.guide-html-workbench').boundingBox();
    expect(bounds?.height).toBe(640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
    await page.getByRole('button', { name: 'Рассчитать размер', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Сохранить HTML', exact: true })).toBeEnabled();
    await testInfo.attach(`html-ru-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'К просмотру сценария', exact: true }).click();
    await expect(page.locator('.guide-html-export button').first()).toBeFocused();
  });
}
