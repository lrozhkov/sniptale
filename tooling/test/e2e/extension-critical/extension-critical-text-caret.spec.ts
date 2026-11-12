import { createCanvas, loadImage } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function pixels(png: Buffer) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

async function caretInkGap(png: Buffer, edge: 'start' | 'end') {
  const image = await pixels(png);
  let inkLeft = image.width,
    inkRight = -1,
    caretLeft = image.width,
    caretRight = -1,
    blue = 0,
    ink = 0;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      const [r, g, b] = [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!];
      if (r < 245 && Math.max(r, g, b) - Math.min(r, g, b) < 3) {
        ink++;
        inkLeft = Math.min(inkLeft, x);
        inkRight = Math.max(inkRight, x);
      }
      const opacity = (255 - r) / (255 - 37);
      if (
        opacity > 0.3 &&
        Math.abs(g - (255 - opacity * 156)) <= 1.5 &&
        Math.abs(b - (255 - opacity * 20)) <= 1.5
      ) {
        blue++;
        caretLeft = Math.min(caretLeft, x);
        caretRight = Math.max(caretRight, x);
      }
    }
  return { blue, ink, gap: edge === 'end' ? caretLeft - inkRight - 1 : inkLeft - caretRight - 1 };
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`handwritten Russian caret follows ink and baselines use shared spacing ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, 900, 480);
      return canvas.toDataURL();
    });
    await applyHarnessBootstrap(page, {
      editorBootstrapPayload: { dataUrl, title: 'Caret and line spacing' },
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      expect(
        await page.evaluate(
          async () => (await document.fonts.load('24px "Sniptale Handwritten"', 'тсПривет')).length
        )
      ).toBeGreaterThan(0);
      await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page
        .locator('[data-ui="content.toolbar.drawing-options.text.font-handwritten"]')
        .click();
      await page.locator('[data-ui="content.toolbar.drawing-options.text.size-24"]').click();
      const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
      if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
      const boundary = (await page
        .locator('[data-ui="editor.canvas.document-boundary"]')
        .boundingBox())!;
      const scale = boundary.width / 900;
      const start = { x: boundary.x + 140 * scale, y: boundary.y + 100 * scale };
      await page.mouse.click(start.x, start.y);
      const input = page.locator('textarea[data-fabric="textarea"]');
      const clip = {
        x: Math.floor(start.x - 5),
        y: Math.floor(start.y - 2),
        width: Math.ceil(250 * scale),
        height: Math.ceil(42 * scale),
      };
      for (const word of ['т', 'с', 'тс', 'ст', 'Привет']) {
        await page.keyboard.press('Control+a');
        await page.keyboard.insertText(word);
        await expect(input).toHaveValue(word);
        for (const edge of ['end', 'start'] as const) {
          await page.keyboard.press(edge === 'end' ? 'End' : 'Home');
          let observed = { blue: 0, ink: 0, gap: 0 };
          await expect
            .poll(async () => {
              observed = await caretInkGap(
                await page.screenshot({
                  path: info.outputPath(`caret-${word}-${edge}.png`),
                  caret: 'initial',
                  clip,
                  fullPage: false,
                }),
                edge
              );
              return observed.blue;
            })
            .toBeGreaterThan(5);
          expect(observed.ink).toBeGreaterThan(4);
          const expectedGap = await page.evaluate(
            ({ word, edge }) => {
              const input = document.querySelector<HTMLTextAreaElement>(
                'textarea[data-fabric="textarea"]'
              )!;
              const style = getComputedStyle(input);
              const context = document.createElement('canvas').getContext('2d')!;
              context.font = `${style.fontSize} ${style.fontFamily}`;
              const metrics = context.measureText(word);
              return edge === 'end'
                ? metrics.width - metrics.actualBoundingBoxRight
                : -metrics.actualBoundingBoxLeft - 1;
            },
            { word, edge }
          );
          // Native caret follows the browser advance; italic ink can cross that advance.
          expect(
            Math.abs(observed.gap - expectedGap),
            `${word} ${edge}: native advance alignment`
          ).toBeLessThanOrEqual(2);
        }
      }
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText('тс\nтс\nтс');
      const lineHeight = await input.evaluate((element) =>
        parseFloat(getComputedStyle(element).lineHeight)
      );
      await page.keyboard.press('Enter');
      await expect(input).toHaveCount(0);
      const exported = await page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
      if (!exported) throw new Error('Editor export is missing');
      const image = await pixels(Buffer.from(exported.split(',')[1]!, 'base64'));
      const text = await page.evaluate(() =>
        window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .find((object) => object['sniptaleType'] === 'text')
      );
      const left = Math.floor(Number(text?.['left']));
      const top = Math.floor(Number(text?.['top']));
      const bands: number[] = [];
      let last = -2;
      for (let y = top; y < Math.min(image.height, top + 110); y++) {
        let row = false;
        for (let x = left; x < Math.min(image.width, left + 100); x++) {
          const offset = (y * image.width + x) * 4;
          if (
            image.data[offset]! < 100 &&
            image.data[offset + 1]! < 100 &&
            image.data[offset + 2]! < 100
          ) {
            row = true;
            break;
          }
        }
        if (row) {
          if (y > last + 1) bands.push(y);
          last = y;
        }
      }
      expect(bands).toHaveLength(3);
      expect(bands[1]! - bands[0]!).toBeCloseTo(lineHeight, 0);
      expect(bands[2]! - bands[1]!).toBeCloseTo(lineHeight, 0);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath('handwritten-three-lines.png'),
        fullPage: false,
      });
    } finally {
      await page.close();
    }
  });
}
