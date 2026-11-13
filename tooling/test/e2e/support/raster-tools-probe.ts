import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

export const rasterControl = (page: Page, name: string) =>
  page.locator(`[data-ui="editor.raster.${name}"]:visible`);
export const rasterSnapshot = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness?.getRasterSnapshot() ?? null);
export const rasterDocument = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.exportDocument());
export const rasterHistory = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);

export async function openRasterFixture(
  page: Page,
  hostOrigin: string,
  size: { width: number; height: number },
  sourceSize = { width: 320, height: 180, mixed: false }
) {
  await page.setViewportSize(size);
  const dataUrl = await page.evaluate(({ width, height, mixed }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    if (mixed) {
      const pixels = context.createImageData(width, height);
      let seed = 7817;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const offset = (y * width + x) * 4;
          pixels.data[offset] = 80 + ((x + (seed >>> 24)) % 140);
          pixels.data[offset + 1] = 70 + ((y + (seed >>> 24)) % 150);
          pixels.data[offset + 2] = 90 + ((x + y + (seed >>> 24)) % 130);
          pixels.data[offset + 3] = 255;
        }
      context.putImageData(pixels, 0, 0);
    } else {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.scale(width / 320, height / 180);
    context.fillStyle = '#2563eb';
    context.fillRect(40, 30, 100, 110);
    context.fillStyle = '#f4c542';
    context.fillRect(190, 30, 100, 110);
    return canvas.toDataURL('image/png');
  }, sourceSize);
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
    },
    editorBootstrapPayload: { dataUrl, title: 'Raster tools proof' },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__sniptaleEditorHarness?.getInteractionState().historyReady ?? false
      )
    )
    .toBe(true);
  await page.bringToFront();
  const sourceRow = page.getByRole('button', { name: 'Source image', exact: true });
  await sourceRow.hover();
  await sourceRow.click();
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ available: true });
  await expect(rasterControl(page, 'toolbar')).toBeVisible();
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ permission: 'allowed' });
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
}

/** Read native Fabric projection independently of the product's raster coordinate module. */
export async function sourceClientPoint(page: Page, x: number, y: number) {
  return page.evaluate(
    ({ x, y }) => {
      const bridge = window.__sniptaleEditorHarness!;
      const id = bridge.getRasterSnapshot()?.targetId;
      const find = (
        objects: Array<Record<string, unknown>>
      ): Record<string, unknown> | undefined => {
        for (const object of objects) {
          if (object['sniptaleId'] === id) return object;
          const children = object['children'];
          if (Array.isArray(children)) {
            const records = children.filter(
              (value): value is Record<string, unknown> =>
                typeof value === 'object' && value !== null && !Array.isArray(value)
            );
            const nested = find(records);
            if (nested) return nested;
          }
        }
        return undefined;
      };
      const object = find(bridge.getCanvasObjects());
      const scene = bridge.getSceneProjection();
      if (!object || !scene) throw new Error('Raster target projection unavailable');
      const matrix = object['matrix'];
      const width = object['width'],
        height = object['height'];
      const cropX = object['cropX'],
        cropY = object['cropY'];
      if (
        !Array.isArray(matrix) ||
        matrix.length !== 6 ||
        !matrix.every(
          (value): value is number => typeof value === 'number' && Number.isFinite(value)
        ) ||
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        typeof cropX !== 'number' ||
        typeof cropY !== 'number'
      )
        throw new Error('Expected native image source geometry');
      const localX = x - cropX - width / 2,
        localY = y - cropY - height / 2;
      const sceneX = matrix[0] * localX + matrix[2] * localY + matrix[4];
      const sceneY = matrix[1] * localX + matrix[3] * localY + matrix[5];
      const v = scene.viewport;
      return {
        x:
          scene.rect.left +
          ((v[0]! * sceneX + v[2]! * sceneY + v[4]!) * scene.rect.width) / scene.width,
        y:
          scene.rect.top +
          ((v[1]! * sceneX + v[3]! * sceneY + v[5]!) * scene.rect.height) / scene.height,
      };
    },
    { x, y }
  );
}

export async function rasterDrag(
  page: Page,
  from: [number, number],
  to: [number, number],
  steps = 5
) {
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false });
  const a = await sourceClientPoint(page, ...from),
    b = await sourceClientPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false, error: null });
}

export async function rasterParameter(page: Page, name: string) {
  const control = rasterControl(page, name);
  if (!(await control.count())) await rasterControl(page, 'parameters').click();
  await expect(control).toBeVisible();
  return control;
}

export async function rasterSourcePixel(page: Page, x: number, y: number) {
  return page.evaluate(
    async ({ x, y }) => {
      const bridge = window.__sniptaleEditorHarness!;
      const id = bridge.getRasterSnapshot()?.targetId;
      const object = bridge
        .getCanvasObjects()
        .find((value) =>
          id ? value['sniptaleId'] === id : value['sniptaleType'] === 'source-image'
        );
      const src = object?.['src'];
      if (typeof src !== 'string') throw new Error('Native source URL missing');
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(x, y, 1, 1).data];
      } finally {
        bitmap.close();
      }
    },
    { x, y }
  );
}
