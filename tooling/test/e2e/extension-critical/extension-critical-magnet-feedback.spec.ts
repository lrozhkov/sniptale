import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

type Point = { x: number; y: number };
type Mode = 'page' | 'crop';
const GUIDE = '[data-ui="content.drawing.alignment-guides"]';
const MARKER = '[data-ui="content.drawing.alignment-marker"]';
const BRACKET = '[data-ui="content.drawing.alignment-bracket"]';

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    test(`double-click removes only authored arrow bends ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        const { surface, toolbar } = await prepare(page, mode);
        const arrow = toolbar.locator('[data-ui="content.toolbar.drawing.arrow"]');
        await arrow.click();
        const freehand = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.arrow.freehand"]'
        );
        if (!(await freehand.isVisible())) await arrow.click();
        await freehand.click();
        const ink = surface.locator('canvas.sniptale-drawing-canvas').first();
        const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        const pixels = () =>
          ink.evaluate((node) => {
            if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
            return node.toDataURL();
          });
        const redo = page.locator(
          `[data-ui="${mode === 'crop' ? 'content.crop.redo' : 'content.toolbar.history-redo-button'}"]`
        );
        const objects = surface.getByRole('button', { name: /^Object \d+$/u });
        await drag(page, { x: 400, y: 200 }, { x: 800, y: 200 });
        await page.mouse.move(900, 420);
        const straight = await pixels();
        for (const point of [
          { x: 400, y: 200 },
          { x: 800, y: 200 },
          { x: 500, y: 200 },
        ]) {
          await page.mouse.dblclick(point.x, point.y, { delay: 30 });
          await expect.poll(pixels).toBe(straight);
        }
        await drag(page, { x: 600, y: 200 }, { x: 600, y: 280 });
        await page.mouse.move(900, 420);
        await expect
          .poll(async () => (await corePixels(ink, { x: 600, y: 280 })).painted)
          .toBeGreaterThan(0);
        const bent = await pixels();
        expect(bent).not.toBe(straight);
        for (const point of [
          { x: 400, y: 200 },
          { x: 800, y: 200 },
        ]) {
          await page.mouse.dblclick(point.x, point.y, { delay: 30 });
          await expect.poll(pixels).toBe(bent);
        }
        await page.mouse.dblclick(612, 280, { delay: 30 });
        await expect.poll(pixels).toBe(straight);
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await expect(objects).toHaveCount(1);
        await expect
          .poll(async () => (await corePixels(chrome, { x: 600, y: 280 })).painted)
          .toBe(0);
        await page.screenshot({
          path: info.outputPath('arrow-last-bend-removed.png'),
          fullPage: false,
        });
        await undoDrawing(page, mode);
        await expect.poll(pixels).toBe(bent);
        await redo.click();
        await expect.poll(pixels).toBe(straight);
        await undoDrawing(page, mode);
        await expect.poll(pixels).toBe(bent);
        await page.mouse.click(600, 280);
        await page.mouse.dblclick(600, 280, { delay: 30 });
        await expect.poll(pixels).toBe(straight);
        await undoDrawing(page, mode);
        await expect.poll(pixels).toBe(bent);
        await expect(objects).toHaveCount(1);
        await page.screenshot({
          path: info.outputPath('arrow-bend-removal-undo.png'),
          fullPage: false,
        });
      } finally {
        await page.mouse.up();
        await popup.close();
        await page.close();
      }
    });
  }
}

async function drag(page: Page, start: Point, end: Point) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

async function prepare(page: Page, mode: Mode) {
  await page.evaluate(() => {
    const main = document.querySelector('main');
    const measurement = document.getElementById('measurement-target')?.parentElement;
    if (main instanceof HTMLElement) main.style.display = 'none';
    if (measurement) measurement.style.display = 'none';
  });
  if (mode === 'page') {
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
  } else {
    if (!(await page.locator('[data-ui="content.toolbar.timer-button"]').count())) {
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      await page.locator('[data-ui="content.toolbar.settings.show-hidden-buttons"]').click();
      const compact = page.getByRole('button', { name: /^Compact menu view/u });
      if ((await compact.getAttribute('aria-pressed')) !== 'true') await compact.click();
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-ui="content.toolbar.timer-button"]').click();
    await page
      .locator('[data-ui="content.toolbar.timer-menu"]')
      .getByText('No delay', { exact: true })
      .click();
    await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
    await drag(page, { x: 250, y: 120 }, { x: 1050, y: 500 });
    const drawingMode = page.locator('[data-ui="content.crop.mode.drawing"]');
    if ((await drawingMode.getAttribute('data-active')) !== 'true') await drawingMode.click();
  }
  return {
    surface: page.locator(
      mode === 'crop'
        ? '[data-ui="content.crop.drawing-layer"]'
        : '[data-ui="content.drawing.surface"]'
    ),
    toolbar: page.locator(
      mode === 'crop' ? '[data-ui="content.crop.drawing-slot"]' : '[data-ui="content.toolbar.root"]'
    ),
  };
}

async function domTargets(
  page: Page,
  boxes: Array<{ x: number; y: number; width: number; height: number }>,
  scale = 1
) {
  await page.evaluate(
    ({ boxes, scale }) => {
      document.querySelectorAll('[data-magnet-target]').forEach((node) => node.remove());
      for (const [index, box] of boxes.entries()) {
        const target = document.createElement('div');
        target.dataset['magnetTarget'] = String(index);
        target.textContent = `Layout box ${index + 1}`;
        target.style.cssText = `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;box-sizing:border-box;background:transparent;border:0;padding:8px;transform:scale(${scale});transform-origin:top left;color:#665a70`;
        document.body.append(target);
      }
    },
    { boxes, scale }
  );
}

async function center(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Drawing object has no visible geometry');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function moveText(page: Page, text: Locator, end: Point) {
  const start = await center(text);
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
}
async function expectCenter(text: Locator, wanted: Point) {
  await expect
    .poll(async () => {
      const actual = await center(text);
      return Math.max(Math.abs(actual.x - wanted.x), Math.abs(actual.y - wanted.y));
    })
    .toBeLessThanOrEqual(0.5);
}
async function expectAxis(guides: Locator, axis: 'x' | 'y', coordinate: number) {
  const lines = guides.locator(`[data-axis="${axis}"]`);
  await expect(guides).toBeVisible();
  await expect(lines.first()).toBeAttached();
  await expect
    .poll(async () =>
      lines.evaluateAll(
        (nodes, axis) => nodes.map((node) => Number(node.getAttribute(axis === 'x' ? 'x1' : 'y1'))),
        axis
      )
    )
    .toEqual(Array.from({ length: await lines.count() }, () => coordinate));
}
async function expectAxisCoordinates(guides: Locator, axis: 'x' | 'y', coordinates: number[]) {
  await expect(guides).toBeVisible();
  await expect
    .poll(() =>
      guides
        .locator(`[data-axis="${axis}"]`)
        .evaluateAll(
          (nodes, axis) =>
            [
              ...new Set(
                nodes.map((node) => Number(node.getAttribute(axis === 'x' ? 'x1' : 'y1')))
              ),
            ].sort((a, b) => a - b),
          axis
        )
    )
    .toEqual(coordinates);
}
async function expectDiamonds(guides: Locator, filled: boolean, count: number) {
  const markers = guides.locator(MARKER);
  await expect(markers).toHaveCount(count);
  for (const marker of await markers.all()) {
    await expect(marker).toHaveAttribute('data-filled', String(filled));
    const box = await marker.evaluate((node) => {
      if (!(node instanceof SVGGraphicsElement)) throw new Error('Marker geometry missing');
      const bounds = node.getBBox();
      const matrix = node.getScreenCTM();
      if (!matrix) throw new Error('Marker screen projection missing');
      return {
        width: Math.hypot(matrix.a, matrix.b) * bounds.width,
        height: Math.hypot(matrix.c, matrix.d) * bounds.height,
      };
    });
    expect(box.width).toBeCloseTo(8, 1);
    expect(box.height).toBeCloseTo(8, 1);
    await expect(marker).toHaveAttribute('stroke', 'var(--sniptale-color-canvas-magnet)');
  }
  // The visible image remains exposed: segments end six CSS pixels from each diamond center.
  const gaps = await guides.evaluate((node) => {
    const markers = Array.from(node.querySelectorAll('path')).map((marker) => marker.getBBox());
    return Array.from(node.querySelectorAll('line')).every((line) => {
      const axis = line.getAttribute('data-axis');
      const coordinate = Number(line.getAttribute(axis === 'x' ? 'x1' : 'y1'));
      const from = Number(line.getAttribute(axis === 'x' ? 'y1' : 'x1'));
      const to = Number(line.getAttribute(axis === 'x' ? 'y2' : 'x2'));
      return markers.every((box) => {
        const x = box.x + box.width / 2,
          y = box.y + box.height / 2;
        if (Math.abs((axis === 'x' ? x : y) - coordinate) > 0.01) return true;
        const stop = axis === 'x' ? y : x;
        return to <= stop - 6 + 0.01 || from >= stop + 6 - 0.01;
      });
    });
  });
  expect(gaps).toBe(true);
}

async function rectangle(page: Page, toolbar: Locator, start: Point, end: Point) {
  const shape = toolbar.locator('[data-ui="content.toolbar.drawing.shape"]');
  const option = toolbar.locator(
    '[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]'
  );
  if (!(await option.isVisible())) await shape.click();
  if (!(await option.isVisible())) await shape.click();
  await option.click();
  const fill = toolbar.locator('[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]');
  if ((await fill.getAttribute('aria-pressed')) === 'true') await fill.click();
  await drag(page, start, end);
}

// Read the actual painted document canvas, independently of the SVG feedback and selection layer.
async function inkBounds(surface: Locator) {
  return surface
    .locator('canvas.sniptale-drawing-canvas')
    .first()
    .evaluate((node) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing document canvas missing');
      const rect = node.getBoundingClientRect();
      const context = node.getContext('2d');
      if (!context) throw new Error('Drawing document context missing');
      const data = context.getImageData(0, 0, node.width, node.height).data;
      let left = node.width,
        top = node.height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < node.height; y++)
        for (let x = 0; x < node.width; x++) {
          if (data[(y * node.width + x) * 4 + 3]! < 80) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      const scale = node.width / rect.width;
      return {
        hasInk: right >= 0,
        left: rect.x + left / scale,
        top: rect.y + top / scale,
        right: rect.x + (right + 1) / scale,
        bottom: rect.y + (bottom + 1) / scale,
        centerX: rect.x + (left + right + 1) / 2 / scale,
        centerY: rect.y + (top + bottom + 1) / 2 / scale,
      };
    });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    test(`accepted DOM magnet centers and shared targets ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        await popup.evaluate(
          async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
          size.width === 1280 ? 'light' : 'dark'
        );
        const { surface, toolbar } = await prepare(page, mode);
        await domTargets(page, [{ x: 600, y: 180, width: 200, height: 120 }]);
        const target = page.locator('[data-magnet-target="0"]');
        const originalTarget = await target.boundingBox();
        await expect(target).toHaveCSS('border-top-width', '0px');
        await expect(target).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await toolbar.locator('[data-ui="content.toolbar.drawing.text"]').click();
        await page.mouse.click(350, 350);
        await page.locator('[data-ui="content.drawing.text-input"]').fill('Delivery');
        await page.keyboard.press('Enter');
        const text = surface.locator('[data-ui="content.drawing.text-object"]');
        await expect(text).toContainText('Delivery');
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        const guides = surface.locator(GUIDE);
        const initialText = (await text.boundingBox())!;
        const xOnlyY = 300 + initialText.height / 2 + 14;
        const yOnlyX = 800 + initialText.width / 2 + 14;

        await moveText(page, text, { x: 704, y: xOnlyY });
        await expectAxis(guides, 'x', 700);
        await expect(guides.locator('line').first()).toHaveCSS(
          'stroke',
          size.width === 1280 ? 'rgb(152, 84, 216)' : 'rgb(197, 154, 242)'
        );
        await expect(guides.locator('[data-axis="y"]')).toHaveCount(0);
        await expectCenter(text, { x: 700, y: xOnlyY });
        await expectDiamonds(guides, false, 1);
        await expect(guides.locator(BRACKET)).toHaveCount(2);
        await page.screenshot({ path: info.outputPath('dom-center-x-only.png'), fullPage: false });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        await expectCenter(text, { x: 700, y: xOnlyY });

        await moveText(page, text, { x: yOnlyX, y: 244 });
        await expectAxis(guides, 'y', 240);
        await expect(guides.locator('[data-axis="x"]')).toHaveCount(0);
        await expectCenter(text, { x: yOnlyX, y: 240 });
        await expectDiamonds(guides, false, 1);
        await page.screenshot({ path: info.outputPath('dom-center-y-only.png'), fullPage: false });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);

        await moveText(page, text, { x: 704, y: 244 });
        await expectAxis(guides, 'x', 700);
        await expectAxis(guides, 'y', 240);
        await expectCenter(text, { x: 700, y: 240 });
        await expectDiamonds(guides, true, 1);
        await expect(guides.locator(BRACKET)).toHaveCount(4);
        await expect(guides.locator('rect')).toHaveCount(0);
        await page.screenshot({ path: info.outputPath('dom-center-both.png'), fullPage: false });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        expect(await target.boundingBox()).toEqual(originalTarget);
        await expect(text).toHaveCount(1);

        await domTargets(page, [
          { x: 600, y: 180, width: 200, height: 60 },
          { x: 600, y: 300, width: 200, height: 60 },
        ]);
        await moveText(page, text, { x: 704, y: 270 });
        await expectAxis(guides, 'x', 700);
        await expect(guides.locator('[data-axis="y"]')).toHaveCount(0);
        await expectCenter(text, { x: 700, y: 270 });
        await expectDiamonds(guides, false, 2);
        // Two diamonds create three geometric segments of one shared accepted axis.
        await expect(guides.locator('[data-axis="x"]')).toHaveCount(3);
        await expect(guides.locator(BRACKET)).toHaveCount(4);
        await page.screenshot({
          path: info.outputPath('dom-two-centers-one-axis.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        await expectCenter(text, { x: 700, y: 240 });

        const textWidth = (await text.boundingBox())!.width;
        await domTargets(page, [
          { x: 600, y: 180, width: 200, height: 60 },
          { x: 720 + textWidth / 2, y: 244, width: 120, height: 60 },
        ]);
        await moveText(page, text, { x: 704, y: 278 });
        await expectAxis(guides, 'x', 700);
        await expectAxis(guides, 'y', 274);
        await expectCenter(text, { x: 700, y: 274 });
        await expectDiamonds(guides, false, 2);
        await expect(guides.locator('[data-filled="true"]')).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath('dom-axes-from-different-targets.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expectCenter(text, { x: 700, y: 240 });

        await domTargets(page, [{ x: 600, y: 180, width: 200, height: 120 }]);
        await moveText(page, text, { x: 704, y: xOnlyY });
        await expectAxis(guides, 'x', 700);
        await page.keyboard.down('Alt');
        await expect(guides).toHaveCount(0);
        await expectCenter(text, { x: 704, y: xOnlyY });
        await page.keyboard.up('Alt');
        await expectAxis(guides, 'x', 700);
        await page.mouse.up();
        await expectCenter(text, { x: 700, y: xOnlyY });
        await page.keyboard.down('Shift');
        await moveText(page, text, { x: 740, y: 244 });
        await expectAxis(guides, 'y', 240);
        await expect(guides.locator('[data-axis="x"]')).toHaveCount(0);
        await expectCenter(text, { x: 700, y: 240 });
        await page.mouse.up();
        await page.keyboard.up('Shift');
        await expect(guides).toHaveCount(0);
        expect(errors).toEqual([]);
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('failed-product-state.png'),
          fullPage: false,
        });
        await info.attach('failed-geometry', {
          body: JSON.stringify(
            await page
              .locator(
                '[data-ui="content.drawing.text-object"], [data-ui="content.drawing.alignment-guides"], canvas, [data-magnet-target]'
              )
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  rect: node.getBoundingClientRect().toJSON(),
                  html: node.outerHTML,
                }))
              )
          ),
          contentType: 'application/json',
        });
        throw error;
      } finally {
        await page.mouse.up();
        await popup.close();
        await page.close();
      }
    });

    test(`accepted resize edge and arrow point feedback ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        const { surface, toolbar } = await prepare(page, mode);
        await domTargets(page, [{ x: 620, y: 320, width: 180, height: 140 }]);
        await rectangle(page, toolbar, { x: 400, y: 160 }, { x: 616, y: 316 });
        const original = await inkBounds(surface);
        await page.mouse.move(616, 316);
        await page.mouse.down();
        await page.mouse.move(624, 324, { steps: 4 });
        const guides = surface.locator(GUIDE);
        await expectAxis(guides, 'x', 620);
        await expectAxis(guides, 'y', 320);
        const selectionChrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        await expect(selectionChrome).toHaveCSS('opacity', '1');
        await expect
          .poll(async () => (await corePixels(selectionChrome, { x: 620, y: 320 })).blue)
          .toBeGreaterThan(0);
        await expect(guides.locator(MARKER)).toHaveCount(0);
        await expect(guides.locator(BRACKET)).toHaveCount(4);
        await page.screenshot({ path: info.outputPath('resize-dom-edges.png'), fullPage: false });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        const resized = await inkBounds(surface);
        expect(resized.left).toBeCloseTo(original.left, 1);
        expect(resized.top).toBeCloseTo(original.top, 1);
        expect(resized.right - original.right).toBeCloseTo(4, 1);
        expect(resized.bottom - original.bottom).toBeCloseTo(4, 1);

        await page.mouse.move(620, 240);
        await page.mouse.down();
        await page.mouse.move(706, 240, { steps: 4 });
        await expectAxis(guides, 'x', 710);
        await expect(guides.locator('[data-axis="y"]')).toHaveCount(0);
        await expectDiamonds(guides, false, 1);
        await page.screenshot({
          path: info.outputPath('resize-dom-center-point.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        expect(await inkBounds(surface)).toEqual(resized);
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(500, 240);
        await page.keyboard.press('Delete');
        await expect.poll(async () => (await inkBounds(surface)).hasInk).toBe(false);

        await domTargets(page, [{ x: 600, y: 250, width: 160, height: 100 }]);
        const arrowTool = toolbar.locator('[data-ui="content.toolbar.drawing.arrow"]');
        await arrowTool.click();
        const options = toolbar.locator('[data-ui="content.toolbar.drawing-options.arrow"]');
        if (await options.isVisible()) await arrowTool.click();
        await drag(page, { x: 400, y: 200 }, { x: 500, y: 300 });
        const endpointChrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        await page.mouse.move(500, 300);
        await expect
          .poll(async () => (await corePixels(endpointChrome, { x: 500, y: 300 })).blue)
          .toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('standard-arrow-endpoint-ready-under-arrow-tool.png'),
          fullPage: false,
        });
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(450, 250);
        await page.mouse.move(500, 300);
        await page.mouse.down();
        await page.mouse.move(684, 304, { steps: 6 });
        await expectAxis(guides, 'x', 680);
        await expectAxis(guides, 'y', 300);
        await expectDiamonds(guides, true, 1);
        await expect(selectionChrome).toHaveCSS('opacity', '1');
        await expect
          .poll(async () => (await corePixels(selectionChrome, { x: 680, y: 300 })).blue)
          .toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('arrow-endpoint-full-center.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        const endpointBefore = await inkBounds(surface);
        expect(endpointBefore.right).toBeGreaterThan(670);
        expect(endpointBefore.left).toBeLessThan(410);
        await page.evaluate(() => {
          const target = document.querySelector<HTMLElement>('[data-magnet-target]');
          if (target) target.style.left = '800px';
        });
        expect(await inkBounds(surface)).toEqual(endpointBefore);
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('failed-product-state.png'),
          fullPage: false,
        });
        await info.attach('failed-geometry', {
          body: JSON.stringify(
            await page
              .locator(
                '[data-ui="content.drawing.text-object"], [data-ui="content.drawing.alignment-guides"], canvas, [data-magnet-target]'
              )
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  rect: node.getBoundingClientRect().toJSON(),
                  html: node.outerHTML,
                }))
              )
          ),
          contentType: 'application/json',
        });
        throw error;
      } finally {
        await page.mouse.up();
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const scale of [0.25, 1, 2]) {
  test(`page snap threshold uses six CSS pixels for transformed DOM scale ${scale}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      const { surface, toolbar } = await prepare(page, 'page');
      await domTargets(page, [{ x: 600, y: 180, width: 200, height: 120 }], scale);
      const target = (await page.locator('[data-magnet-target]').boundingBox())!;
      expect(target.width).toBeCloseTo(200 * scale, 1);
      expect(target.height).toBeCloseTo(120 * scale, 1);
      // Keep the center beyond the existing eleven-pixel handle hit region, while
      // keeping both source edges outside the competing target-edge threshold.
      await rectangle(page, toolbar, { x: 350, y: 140 }, { x: 372.5, y: 162.5 });
      const initial = await inkBounds(surface);
      const wantedX = target.x + target.width / 2;
      const wantedY = target.y + target.height + 22;
      await page.mouse.move(361.25, 151.25);
      await page.mouse.down();
      for (const offset of [7, 6, -6, -7]) {
        await page.mouse.move(wantedX + offset, wantedY);
        const guides = surface.locator(GUIDE);
        if (Math.abs(offset) === 6) {
          await expectAxis(guides, 'x', wantedX);
          await expect.poll(async () => (await inkBounds(surface)).centerX).toBeCloseTo(wantedX, 1);
          await expectDiamonds(guides, false, 1);
          if (offset === 6)
            await page.screenshot({
              path: info.outputPath(`dom-scale-${scale}-accepted-threshold.png`),
              fullPage: false,
            });
        } else {
          await expect(guides.locator('[data-axis="x"]')).toHaveCount(0);
          await expect
            .poll(async () => (await inkBounds(surface)).centerX)
            .toBeCloseTo(wantedX + offset, 1);
        }
      }
      await page.screenshot({
        path: info.outputPath(`dom-scale-${scale}-outside-threshold.png`),
        fullPage: false,
      });
      await page.mouse.up();
      await expect(surface.locator(GUIDE)).toHaveCount(0);
      const released = await inkBounds(surface);
      expect(released.centerX).toBeCloseTo(wantedX - 7, 1);
      // A fractional translation can move a thresholded antialias edge by one CSS pixel.
      expect(
        Math.abs(released.right - released.left - (initial.right - initial.left))
      ).toBeLessThanOrEqual(1);
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

for (const root of ['document', 'element'] as const) {
  test(`accepted page magnets preserve ${root} scroll projection and root clipping`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      await page.evaluate((root) => {
        const target = document.createElement('div');
        target.dataset['magnetTarget'] = 'scroll';
        target.textContent = 'Unpainted scrolled layout';
        target.style.cssText = `position:absolute;left:${root === 'document' ? 600 : 520}px;top:${root === 'document' ? 800 : 500}px;width:200px;height:120px;box-sizing:border-box;padding:8px;border:0;background:transparent`;
        if (root === 'document') {
          document.body.style.minHeight = '1800px';
          document.body.append(target);
        } else {
          const scroller = document.createElement('div');
          scroller.id = 'magnet-scroll-root';
          scroller.style.cssText =
            'position:fixed;left:80px;top:60px;width:1120px;height:450px;overflow:auto';
          const content = document.createElement('div');
          content.style.cssText = 'position:relative;width:1600px;height:1400px;background:#f8f3ed';
          content.append(target);
          scroller.append(content);
          document.body.append(scroller);
        }
      }, root);
      const { surface, toolbar } = await prepare(page, 'page');
      await page.evaluate((root) => {
        if (root === 'document') window.scrollTo(0, 600);
        else document.getElementById('magnet-scroll-root')!.scrollTop = 350;
      }, root);
      const target = page.locator('[data-magnet-target="scroll"]');
      const targetCenter = await center(target);
      await toolbar.locator('[data-ui="content.toolbar.drawing.text"]').click();
      await page.mouse.click(350, 350);
      await page.locator('[data-ui="content.drawing.text-input"]').fill('Scrolled note');
      await page.keyboard.press('Enter');
      await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
      const text = surface.locator('[data-ui="content.drawing.text-object"]');
      await moveText(page, text, { x: targetCenter.x + 4, y: targetCenter.y + 4 });
      const guides = surface.locator(GUIDE);
      await expectAxis(guides, 'x', targetCenter.x);
      await expectAxis(guides, 'y', targetCenter.y);
      await expectCenter(text, targetCenter);
      await expectDiamonds(guides, true, 1);
      await page.screenshot({
        path: info.outputPath(`dom-${root}-scrolled-center.png`),
        fullPage: false,
      });
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      await page.evaluate((root) => {
        if (root === 'document') window.scrollBy(0, 50);
        else document.getElementById('magnet-scroll-root')!.scrollTop += 50;
      }, root);
      const afterScroll = await center(target);
      expect(afterScroll.y).toBeCloseTo(targetCenter.y - 50, 1);
      await expectCenter(text, afterScroll);
      await moveText(page, text, { x: afterScroll.x + 4, y: afterScroll.y + 4 });
      await expectAxis(guides, 'x', afterScroll.x);
      await expectAxis(guides, 'y', afterScroll.y);
      await expectCenter(text, afterScroll);
      await page.mouse.up();
      if (root === 'element') {
        await page.evaluate(() => {
          const outside = document.createElement('div');
          outside.style.cssText =
            'position:fixed;left:600px;top:520px;width:200px;height:40px;border:0;background:transparent';
          outside.textContent = 'Outside the active scroll root';
          document.body.append(outside);
        });
        await moveText(page, text, { x: 704, y: 540 });
        await expect(guides).toHaveCount(0);
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expectCenter(text, afterScroll);
      }
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

for (const mode of ['page', 'crop'] as const) {
  test(`twenty-pixel selected body moves and its edge still resizes ${mode}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      const { surface, toolbar } = await prepare(page, mode);
      await rectangle(page, toolbar, { x: 350, y: 140 }, { x: 370, y: 160 });
      await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(360, 150);
      const before = await inkBounds(surface);
      await drag(page, { x: 360, y: 150 }, { x: 400, y: 190 });
      await page.screenshot({ path: info.outputPath('small-body-moved.png'), fullPage: false });
      const moved = await inkBounds(surface);
      expect(moved.centerX).toBeCloseTo(before.centerX + 40, 1);
      expect(moved.centerY).toBeCloseTo(before.centerY + 40, 1);
      expect(moved.right - moved.left).toBeCloseTo(before.right - before.left, 1);
      expect(moved.bottom - moved.top).toBeCloseTo(before.bottom - before.top, 1);
      await expect(surface.locator(GUIDE)).toHaveCount(0);
      await drag(page, { x: 410, y: 190 }, { x: 430, y: 190 });
      const resized = await inkBounds(surface);
      expect(resized.left).toBeCloseTo(moved.left, 1);
      expect(resized.top).toBeCloseTo(moved.top, 1);
      expect(resized.right).toBeCloseTo(moved.right + 20, 1);
      expect(resized.bottom).toBeCloseTo(moved.bottom, 1);
      await page.screenshot({ path: info.outputPath('small-edge-resized.png'), fullPage: false });
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

async function corePixels(canvas: Locator, point: Point) {
  return canvas.evaluate((node, point) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
    const bounds = node.getBoundingClientRect();
    const scaleX = node.width / bounds.width;
    const scaleY = node.height / bounds.height;
    const data = node
      .getContext('2d')!
      .getImageData(
        Math.round((point.x - bounds.x - 1) * scaleX),
        Math.round((point.y - bounds.y - 1) * scaleY),
        Math.max(1, Math.round(3 * scaleX)),
        Math.max(1, Math.round(3 * scaleY))
      ).data;
    let blue = 0,
      painted = 0;
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3]! < 100) continue;
      painted++;
      if (data[offset + 2]! > data[offset]! + 40) blue++;
    }
    return { blue, painted };
  }, point);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    test(`existing arrow points win near misses and insertions stay marker-free ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(90_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        const { surface, toolbar } = await prepare(page, mode);
        const tool = toolbar.locator('[data-ui="content.toolbar.drawing.arrow"]');
        const freehand = toolbar.locator(
          '[data-ui="content.toolbar.drawing-options.arrow.freehand"]'
        );
        await tool.click();
        if (!(await freehand.isVisible())) await tool.click();
        await freehand.click();
        const ink = surface.locator('canvas.sniptale-drawing-canvas').first();
        const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        await drag(page, { x: 400, y: 200 }, { x: 800, y: 200 });
        await page.mouse.move(600, 200);
        await expect(ink).toHaveCSS('cursor', 'grab');
        await page.mouse.down();
        await page.mouse.move(600, 280, { steps: 5 });
        await page.mouse.up();
        const first = { x: 600, y: 280 };
        await expect.poll(async () => (await corePixels(ink, first)).painted).toBeGreaterThan(0);
        await page.mouse.move(712.5, 245);
        await expect(ink).toHaveCSS('cursor', 'grab');
        await page.mouse.down();
        await page.mouse.move(712.5, 285, { steps: 5 });
        await page.mouse.up();
        const second = { x: 712.5, y: 285 };
        await expect.poll(async () => (await corePixels(ink, second)).painted).toBeGreaterThan(0);
        await page.mouse.move(first.x, first.y);
        await expect(ink).toHaveCSS('cursor', 'grab');
        await expect.poll(async () => (await corePixels(chrome, first)).blue).toBeGreaterThan(0);
        expect((await corePixels(chrome, second)).blue).toBe(0);
        await page.screenshot({
          path: info.outputPath('arrow-existing-point-ready-blue.png'),
          fullPage: false,
        });
        const originalInk = await ink.evaluate((node) => {
          if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
          return node.toDataURL();
        });
        await page.mouse.move(412, 200);
        await expect
          .poll(async () => (await corePixels(chrome, { x: 400, y: 200 })).blue)
          .toBeGreaterThan(0);
        expect((await corePixels(chrome, { x: 412, y: 200 })).painted).toBe(0);
        const nearExisting = { x: first.x + 12, y: first.y };
        await page.mouse.move(nearExisting.x, nearExisting.y);
        await expect.poll(async () => (await corePixels(chrome, first)).blue).toBeGreaterThan(0);
        expect((await corePixels(chrome, nearExisting)).painted).toBe(0);
        await page.mouse.down();
        await page.mouse.move(nearExisting.x + 20, nearExisting.y + 30, { steps: 5 });
        const movedExisting = { x: first.x + 20, y: first.y + 30 };
        await expect
          .poll(async () => (await corePixels(chrome, movedExisting)).blue)
          .toBeGreaterThan(0);
        expect((await corePixels(chrome, second)).blue).toBe(0);
        await page.screenshot({
          path: info.outputPath('arrow-existing-point-captured-from-near-miss.png'),
          fullPage: false,
        });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect
          .poll(() =>
            ink.evaluate((node) => {
              if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
              return node.toDataURL();
            })
          )
          .toBe(originalInk);
        // This shaft location is between the two authored bends. Confirm actual ink before insertion.
        const insertion = { x: 663.3, y: 292.8 };
        await expect
          .poll(async () => (await corePixels(ink, insertion)).painted)
          .toBeGreaterThan(0);
        await page.mouse.move(insertion.x, insertion.y);
        await expect(ink).toHaveCSS('cursor', 'grab');
        await expect.poll(async () => (await corePixels(chrome, insertion)).painted).toBe(0);
        expect((await corePixels(chrome, insertion)).blue).toBe(0);
        expect((await corePixels(chrome, first)).blue).toBe(0);
        expect((await corePixels(chrome, second)).blue).toBe(0);
        expect((await corePixels(chrome, first)).painted).toBeGreaterThan(0);
        expect((await corePixels(chrome, second)).painted).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('arrow-insertion-hover-no-marker.png'),
          fullPage: false,
        });
        await page.mouse.down();
        await expect(ink).toHaveCSS('cursor', 'grabbing');
        const captured = { x: 650, y: 360 };
        await page.mouse.move(captured.x, captured.y, { steps: 5 });
        await expect(ink).toHaveCSS('cursor', 'grabbing');
        await expect.poll(async () => (await corePixels(chrome, captured)).painted).toBe(0);
        expect((await corePixels(chrome, first)).blue).toBe(0);
        expect((await corePixels(chrome, second)).blue).toBe(0);
        expect((await corePixels(chrome, first)).painted).toBeGreaterThan(0);
        expect((await corePixels(chrome, second)).painted).toBeGreaterThan(0);
        await expect.poll(async () => (await corePixels(ink, captured)).painted).toBeGreaterThan(0);
        await page.screenshot({
          path: info.outputPath('arrow-insertion-drag-no-marker.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await page.mouse.move(900, 420);
        await expect.poll(async () => (await corePixels(chrome, captured)).blue).toBe(0);
        await expect
          .poll(async () => (await corePixels(chrome, captured)).painted)
          .toBeGreaterThan(0);
        await page
          .locator(
            mode === 'crop'
              ? '[data-ui="content.crop.undo"]'
              : '[data-ui="content.toolbar.history-undo-button"]'
          )
          .click();
        await expect.poll(async () => (await corePixels(ink, captured)).painted).toBe(0);
        expect((await corePixels(ink, first)).painted).toBeGreaterThan(0);
        expect((await corePixels(ink, second)).painted).toBeGreaterThan(0);
        await expect
          .poll(() =>
            ink.evaluate((node) => {
              if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing canvas missing');
              return node.toDataURL();
            })
          )
          .toBe(originalInk);
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('arrow-captured-point-failure.png'),
          fullPage: false,
        });
        throw error;
      } finally {
        await page.mouse.up();
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const mode of ['page', 'crop'] as const) {
  test(`captured width handle stays blue when pointer leaves its geometry ${mode}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      const { surface, toolbar } = await prepare(page, mode);
      await rectangle(page, toolbar, { x: 400, y: 160 }, { x: 600, y: 240 });
      const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
      const before = await inkBounds(surface);
      await page.mouse.move(600, 200);
      expect((await corePixels(chrome, { x: 600, y: 200 })).blue).toBe(0);
      expect((await corePixels(chrome, { x: 600, y: 200 })).painted).toBeGreaterThan(0);
      await page.mouse.down();
      await page.mouse.move(700, 280, { steps: 5 });
      // The canonical side resizer keeps Y=200 while the captured pointer is eighty pixels below it.
      await expect(chrome).toHaveCSS('opacity', '1');
      await expect
        .poll(async () => (await corePixels(chrome, { x: 700, y: 200 })).blue)
        .toBeGreaterThan(0);
      expect((await corePixels(chrome, { x: 700, y: 280 })).blue).toBe(0);
      const resized = await inkBounds(surface);
      expect(resized.left).toBeCloseTo(before.left, 1);
      expect(resized.top).toBeCloseTo(before.top, 1);
      expect(resized.right).toBeCloseTo(before.right + 100, 1);
      expect(resized.bottom).toBeCloseTo(before.bottom, 1);
      await page.screenshot({
        path: info.outputPath('width-handle-captured-pointer-off-blue.png'),
        fullPage: false,
      });
      await page.mouse.up();
      await expect.poll(async () => (await corePixels(chrome, { x: 700, y: 200 })).blue).toBe(0);
      expect((await corePixels(chrome, { x: 700, y: 200 })).painted).toBeGreaterThan(0);
    } catch (error) {
      await page.screenshot({
        path: info.outputPath('width-handle-capture-failure.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

for (const mode of ['page', 'crop'] as const) {
  test(`unselected rectangle hover is solid without handles or selection changes ${mode}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      const { surface, toolbar } = await prepare(page, mode);
      await rectangle(page, toolbar, { x: 400, y: 180 }, { x: 600, y: 260 });
      await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(300, 340);
      const before = await inkBounds(surface);
      const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
      await expect(page.locator('[data-ui="drawing.selection.actions"]')).toHaveCount(0);
      await page.mouse.move(400, 220);
      await expect(chrome).toHaveCSS('opacity', '1');
      await expect
        .poll(async () =>
          chrome.evaluate((node) => {
            if (!(node instanceof HTMLCanvasElement)) throw new Error('Selection canvas missing');
            const bounds = node.getBoundingClientRect();
            const scale = node.width / bounds.width;
            const width = Math.round(150 * scale),
              height = Math.round(3 * scale);
            const data = node
              .getContext('2d')!
              .getImageData(
                Math.round((425 - bounds.x) * scale),
                Math.round((179 - bounds.y) * scale),
                width,
                height
              ).data;
            let columns = 0;
            for (let column = 0; column < 150; column++) {
              const x = Math.min(width - 1, Math.floor((column + 0.5) * scale));
              for (let y = 0; y < height; y++) {
                const offset = (y * width + x) * 4;
                if (data[offset + 3]! > 80 && data[offset + 2]! > data[offset]! + 40) {
                  columns++;
                  break;
                }
              }
            }
            return columns;
          })
        )
        .toBe(150);
      expect((await corePixels(chrome, { x: 403, y: 183 })).painted).toBe(0);
      expect((await corePixels(chrome, { x: 500, y: 182 })).painted).toBe(0);
      await expect(page.locator('[data-ui="drawing.selection.actions"]')).toHaveCount(0);
      expect(await inkBounds(surface)).toEqual(before);
      await page.screenshot({
        path: info.outputPath('rectangle-hover-solid-no-handles.png'),
        fullPage: false,
      });
      await page.mouse.move(300, 340);
      await expect.poll(async () => (await corePixels(chrome, { x: 400, y: 220 })).blue).toBe(0);
      expect(await inkBounds(surface)).toEqual(before);
      await expect(page.locator('[data-ui="drawing.selection.actions"]')).toHaveCount(0);
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

for (const mode of ['page', 'crop'] as const) {
  test(`identical boxes keep a filled canonical overlap through pointer jitter ${mode}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
      width: 1280,
      height: 560,
    });
    try {
      const { surface, toolbar } = await prepare(page, mode);
      await rectangle(page, toolbar, { x: 600, y: 180 }, { x: 700, y: 260 });
      const peerInk = await inkBounds(surface);
      await rectangle(page, toolbar, { x: 400, y: 300 }, { x: 500, y: 380 });
      const separateInk = await inkBounds(surface);
      await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
      const objects = surface.getByRole('button', { name: /^Object [12]$/u });
      await expect(objects).toHaveCount(2);
      await page.mouse.click(430, 300);
      await page.mouse.move(450, 340);
      await page.mouse.down();
      await page.mouse.move(650, 220, { steps: 6 });
      const guides = surface.locator(GUIDE);
      await expectAxisCoordinates(guides, 'x', [600, 650, 700]);
      await expectAxisCoordinates(guides, 'y', [180, 220, 260]);
      await expectDiamonds(guides, true, 1);
      await expect(guides.locator(BRACKET)).toHaveCount(0);
      expect(await inkBounds(surface)).toEqual(peerInk);

      const frames = guides
        .evaluate(async (node) => {
          const owner = node.getRootNode();
          if (!(owner instanceof Document) && !(owner instanceof ShadowRoot))
            throw new Error('Guide root missing');
          const observations = [];
          for (let frame = 0; frame < 90; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const svg = owner.querySelector('[data-ui="content.drawing.alignment-guides"]');
            if (!svg) throw new Error('Accepted guide disappeared during jitter');
            const style = getComputedStyle(svg);
            observations.push({
              x: [
                ...new Set(
                  Array.from(svg.querySelectorAll('[data-axis="x"]')).map((line) =>
                    Number(line.getAttribute('x1'))
                  )
                ),
              ],
              y: [
                ...new Set(
                  Array.from(svg.querySelectorAll('[data-axis="y"]')).map((line) =>
                    Number(line.getAttribute('y1'))
                  )
                ),
              ],
              markers: Array.from(
                svg.querySelectorAll<SVGPathElement>('[data-ui="content.drawing.alignment-marker"]')
              ).map((marker) => {
                const bounds = marker.getBBox();
                return {
                  x: bounds.x + bounds.width / 2,
                  y: bounds.y + bounds.height / 2,
                  filled: marker.getAttribute('data-filled'),
                };
              }),
              visibility: style.visibility,
              opacity: style.opacity,
            });
          }
          return observations;
        })
        .catch(() => []);
      for (const point of [
        { x: 650.01, y: 220.01 },
        { x: 650.02, y: 220.02 },
        { x: 649.96, y: 219.96 },
        { x: 650.04, y: 220.04 },
        { x: 650, y: 220 },
      ]) {
        await page.mouse.move(point.x, point.y);
        await expectAxisCoordinates(guides, 'x', [600, 650, 700]);
        await expectAxisCoordinates(guides, 'y', [180, 220, 260]);
        await expectDiamonds(guides, true, 1);
        expect(await inkBounds(surface)).toEqual(peerInk);
      }
      const observed = await frames;
      await info.attach('canonical-overlap-jitter-frames', {
        body: JSON.stringify(observed),
        contentType: 'application/json',
      });
      expect(observed).toHaveLength(90);
      for (const frame of observed)
        expect(frame).toEqual({
          x: [650, 600, 700],
          y: [220, 180, 260],
          markers: [{ x: 650, y: 220, filled: 'true' }],
          visibility: 'visible',
          opacity: '1',
        });
      await page.screenshot({
        path: info.outputPath('identical-overlap-stable-filled-center.png'),
        fullPage: false,
      });
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      expect(await inkBounds(surface)).toEqual(peerInk);
      await expect(objects).toHaveCount(2);

      await page
        .locator(
          mode === 'crop'
            ? '[data-ui="content.crop.undo"]'
            : '[data-ui="content.toolbar.history-undo-button"]'
        )
        .click();
      await expect.poll(() => inkBounds(surface)).toEqual(separateInk);
      await expect(objects).toHaveCount(2);
      await page.mouse.click(430, 300);
      await page.mouse.move(450, 340);
      await page.mouse.down();
      await page.mouse.move(650.04, 220.04, { steps: 6 });
      await expectAxisCoordinates(guides, 'x', [600, 650, 700]);
      await expectAxisCoordinates(guides, 'y', [180, 220, 260]);
      await expectDiamonds(guides, true, 1);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      expect(await inkBounds(surface)).toEqual(separateInk);
      await expect(objects).toHaveCount(2);
    } catch (error) {
      await page.screenshot({
        path: info.outputPath('identical-overlap-failure.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await page.mouse.up();
      await popup.close();
      await page.close();
    }
  });
}

async function paintedRegion(
  surface: Locator,
  region: { x: number; y: number; width: number; height: number }
) {
  return surface
    .locator('canvas.sniptale-drawing-canvas')
    .first()
    .evaluate((node, region) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Drawing document canvas missing');
      const rect = node.getBoundingClientRect();
      const scale = node.width / rect.width;
      const x0 = Math.max(0, Math.floor((region.x - rect.x) * scale));
      const y0 = Math.max(0, Math.floor((region.y - rect.y) * scale));
      const width = Math.min(node.width - x0, Math.ceil(region.width * scale));
      const height = Math.min(node.height - y0, Math.ceil(region.height * scale));
      const data = node.getContext('2d')!.getImageData(x0, y0, width, height).data;
      let left = width,
        top = height,
        right = -1,
        bottom = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3]! < 80) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      return {
        hasInk: right >= 0,
        left: rect.x + (x0 + left) / scale,
        top: rect.y + (y0 + top) / scale,
        width: (right - left + 1) / scale,
        height: (bottom - top + 1) / scale,
        centerX: rect.x + (x0 + (left + right + 1) / 2) / scale,
        centerY: rect.y + (y0 + (top + bottom + 1) / 2) / scale,
      };
    }, region);
}

async function measuredSpans(guides: Locator, kind: 'gap' | 'dimension') {
  return guides.locator(`[data-relation-kind="${kind}"]`).evaluateAll((nodes) =>
    nodes
      .map((node) => {
        if (!(node instanceof SVGGraphicsElement)) throw new Error('Relation group missing');
        const line = node.querySelector('polyline');
        if (!line) throw new Error('Relation span missing');
        const points = line.points;
        const matrix = line.getScreenCTM();
        if (!matrix) throw new Error('Relation projection missing');
        const from = new DOMPoint(points[0]!.x, points[0]!.y).matrixTransform(matrix);
        const to = new DOMPoint(points[1]!.x, points[1]!.y).matrixTransform(matrix);
        return {
          axis: node.getAttribute('data-relation-axis'),
          from: { x: from.x, y: from.y },
          to: { x: to.x, y: to.y },
          label: node.querySelector('text')?.textContent,
          caps: node.querySelectorAll('polyline').length,
          visibility: getComputedStyle(node).visibility,
          opacity: getComputedStyle(node).opacity,
        };
      })
      .sort((a, b) => a.from.x - b.from.x || a.from.y - b.from.y)
  );
}

async function undoDrawing(page: Page, mode: Mode) {
  await page
    .locator(
      mode === 'crop'
        ? '[data-ui="content.crop.undo"]'
        : '[data-ui="content.toolbar.history-undo-button"]'
    )
    .click();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    for (const placement of ['center', 'repeat'] as const) {
      test(`accepted equal-gap ${placement} relation ${mode} ${name}`, async ({
        context,
        extensionId,
        hostOrigin,
      }, info) => {
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
        try {
          const { surface, toolbar } = await prepare(page, mode);
          const references =
            placement === 'center'
              ? [
                  { x: 320, width: 80 },
                  { x: 880, width: 120 },
                ]
              : [
                  { x: 320, width: 80 },
                  { x: 500, width: 120 },
                  { x: 720, width: 100 },
                ];
          for (const reference of references)
            await rectangle(
              page,
              toolbar,
              { x: reference.x, y: 180 },
              { x: reference.x + reference.width, y: 260 }
            );
          const referenceRegions = references.map((reference) => ({
            x: reference.x - 10,
            y: 170,
            width: reference.width + 20,
            height: 100,
          }));
          const originalReferences = await Promise.all(
            referenceRegions.map((region) => paintedRegion(surface, region))
          );
          const start = placement === 'center' ? { x: 600, y: 370 } : { x: 810, y: 370 };
          await rectangle(page, toolbar, { x: start.x - 50, y: 340 }, { x: start.x + 50, y: 400 });
          const originalRegion = { x: start.x - 60, y: 330, width: 120, height: 80 };
          const originalSource = await paintedRegion(surface, originalRegion);
          const wanted = placement === 'center' ? { x: 640, y: 220 } : { x: 970, y: 220 };
          const end = { x: wanted.x - 4, y: wanted.y };
          const finalRegion = { x: wanted.x - 60, y: 180, width: 120, height: 80 };
          const expectedSpans =
            placement === 'center'
              ? [
                  [400, 590],
                  [690, 880],
                ]
              : [
                  [400, 500],
                  [620, 720],
                  [820, 920],
                ];
          const gap = placement === 'center' ? '190' : '100';
          await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
          const objects = surface.getByRole('button', { name: /^Object \d+$/u });
          await expect(objects).toHaveCount(references.length + 1);
          const beginMove = async () => {
            await page.mouse.click(start.x - 20, 340);
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            await page.mouse.move(end.x, end.y, { steps: 6 });
          };
          const guides = surface.locator(GUIDE);
          const expectAccepted = async () => {
            await expect(guides).toBeVisible();
            await expect
              .poll(() => measuredSpans(guides, 'gap'))
              .toEqual(
                expectedSpans.map(([from, to]) => ({
                  axis: 'x',
                  from: { x: from!, y: 220 },
                  to: { x: to!, y: 220 },
                  label: gap,
                  caps: 3,
                  visibility: 'visible',
                  opacity: '1',
                }))
              );
            await expect(guides.locator('[data-axis="x"]')).toHaveCount(0);
            await expect(guides.locator(`${MARKER}[data-filled="true"]`)).toHaveCount(0);
            await expect
              .poll(async () => {
                const source = await paintedRegion(surface, finalRegion);
                return {
                  x: source.centerX,
                  y: source.centerY,
                  width: source.width,
                  height: source.height,
                };
              })
              .toEqual({
                x: wanted.x,
                y: wanted.y,
                width: originalSource.width,
                height: originalSource.height,
              });
            expect(
              await Promise.all(referenceRegions.map((region) => paintedRegion(surface, region)))
            ).toEqual(originalReferences);
          };
          await beginMove();
          await expectAccepted();
          await page.screenshot({
            path: info.outputPath(`equal-gap-${placement}-accepted.png`),
            fullPage: false,
          });
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          expect((await paintedRegion(surface, finalRegion)).centerX).toBe(wanted.x);
          await undoDrawing(page, mode);
          await expect.poll(() => paintedRegion(surface, originalRegion)).toEqual(originalSource);
          expect((await paintedRegion(surface, finalRegion)).hasInk).toBe(false);
          await expect(objects).toHaveCount(references.length + 1);
          await beginMove();
          await expectAccepted();
          await page.keyboard.press('Escape');
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          expect(await paintedRegion(surface, originalRegion)).toEqual(originalSource);
          expect((await paintedRegion(surface, finalRegion)).hasInk).toBe(false);
          expect(
            await Promise.all(referenceRegions.map((region) => paintedRegion(surface, region)))
          ).toEqual(originalReferences);
          await expect(objects).toHaveCount(references.length + 1);
        } catch (error) {
          await page.screenshot({
            path: info.outputPath(`equal-gap-${placement}-failure.png`),
            fullPage: false,
          });
          throw error;
        } finally {
          await page.mouse.up();
          await popup.close();
          await page.close();
        }
      });
    }

    test(`accepted unaligned width relation ${mode} ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        const { surface, toolbar } = await prepare(page, mode);
        await rectangle(page, toolbar, { x: 760, y: 180 }, { x: 900, y: 260 });
        const peerRegion = { x: 750, y: 170, width: 160, height: 100 };
        const peer = await paintedRegion(surface, peerRegion);
        await rectangle(page, toolbar, { x: 400, y: 340 }, { x: 500, y: 400 });
        const sourceRegion = { x: 390, y: 330, width: 170, height: 80 };
        const originalSource = await paintedRegion(surface, sourceRegion);
        await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
        const guides = surface.locator(GUIDE);
        const objects = surface.getByRole('button', { name: /^Object \d+$/u });
        await expect(objects).toHaveCount(2);
        const beginResize = async () => {
          await page.mouse.click(430, 340);
          await page.mouse.move(500, 370);
          await page.mouse.down();
          await page.mouse.move(536, 370, { steps: 6 });
        };
        const expectAccepted = async () => {
          await expect(guides).toBeVisible();
          await expect
            .poll(() => measuredSpans(guides, 'dimension'))
            .toEqual([
              {
                axis: 'x',
                from: { x: 400, y: 320 },
                to: { x: 540, y: 320 },
                label: '140',
                caps: 3,
                visibility: 'visible',
                opacity: '1',
              },
              {
                axis: 'x',
                from: { x: 760, y: 160 },
                to: { x: 900, y: 160 },
                label: '140',
                caps: 3,
                visibility: 'visible',
                opacity: '1',
              },
            ]);
          await expect(guides.locator('[data-axis]')).toHaveCount(0);
          await expect(guides.locator(MARKER)).toHaveCount(0);
          await expect
            .poll(async () => {
              const source = await paintedRegion(surface, sourceRegion);
              return {
                width: source.width,
                height: source.height,
                left: source.left,
                top: source.top,
              };
            })
            .toEqual({
              width: peer.width,
              height: originalSource.height,
              left: originalSource.left,
              top: originalSource.top,
            });
          expect(await paintedRegion(surface, peerRegion)).toEqual(peer);
        };
        await beginResize();
        await expectAccepted();
        await page.keyboard.down('Alt');
        await page.mouse.move(536, 370);
        await expect(guides).toHaveCount(0);
        expect((await paintedRegion(surface, sourceRegion)).width).toBe(peer.width - 4);
        await page.keyboard.up('Alt');
        await page.mouse.move(536, 370);
        await expectAccepted();
        await page.screenshot({
          path: info.outputPath('unaligned-width-accepted.png'),
          fullPage: false,
        });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        expect((await paintedRegion(surface, sourceRegion)).width).toBe(peer.width);
        await undoDrawing(page, mode);
        await expect.poll(() => paintedRegion(surface, sourceRegion)).toEqual(originalSource);
        await beginResize();
        await expectAccepted();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        expect(await paintedRegion(surface, sourceRegion)).toEqual(originalSource);
        expect(await paintedRegion(surface, peerRegion)).toEqual(peer);
        await expect(objects).toHaveCount(2);
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('unaligned-width-failure.png'),
          fullPage: false,
        });
        throw error;
      } finally {
        await page.mouse.up();
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['page', 'crop'] as const) {
    for (const layout of ['row', 'column'] as const) {
      test(`coincident box edges ${layout} ${mode} ${name}`, async ({
        context,
        extensionId,
        hostOrigin,
      }, info) => {
        const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
        try {
          const { surface, toolbar } = await prepare(page, mode);
          const peers =
            layout === 'row'
              ? [
                  { x: 320, y: 180, width: 80, height: 80 },
                  { x: 640, y: 180, width: 100, height: 80 },
                ]
              : [
                  { x: 400, y: 150, width: 80, height: 60 },
                  { x: 400, y: 370, width: 80, height: 60 },
                ];
          for (const peer of peers)
            await rectangle(page, toolbar, peer, {
              x: peer.x + peer.width,
              y: peer.y + peer.height,
            });
          const peerRegions = peers.map((peer) => ({
            x: peer.x - 10,
            y: peer.y - 10,
            width: peer.width + 20,
            height: peer.height + 20,
          }));
          const originalPeers = await Promise.all(
            peerRegions.map((region) => paintedRegion(surface, region))
          );
          expect(originalPeers.every((peer) => peer.hasInk)).toBe(true);
          const source =
            layout === 'row'
              ? { x: 460, y: 340, width: 120, height: 80 }
              : { x: 700, y: 250, width: 80, height: 100 };
          await rectangle(page, toolbar, source, {
            x: source.x + source.width,
            y: source.y + source.height,
          });
          const originalRegion = {
            x: source.x - 10,
            y: source.y - 10,
            width: source.width + 20,
            height: source.height + 20,
          };
          const originalInk = await paintedRegion(surface, originalRegion);
          expect(originalInk.hasInk).toBe(true);
          const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
          const end = layout === 'row' ? { x: 520, y: 224 } : { x: 444, y: 290 };
          const wanted = layout === 'row' ? { x: 520, y: 220 } : { x: 440, y: 290 };
          const finalRegion = {
            x: wanted.x - source.width / 2 - 10,
            y: wanted.y - source.height / 2 - 10,
            width: source.width + 20,
            height: source.height + 20,
          };
          const axis = layout === 'row' ? 'y' : 'x';
          const coordinates = layout === 'row' ? [180, 220, 260] : [400, 440, 480];
          await toolbar.locator('[data-ui="content.toolbar.drawing.select"]').click();
          const guides = surface.locator(GUIDE);
          const objects = surface.getByRole('button', { name: /^Object \d+$/u });
          const beginMove = async () => {
            await page.mouse.click(source.x + 20, source.y);
            await page.mouse.move(start.x, start.y);
            await page.mouse.down();
            await page.mouse.move(end.x, end.y, { steps: 6 });
          };
          const expectAccepted = async () => {
            await expectAxisCoordinates(guides, axis, coordinates);
            await expectDiamonds(guides, false, 2);
            await expect
              .poll(async () => {
                const ink = await paintedRegion(surface, finalRegion);
                return { x: ink.centerX, y: ink.centerY, width: ink.width, height: ink.height };
              })
              .toEqual({
                x: wanted.x,
                y: wanted.y,
                width: originalInk.width,
                height: originalInk.height,
              });
            expect(
              await Promise.all(peerRegions.map((region) => paintedRegion(surface, region)))
            ).toEqual(originalPeers);
            await expect(objects).toHaveCount(3);
          };
          await beginMove();
          await expectAccepted();
          await page.screenshot({
            path: info.outputPath(`coincident-${layout}-edges-and-center.png`),
            fullPage: false,
          });
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          expect((await paintedRegion(surface, finalRegion)).centerX).toBe(wanted.x);
          await undoDrawing(page, mode);
          await expect.poll(() => paintedRegion(surface, originalRegion)).toEqual(originalInk);
          expect((await paintedRegion(surface, finalRegion)).hasInk).toBe(false);
          await beginMove();
          await expectAccepted();
          await page.keyboard.press('Escape');
          await page.mouse.up();
          await expect(guides).toHaveCount(0);
          expect(await paintedRegion(surface, originalRegion)).toEqual(originalInk);
          expect(
            await Promise.all(peerRegions.map((region) => paintedRegion(surface, region)))
          ).toEqual(originalPeers);
        } catch (error) {
          await page.screenshot({
            path: info.outputPath(`coincident-${layout}-failure.png`),
            fullPage: false,
          });
          throw error;
        } finally {
          await page.mouse.up();
          await popup.close();
          await page.close();
        }
      });
    }
  }
}
