import { createCanvas, loadImage } from 'canvas';
import { test, expect } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

const TEXT = 'привет\n123\n32132312\n3213233\n312321318623\n312321321312';

async function rowCenters(buffer: Buffer) {
  const image = await loadImage(buffer);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const bands: Array<{ top: number; bottom: number }> = [];
  for (let y = 0; y < image.height; y++) {
    let ink = false;
    for (let x = 0; x < image.width; x++) {
      const index = (y * image.width + x) * 4;
      if (pixels[index]! < 80 && pixels[index + 1]! < 80 && pixels[index + 2]! < 80) {
        ink = true;
        break;
      }
    }
    if (!ink) continue;
    const last = bands.at(-1);
    if (last && last.bottom === y) last.bottom = y + 1;
    else bands.push({ top: y, bottom: y + 1 });
  }
  return bands.map((band) => (band.top + band.bottom) / 2);
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`late font loading keeps pointer caret and selection on actual glyphs ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    let releaseFonts = () => {};
    const fontsReleased = new Promise<void>((resolve) => {
      releaseFonts = resolve;
    });
    await page.route('**/fonts/marck-script-*.woff2', async (route) => {
      await fontsReleased;
      await route.continue();
    });
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
      editorBootstrapPayload: { dataUrl, title: 'Text pointer selection' },
    });
    try {
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page
        .locator('[data-ui="content.toolbar.drawing-options.text.font-handwritten"]')
        .click();
      await page.locator('[data-ui="content.toolbar.drawing-options.text.size-24"]').click();
      const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
      if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
      await page
        .locator(
          '[data-ui="content.toolbar.drawing-options.text.background-colors"] button[title="#ff7f50"]'
        )
        .click();
      const boundary = (await page
        .locator('[data-ui="editor.canvas.document-boundary"]')
        .boundingBox())!;
      await page.mouse.click(boundary.x + 140, boundary.y + 100);
      const input = page.locator('textarea[data-fabric="textarea"]');
      await page.keyboard.insertText(TEXT);
      await expect(input).toHaveValue(TEXT);
      expect(
        await page.evaluate(
          (text) => document.fonts.check('24px "Sniptale Handwritten"', text),
          TEXT
        )
      ).toBe(false);
      releaseFonts();
      await page.evaluate((text) => document.fonts.load('24px "Sniptale Handwritten"', text), TEXT);
      const object = (await page.evaluate(() =>
        window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .find((object) => object['sniptaleType'] === 'text')
      ))!;
      const geometry = await page.evaluate((text) => {
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = '24px "Sniptale Handwritten"';
        const lines = text.split('\n');
        return {
          origin:
            6 -
            Math.min(0, ...lines.map((line) => -context.measureText(line).actualBoundingBoxLeft)),
          prefixes: lines.map((line) =>
            Array.from(
              { length: line.length + 1 },
              (_, index) => context.measureText(line.slice(0, index)).width
            )
          ),
        };
      }, TEXT);
      const clip = {
        x: Math.floor(boundary.x + Number(object['left']) - 2),
        y: Math.floor(boundary.y + Number(object['top']) - 2),
        width: Math.ceil(Number(object['width']) + 4),
        height: Math.ceil(Number(object['height']) + 4),
      };
      const loadedPng = await page.screenshot({
        path: info.outputPath('loaded-glyphs.png'),
        clip,
        fullPage: false,
      });
      const centers = await rowCenters(loadedPng);
      const image = await loadImage(loadedPng);
      const paint = createCanvas(image.width, image.height).getContext('2d');
      paint.drawImage(image, 0, 0);
      const leftEdges = centers.map((y) => {
        const pixels = paint.getImageData(0, Math.floor(y), image.width, 1).data;
        for (let x = 0; x < image.width; x++)
          if (pixels[x * 4]! > 240 && pixels[x * 4 + 1]! < 180 && pixels[x * 4 + 2]! < 110)
            return x;
        throw new Error('Missing row background');
      });
      expect(
        Math.max(...leftEdges) - Math.min(...leftEdges),
        'letters and digits share the same background column'
      ).toBeLessThanOrEqual(1);
      expect(centers).toHaveLength(6);
      const lines = TEXT.split('\n');
      for (const row of [1, 2, 4])
        for (const index of [0, 1, Math.floor(lines[row]!.length / 2), lines[row]!.length]) {
          await page.mouse.click(
            boundary.x +
              Number(object['left']) +
              geometry.origin +
              geometry.prefixes[row]![index]! +
              0.1,
            clip.y + centers[row]!
          );
          const offset =
            lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0) + index;
          await expect.poll(() => input.evaluate((element) => element.selectionStart)).toBe(offset);
          await expect(input).toHaveValue(TEXT);
        }
      const row = 2;
      const left = boundary.x + Number(object['left']) + geometry.origin;
      await page.mouse.move(left, clip.y + centers[row]!);
      await page.mouse.down();
      await page.mouse.move(left + geometry.prefixes[row]!.at(-1)! + 0.5, clip.y + centers[row]!, {
        steps: 12,
      });
      await page.mouse.up();
      expect(
        await input.evaluate((element) =>
          element.value.slice(element.selectionStart, element.selectionEnd)
        )
      ).toBe(lines[row]);
      await page.screenshot({
        path: info.outputPath('selection-matches-glyphs.png'),
        fullPage: false,
      });
      await page.keyboard.press('Control+a');
      expect(
        await input.evaluate((element) => [element.selectionStart, element.selectionEnd])
      ).toEqual([0, TEXT.length]);
      await page.keyboard.insertText('Изменено\n45');
      await page.keyboard.press('Enter');
      await expect(input).toHaveCount(0);
      const committed = await page.evaluate(() =>
        window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .find((object) => object['sniptaleType'] === 'text')
      );
      expect(committed).toBeDefined();
      await page.mouse.dblclick(
        boundary.x + Number(committed!['left']) + 15,
        boundary.y + Number(committed!['top']) + 15
      );
      await expect(input).toHaveValue('Изменено\n45');
      await page.keyboard.press('Control+a');
      expect(await input.evaluate((element) => element.selectionEnd)).toBe('Изменено\n45'.length);
      await page.keyboard.insertText('Отменённое изменение');
      await page.keyboard.press('Escape');
      await expect(input).toHaveCount(0);
      expect(
        await page.evaluate(() =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .filter((object) => object['sniptaleType'] === 'text')
        )
      ).toEqual([committed]);
      await page.screenshot({
        path: info.outputPath('reedit-cancel-restored.png'),
        fullPage: false,
      });
    } finally {
      releaseFonts();
      await page.close();
    }
  });
}

async function glyphPaint(png: Buffer) {
  const image = await loadImage(png);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const ink = new Uint8Array(image.width * image.height);
  for (let index = 0; index < ink.length; index++) {
    const r = pixels[index * 4]!,
      g = pixels[index * 4 + 1]!,
      b = pixels[index * 4 + 2]!;
    // Black glyphs on coral or white; exclude the blue interaction chrome.
    ink[index] = r < 160 && r + 1 >= g && g + 1 >= b ? 255 - r : 0;
  }
  return ink;
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`editing keeps glyph pixels fixed across canvas zoom ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    test.setTimeout(180_000);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 480;
      const paint = canvas.getContext('2d')!;
      paint.fillStyle = '#fff';
      paint.fillRect(0, 0, 900, 480);
      return canvas.toDataURL();
    });
    await applyHarnessBootstrap(page, {
      editorBootstrapPayload: { dataUrl, title: 'Stable text paint' },
    });
    try {
      for (const size of [24, 36])
        for (const zoom of [0.5, 0.75, 1, 1.25, 1.5]) {
          await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
          await expect
            .poll(() =>
              page.evaluate(
                () => window.__sniptaleEditorHarness?.getInteractionState().historyReady
              )
            )
            .toBe(true);
          await page.evaluate(
            async ({ size, zoom }) => {
              await document.fonts.load(`${size}px "Sniptale Handwritten"`, 'привет1текст');
              window.__sniptaleEditorHarness!.setZoomLevel(zoom);
            },
            { size, zoom }
          );
          await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
          await page
            .locator('[data-ui="content.toolbar.drawing-options.text.font-handwritten"]')
            .click();
          await page
            .locator(`[data-ui="content.toolbar.drawing-options.text.size-${size}"]`)
            .click();
          const fill = page.locator(
            '[data-ui="content.toolbar.drawing-options.text.background-none"]'
          );
          if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
          const boundary = (await page
            .locator('[data-ui="editor.canvas.document-boundary"]')
            .boundingBox())!;
          const scale = boundary.width / 900;
          await page.mouse.click(boundary.x + 300 * scale, boundary.y + 230 * scale);
          await page.keyboard.insertText('привет\n1 текст');
          await page.keyboard.press('Enter');
          await page.keyboard.press('Escape');
          const object = (await page.evaluate(() =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .find((object) => object['sniptaleType'] === 'text')
          ))!;
          const clip = {
            x: Math.floor(boundary.x + Number(object['left']) * scale) - 1,
            y: Math.floor(boundary.y + Number(object['top']) * scale) - 1,
            width: Math.ceil(Number(object['width']) * scale) + 3,
            height: Math.ceil(Number(object['height']) * scale) + 3,
          };
          const before = await glyphPaint(
            await page.screenshot({
              path: info.outputPath(`paint-before-${size}-${zoom}.png`),
              clip,
              fullPage: false,
            })
          );
          expect(
            before.reduce((sum, value) => sum + value, 0),
            'the control image contains visible glyphs'
          ).toBeGreaterThan(1000);
          await page.mouse.dblclick(
            boundary.x + (Number(object['left']) + Number(object['width']) / 2) * scale,
            boundary.y + (Number(object['top']) + Number(object['height']) / 4) * scale
          );
          const input = page.locator('textarea[data-fabric="textarea"]');
          await expect(input).toHaveValue('привет\n1 текст');
          await input.press('End');
          const during = await glyphPaint(
            await page.screenshot({
              path: info.outputPath(`paint-during-${size}-${zoom}.png`),
              clip,
              fullPage: false,
            })
          );
          expect(
            during.reduce((sum, value, index) => sum + Math.abs(value - before[index]!), 0),
            `${size}px ${zoom}: entering edit preserves glyph pixels`
          ).toBe(0);
          await input.press('Enter');
          await page.keyboard.press('Escape');
          const after = await glyphPaint(
            await page.screenshot({
              path: info.outputPath(`paint-after-${size}-${zoom}.png`),
              clip,
              fullPage: false,
            })
          );
          expect(
            after.reduce((sum, value, index) => sum + Math.abs(value - before[index]!), 0),
            `${size}px ${zoom}: leaving edit preserves glyph pixels`
          ).toBe(0);
        }
    } finally {
      await page.close();
    }
  });
}

for (const width of [1280, 1920]) {
  test(`pasted tabs keep native input and painted glyph stops aligned ${width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width === 1280 ? 560 : 900 });
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
      editorBootstrapPayload: { dataUrl, title: 'Pasted tabs' },
    });
    try {
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`, { waitUntil: 'domcontentloaded' });
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page.locator('[data-ui="content.toolbar.drawing-options.text.font-sans"]').click();
      await page.locator('[data-ui="content.toolbar.drawing-options.text.size-36"]').click();
      const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
      if ((await fill.getAttribute('aria-pressed')) !== 'false') await fill.click();
      const boundary = (await page
        .locator('[data-ui="editor.canvas.document-boundary"]')
        .boundingBox())!;
      await page.mouse.click(boundary.x + 140, boundary.y + 100);
      const input = page.locator('textarea[data-fabric="textarea"]');
      await page.keyboard.insertText('I\tI');
      await expect(input).toHaveValue('I\tI');
      const nativeStop = await input.evaluate((node) => {
        const style = getComputedStyle(node);
        const mirror = document.createElement('span');
        mirror.style.cssText = 'position:fixed;left:0;top:0;white-space:pre;';
        mirror.style.font = style.font;
        mirror.style.tabSize = style.tabSize;
        mirror.textContent = node.value;
        document.body.append(mirror);
        const range = document.createRange();
        range.setStart(mirror.firstChild!, 0);
        range.setEnd(mirror.firstChild!, 1);
        const first = range.getBoundingClientRect().left;
        range.setStart(mirror.firstChild!, 2);
        range.setEnd(mirror.firstChild!, 3);
        const stop = range.getBoundingClientRect().left - first;
        mirror.remove();
        return stop;
      });
      const buffer = await page.screenshot({
        path: info.outputPath('pasted-tabs-editing.png'),
        clip: (await input.boundingBox())!,
        fullPage: false,
      });
      const image = await loadImage(buffer);
      const pixels = createCanvas(image.width, image.height).getContext('2d');
      pixels.drawImage(image, 0, 0);
      const data = pixels.getImageData(0, 0, image.width, image.height).data;
      const columns: number[] = [];
      for (let x = 0; x < image.width; x++) {
        for (let y = 0; y < image.height; y++) {
          const i = (y * image.width + x) * 4;
          if (data[i]! < 100 && data[i + 1]! < 100 && data[i + 2]! < 100) {
            columns.push(x);
            break;
          }
        }
      }
      const starts = columns.filter((x, i) => i === 0 || x - columns[i - 1]! > 2);
      expect(starts).toHaveLength(2);
      expect(Math.abs(starts[1]! - starts[0]! - nativeStop)).toBeLessThanOrEqual(1);
      await input.press('Enter');
      await expect(input).toHaveCount(0);
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('I\tI');
    } finally {
      await page.close();
    }
  });
}
