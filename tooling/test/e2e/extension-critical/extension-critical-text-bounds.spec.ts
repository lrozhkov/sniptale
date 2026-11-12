import { createCanvas, loadImage } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function inkBounds(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let left = image.width,
    right = -1,
    top = image.height,
    bottom = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      if (pixels[offset]! < 254) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
  expect(right).toBeGreaterThan(left);
  return { left, right, top, bottom };
}

async function selectionPaintBounds(png: Buffer, kind: 'selection' | 'background', filled = false) {
  const image = await loadImage(png);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  let left = image.width,
    right = -1,
    top = image.height,
    bottom = -1;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      const r = pixels[offset]!,
        g = pixels[offset + 1]!,
        b = pixels[offset + 2]!;
      const matches =
        kind === 'selection'
          ? Math.abs(r - 207) <= 3 &&
            Math.abs(g - (filled ? 121 : 221)) <= 3 &&
            Math.abs(b - (filled ? 114 : 251)) <= 3
          : r > 240 && g > 90 && g < 180 && b < 110;
      if (!matches) continue;
      left = Math.min(left, x);
      right = Math.max(right, x + 1);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y + 1);
    }
  expect(right, `${kind} pixels must be visible`).toBeGreaterThan(left);
  return { left, right, top, bottom };
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`text selection fits real glyphs across fonts, sizes and backgrounds ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);

    const page = await context.newPage();
    await page.setViewportSize(viewport);
    page.setDefaultTimeout(10_000);
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 900, 480);
      return canvas.toDataURL();
    });
    await applyHarnessBootstrap(page, {
      editorBootstrapPayload: { dataUrl, title: 'Text bounds' },
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      for (const font of ['sans', 'serif', 'mono', 'handwritten'])
        for (const size of [16, 24, 36])
          for (const background of [false, true]) {
            await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
            await expect
              .poll(() =>
                page.evaluate(
                  () => window.__sniptaleEditorHarness?.getInteractionState().historyReady
                )
              )
              .toBe(true);
            await page.evaluate(async () => {
              await document.fonts.ready;
              if (!(await document.fonts.load('36px "Sniptale Handwritten"', 'привет')).length)
                throw new Error('Missing handwritten font');
              window.__sniptaleEditorHarness!.setZoomLevel(1);
            });
            await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
            await page
              .locator(`[data-ui="content.toolbar.drawing-options.text.font-${font}"]`)
              .click();
            await page
              .locator(`[data-ui="content.toolbar.drawing-options.text.size-${size}"]`)
              .click();
            const fill = page.locator(
              '[data-ui="content.toolbar.drawing-options.text.background-none"]'
            );
            if (((await fill.getAttribute('aria-pressed')) === 'true') !== background)
              await fill.click();
            const boundary = (await page
              .locator('[data-ui="editor.canvas.document-boundary"]')
              .boundingBox())!;
            if (background)
              await page
                .locator(
                  '[data-ui="content.toolbar.drawing-options.text.background-colors"] button[title="#ff7f50"]'
                )
                .click();
            await page.mouse.click(
              boundary.x + (140 * boundary.width) / 900,
              boundary.y + (100 * boundary.height) / 480
            );
            const input = page.locator('textarea[data-fabric="textarea"]');
            await expect(input).toHaveCount(1);
            await page.keyboard.insertText('привет');
            await page.keyboard.press('Control+a');
            const editing = (await page.evaluate(() =>
              window
                .__sniptaleEditorHarness!.getCanvasObjects()
                .find((object) => object['sniptaleType'] === 'text')
            ))!;
            const lineHeight = await input.evaluate((element) =>
              parseFloat(getComputedStyle(element).lineHeight)
            );
            const frame = {
              left: boundary.x + Number(editing['left']),
              top: boundary.y + Number(editing['top']),
              width: Number(editing['width']),
              height: Number(editing['height']),
            };
            const clip = {
              x: Math.floor(frame.left) - 2,
              y: Math.floor(frame.top) - 2,
              width: Math.ceil(frame.width) + 5,
              height: Math.ceil(frame.height) + 5,
            };
            const png = await page.screenshot({
              path: info.outputPath(`selection-cell-${font}-${size}-${background}.png`),
              clip,
              fullPage: false,
            });
            const selected = await selectionPaintBounds(png, 'selection', background);
            const gaps = [
              clip.x + selected.left - frame.left,
              frame.left + frame.width - clip.x - selected.right,
              clip.y + selected.top - frame.top,
              frame.top + frame.height - clip.y - selected.bottom,
            ];
            expect(
              Math.abs(Math.round(gaps[0]!) - Math.round(gaps[1]!)),
              `${font} ${size}: left/right ${gaps}`
            ).toBeLessThanOrEqual(1);
            expect(
              Math.abs(Math.round(gaps[2]!) - Math.round(gaps[3]!)),
              `${font} ${size}: top/bottom ${gaps}`
            ).toBeLessThanOrEqual(1);
            expect(
              Math.min(...gaps),
              'native selection stays inside the padded frame'
            ).toBeGreaterThanOrEqual(5);
            if (background) {
              const painted = await selectionPaintBounds(png, 'background');
              for (const delta of [
                clip.x + painted.left - frame.left,
                frame.left + frame.width - clip.x - painted.right,
                clip.y + painted.top - frame.top,
                frame.top + frame.height - clip.y - painted.bottom,
              ])
                expect(
                  Math.abs(delta),
                  'background and frame have the same outer edge'
                ).toBeLessThanOrEqual(1);
            }
            await page.keyboard.press('End');
            await page.keyboard.insertText('\nмир   \n\n');
            await expect(input).toHaveValue('привет\nмир   \n\n');
            await page.keyboard.press('Enter');
            await expect(input).toHaveCount(0);
            const object = await page.evaluate(() =>
              window
                .__sniptaleEditorHarness!.getCanvasObjects()
                .find((object) => object['sniptaleType'] === 'text')
            );
            expect(object).toBeTruthy();
            const ink = await inkBounds(
              await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())
            );
            const margins = [
              ink.left - Math.round(Number(object!['left'])),
              Math.round(Number(object!['left']) + Number(object!['width'])) - ink.right,
              ink.top - Math.round(Number(object!['top'])),
              Math.round(Number(object!['top']) + Number(object!['height'])) - ink.bottom,
            ];
            for (const margin of margins)
              expect(
                margin,
                `${font} ${size} bg=${background}: ink stays inside cells ${margins}`
              ).toBeGreaterThanOrEqual(5);
            expect(Number(object!['height'])).toBeCloseTo(frame.height + lineHeight, 4);
            if (font === 'handwritten' && size === 36 && background) {
              const beforeHistory = await page.evaluate(() =>
                window.__sniptaleEditorHarness!.renderImage()
              );
              await page.keyboard.press('Control+z');
              await expect
                .poll(() =>
                  page.evaluate(
                    () =>
                      window
                        .__sniptaleEditorHarness!.getCanvasObjects()
                        .filter((object) => object['sniptaleType'] === 'text').length
                  )
                )
                .toBe(0);
              await page.keyboard.press('Control+Shift+z');
              await expect
                .poll(() =>
                  page.evaluate(
                    () =>
                      window
                        .__sniptaleEditorHarness!.getCanvasObjects()
                        .filter((object) => object['sniptaleType'] === 'text').length
                  )
                )
                .toBe(1);
              expect(await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())).toBe(
                beforeHistory
              );
              await page.mouse.dblclick(
                boundary.x + ((Number(object!['left']) + 15) * boundary.width) / 900,
                boundary.y + ((Number(object!['top']) + 15) * boundary.height) / 480
              );
              await expect(input).toHaveValue('привет\nмир   \n\n');
              await page.keyboard.press('Control+a');
              await page.keyboard.insertText('Длинная замена для проверки отмены');
              await page.keyboard.press('Escape');
              expect(await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage())).toBe(
                beforeHistory
              );
              await page.mouse.dblclick(
                boundary.x + ((Number(object!['left']) + 15) * boundary.width) / 900,
                boundary.y + ((Number(object!['top']) + 15) * boundary.height) / 480
              );
              await expect(input).toHaveValue('привет\nмир   \n\n');
              await page.keyboard.press('Control+a');
              await page.keyboard.insertText('Длинный русский текст');
              await page.keyboard.press('Enter');
              const edited = await page.evaluate(() =>
                window
                  .__sniptaleEditorHarness!.getCanvasObjects()
                  .find((object) => object['sniptaleType'] === 'text')
              );
              expect(Number(edited!['width'])).toBeGreaterThan(Number(object!['width']) + 30);
              expect(Number(edited!['height'])).toBeLessThan(Number(object!['height']));
            }
            if (size === 24 && background)
              await page.screenshot({
                path: info.outputPath(`bounds-${font}.png`),
                fullPage: false,
              });
          }
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
}
