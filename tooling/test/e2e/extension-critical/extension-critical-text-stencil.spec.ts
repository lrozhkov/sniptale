import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

const TEXT = 'Stencil TEST\nSecond line';

async function checkEditorFillBounds(page: Page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
    )!;
    const border = document.querySelector<SVGPolygonElement>(
      '[data-ui="editor.canvas.selection-chrome"] polygon'
    )!;
    const matrix = border.getScreenCTM()!;
    const corners = Array.from(border.points).map((point) =>
      new DOMPoint(point.x, point.y).matrixTransform(matrix)
    );
    const origin = corners[0]!;
    const width = Math.hypot(corners[1]!.x - origin.x, corners[1]!.y - origin.y);
    const height = Math.hypot(corners[3]!.x - origin.x, corners[3]!.y - origin.y);
    const horizontal = {
      x: (corners[1]!.x - origin.x) / width,
      y: (corners[1]!.y - origin.y) / width,
    };
    const vertical = {
      x: (corners[3]!.x - origin.x) / height,
      y: (corners[3]!.y - origin.y) / height,
    };
    const canvasBox = canvas.getBoundingClientRect();
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = 0;
    let overflow = 0;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let row = 0; row < canvas.height; row += 1) {
      for (let column = 0; column < canvas.width; column += 1) {
        const offset = (row * canvas.width + column) * 4;
        if (
          ![249, 115, 22].every(
            (value, channel) => Math.abs(pixels[offset + channel]! - value) <= 2
          )
        )
          continue;
        painted += 1;
        const x = canvasBox.x + ((column + 0.5) * canvasBox.width) / canvas.width - origin.x;
        const y = canvasBox.y + ((row + 0.5) * canvasBox.height) / canvas.height - origin.y;
        const localX = x * horizontal.x + y * horizontal.y;
        const localY = x * vertical.x + y * vertical.y;
        left = Math.min(left, localX);
        right = Math.max(right, localX);
        top = Math.min(top, localY);
        bottom = Math.max(bottom, localY);
        if (localX < -1 || localX > width + 1 || localY < -1 || localY > height + 1) overflow += 1;
      }
    }
    return {
      painted,
      overflow,
      gaps: { left, top, right: width - right, bottom: height - bottom },
    };
  });
  expect(result.painted).toBeGreaterThan(100);
  expect(result.overflow).toBe(0);
  return result.gaps;
}

async function rotateEditorText(page: Page, degrees: number) {
  let measured = 0;
  for (let adjustment = 0; adjustment < 5; adjustment += 1) {
    const geometry = await page
      .locator('[data-ui="editor.canvas.selection-chrome"]')
      .evaluate((node) => {
        const polygon = node.querySelector('polygon')!;
        const matrix = polygon.getScreenCTM()!;
        const points = Array.from(polygon.points).map((point) =>
          new DOMPoint(point.x, point.y).matrixTransform(matrix)
        );
        const center = { x: points[0]!.x, y: points[0]!.y };
        const icon = node.querySelector('g[transform]')!;
        const handle = new DOMPoint(0, 0).matrixTransform(icon.getScreenCTM()!);
        const angle = Math.atan2(points[1]!.y - points[0]!.y, points[1]!.x - points[0]!.x);
        return { center, handle: { x: handle.x, y: handle.y }, angle };
      });
    const delta = (degrees * Math.PI) / 180 - geometry.angle;
    const offset = {
      x: geometry.handle.x - geometry.center.x,
      y: geometry.handle.y - geometry.center.y,
    };
    await page.mouse.move(geometry.handle.x, geometry.handle.y);
    await page.keyboard.down('Control');
    await page.mouse.down();
    await page.mouse.move(
      geometry.center.x + offset.x * Math.cos(delta) - offset.y * Math.sin(delta),
      geometry.center.y + offset.x * Math.sin(delta) + offset.y * Math.cos(delta),
      { steps: 8 }
    );
    await page.mouse.up();
    await page.keyboard.up('Control');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    measured = await page
      .locator('[data-ui="editor.canvas.selection-chrome"] polygon')
      .evaluate((polygon: SVGPolygonElement) => {
        const start = polygon.points.getItem(0);
        const end = polygon.points.getItem(1);
        return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
      });
    if (Math.abs(measured - degrees) < 0.25) return;
  }
  expect(measured).toBeCloseTo(degrees, 0);
}

async function setTextAlpha(page: Page, percent: number) {
  const group = page.getByRole('group', { name: /^(Text color|Цвет текста)$/ });
  await group.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
  const opacity = page.locator('[data-ui="shared.ui.color-selector.opacity"] input').first();
  await opacity.fill(String(percent));
  await opacity.press('Tab');
  await page
    .locator('[data-ui="shared.ui.color-selector.picker"]')
    .getByRole('button', { name: /^(Apply|Применить)$/ })
    .click();
}

async function enableBackground(page: Page) {
  const fill = page.locator('[data-ui="content.toolbar.drawing-options.text.background-none"]');
  if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
  await page
    .locator(
      '[data-ui="content.toolbar.drawing-options.text.background-colors"] button[title="#f97316"]'
    )
    .click();
  await page.keyboard.press('Escape');
}

async function checkPixels(
  page: Page,
  scene: Buffer,
  normal: Buffer,
  stencil: Buffer,
  region: { x: number; y: number; width: number; height: number }
) {
  const result = await page.evaluate(
    async ({ scene, normal, stencil, region }) => {
      const decode = async (encoded: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return {
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
          width: canvas.width,
        };
      };
      const source = await decode(scene);
      const glyphs = await decode(normal);
      const actual = await decode(stencil);
      let holes = 0;
      let retained = 0;
      let incorrect = 0;
      for (let row = Math.ceil(region.y + 3); row < region.y + region.height - 3; row += 1) {
        for (
          let column = Math.ceil(region.x + 3);
          column < region.x + region.width - 3;
          column += 1
        ) {
          const offset = (row * source.width + column) * 4;
          const isGlyph = [17, 24, 39].every(
            (channel, index) => Math.abs(glyphs.pixels[offset + index]! - channel) <= 1
          );
          const changed = [0, 1, 2].some(
            (channel) =>
              Math.abs(glyphs.pixels[offset + channel]! - source.pixels[offset + channel]!) > 60
          );
          if (isGlyph && changed) {
            holes += 1;
            let revealed = false;
            for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
              for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
                const candidate = ((row + deltaY) * source.width + column + deltaX) * 4;
                if (
                  [0, 1, 2].every(
                    (channel) =>
                      Math.abs(
                        actual.pixels[candidate + channel]! - source.pixels[candidate + channel]!
                      ) <= 5
                  )
                )
                  revealed = true;
              }
            }
            if (!revealed) incorrect += 1;
          }
          const isFill =
            glyphs.pixels[offset] === 249 &&
            glyphs.pixels[offset + 1] === 115 &&
            glyphs.pixels[offset + 2] === 22;
          if (
            isFill &&
            [0, 1, 2].every(
              (channel) =>
                Math.abs(actual.pixels[offset + channel]! - glyphs.pixels[offset + channel]!) <= 2
            )
          )
            retained += 1;
        }
      }
      return { holes, incorrect, retained };
    },
    {
      scene: scene.toString('base64'),
      normal: normal.toString('base64'),
      stencil: stencil.toString('base64'),
      region,
    }
  );
  expect(result.holes).toBeGreaterThan(100);
  expect(result.retained).toBeGreaterThan(100);
  expect(result.incorrect / result.holes).toBeLessThan(0.03);
}

async function textRegion(object: Locator) {
  const box = await object.boundingBox();
  if (!box) throw new Error('Text region unavailable');
  return box;
}

async function rotateText(page: Page, object: Locator) {
  const bounds = await object.evaluate((node) => ({
    x: parseFloat(node.style.left),
    y: parseFloat(node.style.top),
    width: parseFloat(node.style.width),
    height: parseFloat(node.style.height),
  }));
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const factor = 1 + 18 / Math.hypot(bounds.width / 2, bounds.height / 2);
  const delta = { x: (bounds.width / 2) * factor, y: (-bounds.height / 2) * factor };
  await page.mouse.move(center.x + delta.x, center.y + delta.y);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(
    center.x + (delta.x - delta.y) / Math.SQRT2,
    center.y + (delta.x + delta.y) / Math.SQRT2,
    { steps: 8 }
  );
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(object).toHaveCSS(
    'transform',
    'matrix(0.707107, 0.707107, -0.707107, 0.707107, 0, 0)'
  );
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  test(`page Text stencil reveals the scene ${viewport.width}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
    try {
      await page.evaluate(() => {
        document.body.style.background =
          'repeating-linear-gradient(90deg,#22ccaa 0 13px,#cc66bb 13px 26px)';
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
      await page.locator('[data-ui="content.toolbar.drawing-options.text.font-sans"]').click();
      await enableBackground(page);
      await setTextAlpha(page, 100);
      const textTool = page.locator('[data-ui="content.toolbar.drawing.text"]');
      if ((await textTool.getAttribute('aria-pressed')) !== 'true') await textTool.click();
      await page.mouse.click(460, 250);
      const input = page.locator('[data-ui="content.drawing.text-input"]');
      await input.fill(TEXT);
      await input.press('Enter');
      const object = page.locator('[data-ui="content.drawing.text-object"]');
      await expect(object).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const region = await textRegion(object);
      await object.evaluate((node) => {
        node.style.visibility = 'hidden';
      });
      const scene = await page.screenshot({ path: info.outputPath('scene.png'), fullPage: false });
      await object.evaluate((node) => {
        node.style.visibility = '';
      });
      const normal = await page.screenshot({
        path: info.outputPath('normal.png'),
        fullPage: false,
      });
      await setTextAlpha(page, 0);
      const stencil = await page.screenshot({
        path: info.outputPath('stencil.png'),
        fullPage: false,
      });
      await checkPixels(page, scene, normal, stencil, region);
      await page.mouse.click(region.x + region.width / 2, region.y + region.height / 2);
      await expect(input).toHaveValue(TEXT);
      await expect(input).toHaveCSS('caret-color', 'rgb(37, 99, 235)');
      await input.press('ArrowLeft');
      await page.screenshot({
        path: info.outputPath('transparent-text-caret.png'),
        fullPage: false,
        caret: 'initial',
      });
      await expect(page.locator('[data-ui="content.drawing.text-editor"] mask')).toHaveCount(1);
      await input.fill(`${TEXT}\nEdited`);
      await input.press('Enter');
      await expect(object.locator('mask text')).toHaveCount(3);
      await setTextAlpha(page, 50);
      await expect(object.locator('mask')).toHaveCount(0);
      await setTextAlpha(page, 0);
      await expect(object.locator('mask')).toHaveCount(1);
      await rotateText(page, object);
      await setTextAlpha(page, 100);
      await object.evaluate((node) => {
        node.style.visibility = 'hidden';
      });
      const rotatedScene = await page.screenshot({
        path: info.outputPath('rotated-scene.png'),
        fullPage: false,
      });
      await object.evaluate((node) => {
        node.style.visibility = '';
      });
      const rotatedNormal = await page.screenshot({
        path: info.outputPath('rotated-normal.png'),
        fullPage: false,
      });
      await setTextAlpha(page, 0);
      const rotatedStencil = await page.screenshot({
        path: info.outputPath('rotated-stencil.png'),
        fullPage: false,
      });
      await checkPixels(
        page,
        rotatedScene,
        rotatedNormal,
        rotatedStencil,
        await textRegion(object)
      );
    } finally {
      await page.close();
      await popup.close();
    }
  });

  test(`editor Text stencil reveals the image ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    try {
      await page.setViewportSize(viewport);
      await applyHarnessBootstrap(page, {});
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .some((object) => object['type'] === 'image')
          )
        )
        .toBe(true);
      await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
      await expect(page.locator('[data-ui="editor.floating.view-controls.zoom"]')).toHaveText(
        '100%'
      );
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await enableBackground(page);
      await setTextAlpha(page, 100);
      const canvas = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
      const region = (await canvas.boundingBox())!;
      const scene = await page.screenshot({ path: info.outputPath('scene.png'), fullPage: false });
      const start = { x: region.x + region.width / 2 - 90, y: region.y + region.height / 2 - 30 };
      await page.mouse.click(start.x, start.y);
      await page.keyboard.insertText(TEXT);
      await page.keyboard.press('Escape');
      await checkEditorFillBounds(page);
      const normal = await page.screenshot({
        path: info.outputPath('normal.png'),
        fullPage: false,
      });
      await setTextAlpha(page, 0);
      const stencil = await page.screenshot({
        path: info.outputPath('stencil.png'),
        fullPage: false,
      });
      await checkEditorFillBounds(page);
      const text = await page.evaluate(() =>
        window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .find((object) => object['sniptaleType'] === 'text')
      );
      await checkPixels(page, scene, normal, stencil, {
        ...start,
        width: Number(text?.['width']),
        height: Number(text?.['height']),
      });
      expect(
        await page.evaluate(
          () =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .filter((object) => object['sniptaleType'] === 'text').length
        )
      ).toBe(1);
      const baseline = await checkEditorFillBounds(page);
      for (const degrees of [5, 45]) {
        await rotateEditorText(page, degrees);
        for (const alpha of [100, 0]) {
          await setTextAlpha(page, alpha);
          const gaps = await checkEditorFillBounds(page);
          for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
            expect(
              Math.abs(gaps[edge] - baseline[edge]),
              `${degrees} degrees, alpha ${alpha}, ${edge}`
            ).toBeLessThanOrEqual(1);
          }
          await page.screenshot({
            path: info.outputPath(`selection-${degrees}-${alpha}.png`),
            fullPage: false,
          });
        }
      }
      const center = await page
        .locator('[data-ui="editor.canvas.selection-chrome"] polygon')
        .evaluate((polygon: SVGPolygonElement) => {
          const matrix = polygon.getScreenCTM()!;
          const start = polygon.points.getItem(0);
          const end = polygon.points.getItem(2);
          const point = new DOMPoint((start.x + end.x) / 2, (start.y + end.y) / 2).matrixTransform(
            matrix
          );
          return { x: point.x, y: point.y };
        });
      await page.mouse.click(center.x, center.y);
      const input = page.locator('textarea[data-fabric="textarea"]:focus');
      await expect(input).toHaveValue(TEXT);
      await input.press('ArrowDown');
      await input.press('End');
      await input.press('!');
      await expect(input).toHaveValue(`${TEXT}!`);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>(
              '[data-ui="editor.canvas.layer"] canvas.upper-canvas'
            )!;
            const pixels = canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let blue = 0;
            for (let offset = 0; offset < pixels.length; offset += 4) {
              if (
                pixels[offset + 3]! > 200 &&
                [37, 99, 235].every(
                  (value, channel) => Math.abs(pixels[offset + channel]! - value) <= 2
                )
              )
                blue += 1;
            }
            return blue;
          })
        )
        .toBeGreaterThan(5);
      await page.screenshot({
        path: info.outputPath('transparent-text-caret.png'),
        fullPage: false,
        caret: 'initial',
      });
      await input.press('Escape');
    } finally {
      await page.close();
    }
  });
}
