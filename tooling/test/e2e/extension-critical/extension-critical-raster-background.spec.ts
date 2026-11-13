import type { Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../apps/extension/src/features/editor/document/constants';
import type {
  EditorDocument,
  EditorFrameSettings,
} from '../../../../apps/extension/src/features/editor/document/types';
import {
  rasterControl,
  rasterDocument,
  rasterHistory,
  rasterParameter,
  rasterSnapshot,
  rasterSourcePixel,
  sourceClientPoint,
} from '../support/raster-tools-probe';

type Fit = EditorFrameSettings['backgroundImageFit'];
const fits: Fit[] = ['cover', 'contain', 'stretch', 'fit-width', 'fit-height', 'tile'];
const crop = { x: 4, y: 2, width: 56, height: 28 };

async function fixture(
  page: Page,
  hostOrigin: string,
  viewport: { width: number; height: number },
  kind: 'background' | 'source' | 'image',
  fit: Fit = 'cover',
  blur = 0
) {
  await page.setViewportSize(viewport);
  const sources = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 64, 32);
    context.fillStyle = '#2563eb';
    context.fillRect(12, 6, 36, 20);
    context.fillStyle = '#f4c542';
    context.fillRect(44, 6, 16, 20);
    const cropped = document.createElement('canvas');
    cropped.width = 56;
    cropped.height = 28;
    cropped.getContext('2d')!.drawImage(canvas, 4, 2, 56, 28, 0, 0, 56, 28);
    return { full: canvas.toDataURL('image/png'), cropped: cropped.toDataURL('image/png') };
  });
  const frame: EditorFrameSettings = {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    backgroundMode: kind === 'background' ? 'image' : 'color',
    backgroundColor: 'transparent',
    backgroundImageData: kind === 'background' ? sources.cropped : null,
    backgroundImageFit: fit,
    backgroundBlurAmount: blur,
  };
  const metadata = {
    sniptaleRasterOriginalData: sources.full,
    sniptaleRasterState: { version: 1, width: 64, height: 32, crop },
  };
  const base = {
    type: 'Image',
    version: '6.9.1',
    src: sources.full,
    width: 64,
    height: 32,
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    sniptaleId: 'base',
    sniptaleType: 'source-image',
    sniptaleRole: 'source',
    sniptaleLabel: 'Base source',
    sniptaleLocked: true,
    sniptaleContentLocked: false,
    visible: kind === 'source',
  };
  const target =
    kind === 'background'
      ? {
          ...base,
          ...metadata,
          src: sources.cropped,
          width: 56,
          height: 28,
          sniptaleId: 'raster-target',
          sniptaleRole: 'background',
          sniptaleType: 'background',
          sniptaleLabel: 'Raster background',
          visible: true,
          flipX: true,
          sniptaleBackgroundMode: 'image',
          sniptaleBackgroundImageData: sources.cropped,
          sniptaleBackgroundFit: fit,
          sniptaleBackgroundBlurAmount: blur,
        }
      : {
          ...base,
          ...metadata,
          sniptaleId: 'raster-target',
          sniptaleType: kind === 'source' ? 'source-image' : 'image',
          sniptaleRole: kind === 'source' ? 'source' : 'annotation',
          sniptaleLabel: 'Raster target',
          width: 56,
          height: 28,
          cropX: 4,
          cropY: 2,
          left: 132,
          top: 76,
          originX: 'center',
          originY: 'center',
          scaleX: 2.3,
          scaleY: 1.7,
          angle: 23,
          skewX: 9,
          flipX: true,
          visible: true,
        };
  const vector = {
    type: 'Rect',
    version: '6.9.1',
    sniptaleId: 'vector-isolation',
    sniptaleType: 'shape',
    sniptaleRole: 'annotation',
    sniptaleLabel: 'Upper vector',
    sniptaleDrawingJson: JSON.stringify({
      version: 1,
      object: {
        id: 'vector-isolation',
        kind: 'rectangle',
        bounds: { x: 0, y: 0, width: 320, height: 180 },
        color: '#22c55e40',
        fillColor: '#22c55e40',
        width: 1,
        rotation: 0,
      },
    }),
    left: 0,
    top: 0,
    width: 320,
    height: 180,
    fill: '#22c55e40',
    opacity: 0.25,
    strokeWidth: 0,
    originX: 'left',
    originY: 'top',
  };
  const document: EditorDocument = {
    version: 3,
    sourceImageData: sources.full,
    sourceName: 'Raster native proof',
    sourceWidth: 64,
    sourceHeight: 32,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: kind === 'source' ? 132 : 0,
    sourceTop: kind === 'source' ? 76 : 0,
    sourceDisplayWidth: 64,
    sourceDisplayHeight: 32,
    frame,
    canvasJson: JSON.stringify({
      objects: kind === 'source' ? [target, vector] : [base, target, vector],
    }),
  };
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': viewport.width === 1920 ? 'dark' : 'light',
    },
    editorBootstrapPayload: { dataUrl: sources.full, title: 'Native raster proof', document },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
    )
    .toBe(true);
  await page.bringToFront();
  const row = page.getByRole('button', {
    name: kind === 'background' ? 'Raster background' : 'Raster target',
    exact: true,
  });
  await row.hover();
  await row.click();
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({ available: true, permission: 'allowed', targetId: 'raster-target' });
  await expect(rasterControl(page, 'toolbar')).toBeVisible();
  return sources;
}

async function nativeTarget(page: Page) {
  return page.evaluate(() =>
    window
      .__sniptaleEditorHarness!.getCanvasObjects()
      .find((object) => object['sniptaleId'] === 'raster-target')
  );
}
async function vectorJson(page: Page) {
  return page.evaluate(() => {
    const parsed: unknown = JSON.parse(window.__sniptaleEditorHarness!.exportDocument().canvasJson);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('objects' in parsed) ||
      !Array.isArray(parsed.objects)
    )
      throw new Error('Expected canvas objects');
    const vector: unknown = parsed.objects.find(
      (object: unknown) =>
        typeof object === 'object' &&
        object !== null &&
        'sniptaleId' in object &&
        object.sniptaleId === 'vector-isolation'
    );
    if (!vector || typeof vector !== 'object') throw new Error('Expected editable upper vector');
    return JSON.stringify(vector);
  });
}
async function backgroundPoint(page: Page, fit: Fit, blur: number, x: number, y: number) {
  return page.evaluate(
    ({ fit, blur, x, y, crop }) => {
      const bridge = window.__sniptaleEditorHarness!,
        object = bridge
          .getCanvasObjects()
          .find((object) => object['sniptaleId'] === 'raster-target'),
        scene = bridge.getSceneProjection();
      if (!object || !scene) throw new Error('Expected background projection');
      const matrix = object['matrix'],
        width = object['width'],
        height = object['height'];
      if (
        !Array.isArray(matrix) ||
        !matrix.every((v): v is number => typeof v === 'number') ||
        typeof width !== 'number' ||
        typeof height !== 'number'
      )
        throw new Error('Invalid native background');
      let localX = x - crop.x - width / 2,
        localY = y - crop.y - height / 2;
      if (blur || fit === 'tile') {
        const sx = width / crop.width,
          sy = height / crop.height;
        const scale =
          fit === 'contain'
            ? Math.min(sx, sy)
            : fit === 'fit-width'
              ? sx
              : fit === 'fit-height'
                ? sy
                : Math.max(sx, sy);
        const scaleX = fit === 'tile' ? 1 : fit === 'stretch' ? sx : scale,
          scaleY = fit === 'tile' ? 1 : fit === 'stretch' ? sy : scale;
        const left = fit === 'tile' ? 0 : Math.round((width - crop.width * scaleX) / 2),
          top = fit === 'tile' ? 0 : Math.round((height - crop.height * scaleY) / 2);
        localX = left + (x - crop.x) * scaleX - width / 2;
        localY = top + (y - crop.y) * scaleY - height / 2;
      }
      const sx = matrix[0]! * localX + matrix[2]! * localY + matrix[4]!,
        sy = matrix[1]! * localX + matrix[3]! * localY + matrix[5]!;
      const v = scene.viewport;
      return {
        x: scene.rect.left + ((v[0]! * sx + v[2]! * sy + v[4]!) * scene.rect.width) / scene.width,
        y: scene.rect.top + ((v[1]! * sx + v[3]! * sy + v[5]!) * scene.rect.height) / scene.height,
      };
    },
    { fit, blur, x, y, crop }
  );
}
async function visibleSourcePoint(page: Page, x: number, y: number) {
  let point = await sourceClientPoint(page, x, y);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('Expected page viewport');
  if (
    point.x < 150 ||
    point.x > viewport.width - 390 ||
    point.y < 150 ||
    point.y > viewport.height - 90
  ) {
    const desired = { x: (viewport.width - 390) / 2, y: (viewport.height + 100) / 2 };
    const start = {
      x: Math.min(400, viewport.width - 450),
      y: Math.min(300, viewport.height - 140),
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(start.x + desired.x - point.x, start.y + desired.y - point.y, {
      steps: 8,
    });
    await page.mouse.up({ button: 'middle' });
    point = await sourceClientPoint(page, x, y);
  }
  expect(point.x).toBeGreaterThan(100);
  expect(point.x).toBeLessThan(viewport.width - 350);
  expect(point.y).toBeGreaterThan(120);
  expect(point.y).toBeLessThan(viewport.height - 50);
  return point;
}

async function renderedPixel(page: Page, point: { x: number; y: number }) {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
    );
    if (!canvas) throw new Error('Canvas missing');
    const rect = canvas.getBoundingClientRect();
    return [
      ...canvas
        .getContext('2d')!
        .getImageData(
          Math.floor(((x - rect.left) * canvas.width) / rect.width),
          Math.floor(((y - rect.top) * canvas.height) / rect.height),
          1,
          1
        ).data,
    ];
  }, point);
}
async function retainedPixel(
  page: Page,
  slot: 'sniptaleRasterVisibilityData' | 'backgroundImageData',
  x: number,
  y: number
) {
  return page.evaluate(
    async ({ slot, x, y }) => {
      const document = window.__sniptaleEditorHarness!.exportDocument();
      let source: unknown = document.frame.backgroundImageData;
      if (slot !== 'backgroundImageData') {
        const parsed: unknown = JSON.parse(document.canvasJson);
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('objects' in parsed) ||
          !Array.isArray(parsed.objects)
        )
          throw new Error('Expected canvas JSON');
        const object: unknown = parsed.objects.find(
          (value: unknown) =>
            typeof value === 'object' &&
            value !== null &&
            'sniptaleId' in value &&
            value.sniptaleId === 'raster-target'
        );
        if (!object || typeof object !== 'object' || !(slot in object))
          throw new Error('Expected retained mask');
        source = Reflect.get(object, slot);
      }
      if (typeof source !== 'string') throw new Error('Expected image source');
      const bitmap = await createImageBitmap(await (await fetch(source)).blob());
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
          context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(x, y, 1, 1).data];
      } finally {
        bitmap.close();
      }
    },
    { slot, x, y }
  );
}

for (const [index, fit] of fits.entries()) {
  for (const blur of [0, 8]) {
    const viewport = PRIMARY_BROWSER_VIEWPORTS[index % 2]!;
    test(`managed background ${fit} blur${blur} native pixels ${viewport.name}`, async ({
      page,
      hostOrigin,
    }, info) => {
      const sources = await fixture(page, hostOrigin, viewport.size, 'background', fit, blur);
      const before = await nativeTarget(page),
        vector = await vectorJson(page),
        history = await rasterHistory(page);
      const point = await backgroundPoint(page, fit, blur, 32, 16),
        beforePixel = await renderedPixel(page, point);
      await rasterControl(page, 'erase').click();
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => rasterHistory(page)).toBe(history + 1);
      await expect
        .poll(() => retainedPixel(page, 'sniptaleRasterVisibilityData', 32, 16))
        .toEqual([0, 0, 0, 255]);
      await expect
        .poll(() => retainedPixel(page, 'backgroundImageData', 28, 14))
        .toEqual([0, 0, 0, 0]);
      await expect
        .poll(() => rasterSnapshot(page))
        .toMatchObject({ available: true, targetId: 'raster-target' });
      const after = await nativeTarget(page);
      expect(after).toMatchObject({
        sniptaleId: 'raster-target',
        sniptaleType: 'background',
        positionLocked: true,
        contentLocked: false,
        matrix: before?.['matrix'],
      });
      const accepted = await rasterDocument(page);
      expect(accepted.frame).toMatchObject({
        backgroundMode: 'image',
        backgroundImageFit: fit,
        backgroundBlurAmount: blur,
      });
      expect(accepted.canvasJson).toContain(sources.full);
      expect(accepted.canvasJson).toContain('"crop":{"x":4,"y":2,"width":56,"height":28}');
      expect(await vectorJson(page)).toBe(vector);
      await expect
        .poll(async () => {
          const pixel = await renderedPixel(page, point);
          return pixel
            .slice(0, 3)
            .reduce((sum, value, index) => sum + Math.abs(value - beforePixel[index]!), 0);
        })
        .toBeGreaterThan(40);
      await page.screenshot({ path: info.outputPath('background-erased.png'), fullPage: false });
      await (await rasterParameter(page, 'restore')).click();
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => rasterHistory(page)).toBe(history + 2);
      await expect
        .poll(async () => {
          const pixel = await renderedPixel(page, point);
          return Math.max(...pixel.map((value, index) => Math.abs(value - beforePixel[index]!)));
        })
        .toBeLessThanOrEqual(1);
      expect(await vectorJson(page)).toBe(vector);
    });
  }
}

for (const [index, zoom] of [0.2, 1, 4].entries()) {
  for (const kind of ['source', 'image'] as const) {
    const viewport = PRIMARY_BROWSER_VIEWPORTS[index % 2]!;
    test(`transformed ${kind} zoom${zoom * 100} source alignment ${viewport.name}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await fixture(page, hostOrigin, viewport.size, kind);
      await page.evaluate((zoom) => window.__sniptaleEditorHarness!.setZoomLevel(zoom), zoom);
      const row = page.getByRole('button', { name: 'Raster target', exact: true });
      await row.hover();
      await row.click();
      const before = await nativeTarget(page),
        vector = await vectorJson(page),
        history = await rasterHistory(page);
      const point = await visibleSourcePoint(page, 32, 16),
        beforePixel = await renderedPixel(page, point);
      await rasterControl(page, 'erase').click();
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => rasterHistory(page)).toBe(history + 1);
      await expect.poll(() => rasterSourcePixel(page, 32, 16)).toEqual([0, 0, 0, 0]);
      expect(await nativeTarget(page)).toMatchObject({
        matrix: before?.['matrix'],
        width: 56,
        height: 28,
        cropX: 4,
        cropY: 2,
      });
      expect(await vectorJson(page)).toBe(vector);
      await expect
        .poll(async () => {
          const pixel = await renderedPixel(page, point);
          return pixel
            .slice(0, 3)
            .reduce((sum, value, index) => sum + Math.abs(value - beforePixel[index]!), 0);
        })
        .toBeGreaterThan(40);
      await page.screenshot({ path: info.outputPath('transformed-erased.png'), fullPage: false });
      await (await rasterParameter(page, 'restore')).click();
      await page.mouse.click(point.x, point.y);
      await expect.poll(() => rasterHistory(page)).toBe(history + 2);
      expect(await rasterSourcePixel(page, 32, 16)).toEqual([37, 99, 235, 255]);
      expect(await vectorJson(page)).toBe(vector);
    });
  }
}

test('managed tiled blurred background keeps rectangle selection for Hide, Restore and next brush', async ({
  page,
  hostOrigin,
}, info) => {
  await fixture(page, hostOrigin, { width: 1920, height: 900 }, 'background', 'tile', 8);
  const history = await rasterHistory(page),
    vector = await vectorJson(page),
    before = await nativeTarget(page);
  await rasterControl(page, 'select').click();
  const from = await backgroundPoint(page, 'tile', 8, 20, 10),
    to = await backgroundPoint(page, 'tile', 8, 40, 22);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({ selection: 'active', tool: 'select', busy: false });
  await (await rasterParameter(page, 'hideSelected')).click();
  await expect.poll(() => rasterHistory(page)).toBe(history + 1);
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({
      available: true,
      targetId: 'raster-target',
      selection: 'active',
      tool: 'select',
      busy: false,
      permission: 'allowed',
    });
  await expect
    .poll(() => retainedPixel(page, 'sniptaleRasterVisibilityData', 32, 16))
    .toEqual([0, 0, 0, 255]);
  expect(await retainedPixel(page, 'sniptaleRasterVisibilityData', 18, 16)).toEqual([
    255, 255, 255, 255,
  ]);
  await rasterControl(page, 'erase').first().click();
  await (await rasterParameter(page, 'restore')).click();
  const center = await backgroundPoint(page, 'tile', 8, 32, 16);
  await page.mouse.click(center.x, center.y);
  await expect.poll(() => rasterHistory(page)).toBe(history + 2);
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({ selection: 'active', tool: 'restore', busy: false });
  await expect
    .poll(() => retainedPixel(page, 'backgroundImageData', 28, 14))
    .toEqual([37, 99, 235, 255]);
  await rasterControl(page, 'erase').first().click();
  await page.mouse.click(center.x, center.y);
  await expect.poll(() => rasterHistory(page)).toBe(history + 3);
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({ selection: 'active', tool: 'erase', busy: false });
  expect(await retainedPixel(page, 'sniptaleRasterVisibilityData', 18, 16)).toEqual([
    255, 255, 255, 255,
  ]);
  expect(await retainedPixel(page, 'sniptaleRasterVisibilityData', 32, 16)).toEqual([0, 0, 0, 255]);
  expect(await vectorJson(page)).toBe(vector);
  expect(await nativeTarget(page)).toMatchObject({
    matrix: before?.['matrix'],
    sniptaleType: 'background',
    sniptaleId: 'raster-target',
  });
  expect((await rasterDocument(page)).frame).toMatchObject({
    backgroundMode: 'image',
    backgroundImageFit: 'tile',
    backgroundBlurAmount: 8,
  });
  await page.screenshot({
    path: info.outputPath('background-selection-retained.png'),
    fullPage: false,
  });
});
