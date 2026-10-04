import { expect, type Page, type Locator } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';
import { insertGuideBlock } from './scenario-editor-visual.state-steps';

test('exports only framed pixels, applies bulk overrides and restores inheritance locally', async ({
  page,
  hostOrigin,
}, testInfo) => {
  await openVisualHarness(page, hostOrigin, 'light', 'en', { width: 1280, height: 900 });
  const figure = page.locator('article#compare [data-block-id="before"]');
  await figure.locator('img').click();
  const framing = figure.getByRole('button', { name: 'Frame and image', exact: true });
  await expect(framing).toBeVisible();
  await framing.click();
  await figure.getByRole('button', { name: 'Keep image inside frame', exact: true }).click();
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
  await figure.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
  await page.getByRole('button', { name: 'Select all images', exact: true }).click();
  await page.getByRole('button', { name: 'Saved content', exact: true }).click();
  await page.getByRole('option', { name: 'Visible frame', exact: true }).click();
  await expect(
    page.locator('.guide-html-thumbnail small').filter({ hasText: 'Override' })
  ).toHaveCount(2);
  await expect(page.getByRole('switch', { name: 'Click to view', exact: true })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Click to view', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Select image 1', exact: true }).click();
  await page.getByRole('button', { name: 'Saved content', exact: true }).click();
  await page.getByRole('option', { name: 'Full image', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Click to view', exact: true })).toBeChecked();
  await testInfo.attach('html-overrides', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await installSink(page);
  await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
  await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
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
  await expect(page.locator('dialog img')).toHaveJSProperty('naturalWidth', 960);
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
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 560 });
    await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
    await page.locator('.guide-html-export button').first().click();
    await page.getByRole('switch', { name: 'Оптимизировать размер', exact: true }).click();
    await page.getByRole('button', { name: 'Качество WebP', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.guide-html-workbench')).toBeVisible();
    const bounds = await page.locator('.guide-html-workbench').boundingBox();
    expect(bounds?.height).toBe(720);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
    await page.getByRole('button', { name: 'Рассчитать размер', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Сохранить HTML', exact: true })).toBeEnabled();
    await testInfo.attach(`html-ru-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Вернуться к экспорту', exact: true }).click();
    await expect(page.locator('.guide-html-export button').first()).toBeFocused();
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`caption alignment persists through both inspector modes and export in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 800 });
    const image = page.locator('[data-block-id="before"]');
    const caption = image.locator('figcaption');
    await image.locator('img').click();
    const inspector = page.locator('.guide-image-inspector');
    await inspector
      .locator('nav')
      .getByRole('button', { name: 'Description', exact: true })
      .click();
    const alignment = inspector.getByRole('group', { name: 'Caption alignment', exact: true });
    await expect(caption).toHaveCSS('text-align', 'center');
    const width = (await image.boundingBox())!.width;
    for (const [label, value] of [
      ['Start', 'start'],
      ['Center', 'center'],
      ['End', 'end'],
    ] as const) {
      await alignment.getByRole('button', { name: label, exact: true }).click();
      await expectCaptionAlignment(caption, value);
      expect((await image.boundingBox())!.width).toBeCloseTo(width, 1);
    }
    await page.getByRole('button', { name: 'Show all settings', exact: true }).click();
    await expect(alignment.getByRole('button', { name: 'End', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await alignment.getByRole('button', { name: 'Start', exact: true }).click();
    await page.locator('.guide-history-controls button').first().click();
    await expect(caption).toHaveCSS('text-align', 'end');
    await expect(page.locator('[data-ui="autosave-control"] button')).toHaveAttribute(
      'aria-label',
      /Saved|Сохранено/u
    );
    await page.reload();
    await expect(caption).toHaveCSS('text-align', 'end');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.locator('.guide-reader figcaption').first()).toHaveCSS('text-align', 'end');
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.guide-print figcaption').first()).toHaveCSS('text-align', 'end');
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: 'Back to export', exact: true }).click();
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await installSink(page);
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    const html = await page.evaluate(() => {
      const value: unknown = Reflect.get(window, 'savedGuideHtml');
      if (typeof value !== 'string') throw new Error('Missing exported HTML');
      return value;
    });
    const file = testInfo.outputPath('caption-alignment.html');
    await writeFile(file, html);
    await page.context().setOffline(true);
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('article figcaption').first()).toHaveCSS('text-align', 'end');
    const open = page.getByRole('button', { name: 'Open image', exact: true }).first();
    await open.click();
    await expectCaptionAlignment(page.locator('dialog figcaption'), 'end');
    await page.screenshot({ path: `.tmp/backlog7/b12-caption-${theme}.png` });
    await page.keyboard.press('Escape');
    await open.evaluate((element) =>
      element.setAttribute('data-caption-alignment', 'url(https://invalid.example/)')
    );
    await open.click();
    await expect(page.locator('dialog figcaption')).toHaveCSS('text-align', 'center');
    await page.context().setOffline(false);
  });
}

async function expectCaptionAlignment(caption: Locator, alignment: 'start' | 'center' | 'end') {
  await expect(caption).toHaveCSS('text-align', alignment);
  const geometry = await caption.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const left = bounds.left + parseFloat(style.paddingLeft);
    const right = bounds.right - parseFloat(style.paddingRight);
    return {
      start: text.left - left,
      end: right - text.right,
      center: (text.left + text.right - left - right) / 2,
    };
  });
  expect(Math.abs(geometry[alignment])).toBeLessThan(1);
}

for (const theme of ['light', 'dark'] as const) {
  test(`guide boundaries preserve geometry and stay out of outputs in ${theme}`, async ({
    page,
    hostOrigin,
  }) => {
    await openVisualHarness(page, hostOrigin, theme, 'en', { width: 1280, height: 560 });
    const step = page.locator('article#compare');
    for (const label of ['Heading', 'Note', 'Image']) {
      await step.focus();
      await step.locator('.guide-insertion-block[data-end="true"]').scrollIntoViewIfNeeded();
      await insertGuideBlock(page, step, label);
      if (label !== 'Image')
        await expect(
          step.locator('.guide-block').last().locator('input, textarea').first()
        ).toBeFocused();
    }
    await page.locator('main.guide-page').focus();
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    const document = page.locator('.guide-document');
    const toggle = page.getByRole('button', { name: 'Show boundaries', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const before = await boundaryGeometry(document);
    for (const kind of ['heading', 'text', 'image', 'image-slot', 'note'])
      expect(before.map((block) => block.kind)).toContain(kind);
    await toggle.click();
    await expect(document).toHaveAttribute('data-show-boundaries', 'true');
    expect(await boundaryGeometry(document)).toEqual(before);
    const neutral = document.locator('.guide-block:not([data-selected="true"])');
    for (const block of await neutral.all())
      await expect(block).toHaveCSS('outline-style', 'solid');
    await page.screenshot({ path: `.tmp/backlog7/b14-boundaries-${theme}.png`, fullPage: false });
    await toggle.press('Space');
    await expect(document).not.toHaveAttribute('data-show-boundaries');
    expect(await boundaryGeometry(document)).toEqual(before);
    await toggle.press('Space');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await expect(page.locator('[data-show-boundaries]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to editing', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByRole('button', { name: 'Print / PDF', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('[data-show-boundaries]')).toHaveCount(0);
    await expect(page.locator('.guide-editor-viewport')).toHaveCSS('overflow', 'visible');
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: 'Back to export', exact: true }).click();
    await page.getByRole('button', { name: 'Save standalone HTML', exact: true }).click();
    await installSink(page);
    await page.getByRole('button', { name: 'Calculate size', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save HTML', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save HTML', exact: true }).click();
    await expect(page.locator('.guide-export-status')).toHaveText('HTML saved');
    const html = await page.evaluate(() => Reflect.get(window, 'savedGuideHtml'));
    expect(typeof html).toBe('string');
    expect(html).not.toContain('data-show-boundaries');
    await page.reload();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
}

async function boundaryGeometry(document: Locator) {
  return document.locator('.guide-block').evaluateAll((blocks) =>
    blocks.map((block) => {
      const rect = block.getBoundingClientRect();
      const controls = [
        ...block.querySelectorAll('.guide-block-actions, .guide-block-grip, .guide-block-width'),
      ].map((control) => {
        const style = getComputedStyle(control);
        return [style.visibility, style.opacity, style.pointerEvents];
      });
      return {
        kind: block.getAttribute('data-kind'),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        controls,
      };
    })
  );
}
