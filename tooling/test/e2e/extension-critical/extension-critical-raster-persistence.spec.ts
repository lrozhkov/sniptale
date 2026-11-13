import type { FrameLocator, Page } from '@playwright/test';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  getRuntimeMessagesByType,
} from '../extension-critical.helpers';
import { openVisualHarness } from '../scenario-editor-visual/scenario-editor-visual.helpers';
import {
  rasterControl,
  rasterDocument,
  rasterDrag,
  rasterParameter,
  rasterSnapshot,
  rasterSourcePixel,
  sourceClientPoint,
} from '../support/raster-tools-probe';

type EditorSurface = Page | FrameLocator;
const control = (surface: EditorSurface, name: string) =>
  surface.locator(`[data-ui="editor.raster.${name}"]:visible`);

async function parameter(surface: EditorSurface, name: string) {
  const target = control(surface, name);
  if (!(await target.count())) await control(surface, 'parameters').click();
  await expect(target).toBeVisible();
  return target;
}

async function selectSource(surface: EditorSurface, name = 'Source image') {
  const row = surface.locator('[data-editor-layer-id]').getByRole('button', { name, exact: true });
  await row.hover();
  await row.click();
  const permission = control(surface, 'allowContentEditing');
  if (await permission.count()) await permission.click();
  await expect(control(surface, 'fill')).toBeEnabled();
}

async function storedDocuments(
  page: Page,
  store: 'image_workspaces' | 'scenario_step_editor_documents',
  identity?: { field: 'aggregateId' | 'projectId'; value: string }
) {
  return page.evaluate(
    async ({ storeName, identity }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('sniptale-db');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const rows: unknown = await new Promise((resolve, reject) => {
          const records = db.transaction(storeName).objectStore(storeName);
          const request =
            identity?.field === 'aggregateId'
              ? records.get(identity.value)
              : identity?.field === 'projectId'
                ? records.index('projectId').getAll(identity.value)
                : records.getAll();
          request.onsuccess = () =>
            resolve(
              identity?.field === 'aggregateId'
                ? request.result === undefined
                  ? []
                  : [request.result]
                : request.result
            );
          request.onerror = () => reject(request.error);
        });
        if (!Array.isArray(rows)) throw new Error('Expected persisted document rows');
        return rows.map((row: unknown) => {
          if (typeof row !== 'object' || row === null || !('document' in row))
            throw new Error('Expected persisted document');
          if (
            identity &&
            (!(identity.field in row) || Reflect.get(row, identity.field) !== identity.value)
          )
            throw new Error('Persisted document belongs to another identity');
          const document = row.document;
          if (
            typeof document !== 'object' ||
            document === null ||
            !('canvasJson' in document) ||
            typeof document.canvasJson !== 'string'
          )
            throw new Error('Expected persisted canvas JSON');
          return document.canvasJson;
        });
      } finally {
        db.close();
      }
    },
    { storeName: store, identity }
  );
}

function retainedPlanes(canvasJson: string) {
  for (const field of ['Original', 'Color', 'Visibility', 'Key'])
    expect(canvasJson).toContain(`sniptaleRaster${field}Data`);
  expect(canvasJson).toContain('sniptaleRasterState');
}

function retainedCrop(canvasJson: string) {
  const canvas: unknown = JSON.parse(canvasJson);
  if (
    typeof canvas !== 'object' ||
    canvas === null ||
    !('objects' in canvas) ||
    !Array.isArray(canvas.objects)
  )
    throw new Error('Expected persisted canvas objects');
  const object: unknown = canvas.objects.find(
    (entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'sniptaleRasterState' in entry
  );
  if (typeof object !== 'object' || object === null || !('sniptaleRasterState' in object))
    throw new Error('Expected retained raster');
  const state = object.sniptaleRasterState;
  if (typeof state !== 'object' || state === null || !('crop' in state))
    throw new Error('Expected retained raster crop');
  const crop = state.crop;
  if (
    typeof crop !== 'object' ||
    crop === null ||
    !('x' in crop) ||
    !('y' in crop) ||
    !('width' in crop) ||
    !('height' in crop) ||
    typeof crop.x !== 'number' ||
    typeof crop.y !== 'number' ||
    typeof crop.width !== 'number' ||
    typeof crop.height !== 'number'
  )
    throw new Error('Expected source crop dimensions');
  return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
}

async function seedNative(page: Page, id: string, seed: boolean) {
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    editorDispatchBootstrapPayload: false,
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    storage: { 'sniptale-locale-preference': 'en' },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  if (!seed) return;
  await page.addInitScript((assetId) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 320, 180);
    context.fillStyle = '#2563eb';
    context.fillRect(40, 30, 100, 110);
    context.fillStyle = '#f4c542';
    context.fillRect(190, 30, 100, 110);
    const binary = atob(canvas.toDataURL('image/png').split(',')[1]!);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const createdAt = Date.now();
    window.__sniptaleHarnessBootstrap = {
      ...window.__sniptaleHarnessBootstrap,
      mediaLibrary: [
        {
          entry: {
            id: assetId,
            kind: 'screenshot',
            source: { kind: 'screenshot' },
            filename: 'retained-raster.png',
            originalFilename: 'retained-raster.png',
            createdAt,
            updatedAt: createdAt,
            size: blob.size,
            mimeType: blob.type,
            width: 320,
            height: 180,
            duration: null,
            sourceUrl: null,
            sourceTitle: null,
            sourceFavicon: null,
            tags: [],
            blob,
            lifecycle: { savedAt: createdAt, storageClass: 'library', updatedAt: createdAt },
          },
        },
      ],
    };
  }, id);
}

async function openNative(page: Page, hostOrigin: string, id: string) {
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?assetId=${id}`);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__sniptaleEditorHarness?.getInteractionState().historyReady ?? false
      )
    )
    .toBe(true);
  await selectSource(page, 'retained-raster.png');
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
}

async function nativeClick(page: Page, x: number, y: number) {
  const point = await sourceClientPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false, error: null });
}

async function imagePoint(surface: EditorSurface, x: number, y: number) {
  const rect = await surface
    .locator('[data-ui="editor.canvas.document-checkerboard"]')
    .boundingBox();
  if (!rect) throw new Error('Missing actual source rectangle');
  return { x: rect.x + (rect.width * x) / 960, y: rect.y + (rect.height * y) / 540 };
}

async function embeddedDrag(
  page: Page,
  surface: FrameLocator,
  from: [number, number],
  to: [number, number]
) {
  await expect(control(surface, 'fill')).toBeEnabled();
  const a = await imagePoint(surface, ...from),
    b = await imagePoint(surface, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(control(surface, 'fill')).toBeEnabled();
}

async function embeddedPixel(surface: FrameLocator, x: number, y: number) {
  return surface.locator('canvas.lower-canvas').evaluate(
    (canvas, point) => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected native drawing canvas');
      const source = document.querySelector('[data-ui="editor.canvas.document-checkerboard"]');
      if (!source) throw new Error('Missing document rectangle');
      const rect = source.getBoundingClientRect(),
        target = canvas.getBoundingClientRect();
      const px = Math.floor(
        ((rect.left + (rect.width * point.x) / 960 - target.left) * canvas.width) / target.width
      );
      const py = Math.floor(
        ((rect.top + (rect.height * point.y) / 540 - target.top) * canvas.height) / target.height
      );
      return [...canvas.getContext('2d')!.getImageData(px, py, 1, 1).data];
    },
    { x, y }
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`native Save and fresh reopen retain raster planes and recovery ${viewport.name}`, async ({
    page,
    context,
    hostOrigin,
  }, info) => {
    const id = `retained-native-${viewport.name}`;
    const persisted = () =>
      storedDocuments(page, 'image_workspaces', { field: 'aggregateId', value: id });
    await page.setViewportSize(viewport.size);
    await seedNative(page, id, true);
    await openNative(page, hostOrigin, id);
    await rasterControl(page, 'fill').click();
    await nativeClick(page, 230, 80);
    const filled = await rasterSourcePixel(page, 230, 80);
    expect(filled).not.toEqual([244, 197, 66, 255]);
    await rasterControl(page, 'removeColor').click();
    await nativeClick(page, 20, 80);
    await expect.poll(() => rasterSourcePixel(page, 20, 80)).toEqual([0, 0, 0, 0]);
    await rasterControl(page, 'erase').click();
    await rasterDrag(page, [60, 85], [120, 85]);
    await expect.poll(() => rasterSourcePixel(page, 80, 85)).toEqual([0, 0, 0, 0]);
    await rasterControl(page, 'crop').click();
    await rasterDrag(page, [30, 20], [300, 160]);
    await (await rasterParameter(page, 'applyCrop')).click();
    await expect
      .poll(async () => (await rasterDocument(page)).canvasJson)
      .toContain('"crop":{"x":30,"y":20,"width":270,"height":140}');
    const saves = (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length;
    await page.locator('[data-ui="editor.floating.document-bar.save-button"]').click();
    await expect
      .poll(async () => (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length)
      .toBe(saves + 1);
    await expect
      .poll(async () => (await persisted())[0] ?? '')
      .toContain('"crop":{"x":30,"y":20,"width":270,"height":140}');
    retainedPlanes((await persisted())[0]!);
    await page.close();
    const reopened = await context.newPage();
    await reopened.setViewportSize(viewport.size);
    await seedNative(reopened, id, false);
    await openNative(reopened, hostOrigin, id);
    const document = await rasterDocument(reopened);
    retainedPlanes(document.canvasJson);
    const originalPixel = await reopened.evaluate(async (json) => {
      const canvas: unknown = JSON.parse(json);
      if (
        typeof canvas !== 'object' ||
        canvas === null ||
        !('objects' in canvas) ||
        !Array.isArray(canvas.objects)
      )
        throw new Error('Expected hydrated canvas objects');
      const original: unknown = canvas.objects.find(
        (entry: unknown) =>
          typeof entry === 'object' && entry !== null && 'sniptaleRasterOriginalData' in entry
      );
      if (
        typeof original !== 'object' ||
        original === null ||
        !('sniptaleRasterOriginalData' in original) ||
        typeof original.sniptaleRasterOriginalData !== 'string'
      )
        throw new Error('Missing hydrated original plane');
      const bitmap = await createImageBitmap(
        await (await fetch(original.sniptaleRasterOriginalData)).blob()
      );
      try {
        const output = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = output.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return [...context.getImageData(230, 80, 1, 1).data];
      } finally {
        bitmap.close();
      }
    }, document.canvasJson);
    expect(originalPixel).toEqual([244, 197, 66, 255]);
    expect(document.canvasJson).toContain('"crop":{"x":30,"y":20,"width":270,"height":140}');
    expect(await rasterSourcePixel(reopened, 230, 80)).toEqual(filled);
    expect(await rasterSourcePixel(reopened, 80, 85)).toEqual([0, 0, 0, 0]);
    expect(await rasterSourcePixel(reopened, 20, 80)).toEqual([0, 0, 0, 0]);
    await rasterControl(reopened, 'crop').click();
    await rasterDrag(reopened, [0, 0], [320, 180]);
    await (await rasterParameter(reopened, 'applyCrop')).click();
    await expect
      .poll(async () => (await rasterDocument(reopened)).canvasJson)
      .toContain('"crop":{"x":0,"y":0,"width":320,"height":180}');
    await rasterControl(reopened, 'erase').click();
    await (await rasterParameter(reopened, 'restore')).click();
    await rasterDrag(reopened, [60, 85], [120, 85]);
    await expect.poll(() => rasterSourcePixel(reopened, 80, 85)).toEqual([37, 99, 235, 255]);
    await rasterDrag(reopened, [10, 80], [25, 80]);
    await expect.poll(() => rasterSourcePixel(reopened, 20, 80)).toEqual([255, 255, 255, 255]);
    await reopened.screenshot({
      path: info.outputPath('native-reopened-restored.png'),
      fullPage: false,
    });
    await reopened.close();
  });

  test(`Scenario Apply and reopen retain raster planes without native workspace ${viewport.name}`, async ({
    page,
    extensionId,
  }, info) => {
    await openVisualHarness(
      page,
      `chrome-extension://${extensionId}`,
      'light',
      'en',
      viewport.size
    );
    const projectId = new URL(page.url()).searchParams.get('projectId');
    if (!projectId) throw new Error('Missing current Scenario project identity');
    const figure = page.locator('article#compare figure.guide-image-surface').first();
    const launch = figure.locator('[data-edit-image]');
    const child = page.frameLocator('.guide-image-editor iframe');
    const apply = child.locator('[data-ui="editor.floating.document-bar.apply-scenario-button"]');
    const open = async () => {
      await figure.click();
      await launch.click();
      await expect(apply).toBeEnabled();
      await selectSource(child);
    };
    await open();
    const original = await embeddedPixel(child, 200, 280);
    const outsideCrop = await embeddedPixel(child, 650, 100);
    await control(child, 'fill').click();
    const fill = await imagePoint(child, 650, 280);
    await page.mouse.click(fill.x, fill.y);
    await expect.poll(() => embeddedPixel(child, 650, 280)).not.toEqual([255, 255, 255, 255]);
    const filled = await embeddedPixel(child, 650, 280);
    await control(child, 'removeColor').click();
    const key = await imagePoint(child, 30, 280);
    await page.mouse.click(key.x, key.y);
    await expect.poll(() => embeddedPixel(child, 30, 280)).toEqual([0, 0, 0, 0]);
    await control(child, 'erase').click();
    await embeddedDrag(page, child, [175, 280], [230, 280]);
    await expect.poll(() => embeddedPixel(child, 200, 280)).toEqual([0, 0, 0, 0]);
    await control(child, 'crop').click();
    await embeddedDrag(page, child, [10, 150], [930, 450]);
    await (await parameter(child, 'applyCrop')).click();
    await expect.poll(() => embeddedPixel(child, 650, 100)).toEqual([0, 0, 0, 0]);
    await apply.click();
    await expect(page.locator('.guide-image-editor')).toHaveCount(0);
    await expect(page.getByRole('status').first()).toHaveText('Saved');
    const persisted = (
      await storedDocuments(page, 'scenario_step_editor_documents', {
        field: 'projectId',
        value: projectId,
      })
    )[0]!;
    retainedPlanes(persisted);
    // Fitted zoom and pointer rounding can shift either boundary by one source pixel.
    const crop = retainedCrop(persisted);
    expect(Math.abs(crop.x - 10)).toBeLessThanOrEqual(2);
    expect(Math.abs(crop.y - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(crop.width - 920)).toBeLessThanOrEqual(2);
    expect(Math.abs(crop.height - 300)).toBeLessThanOrEqual(2);
    expect(await storedDocuments(page, 'image_workspaces')).toEqual([]);
    await page.reload();
    await open();
    await expect.poll(() => embeddedPixel(child, 650, 280)).toEqual(filled);
    expect(await embeddedPixel(child, 200, 280)).toEqual([0, 0, 0, 0]);
    expect(await embeddedPixel(child, 30, 280)).toEqual([0, 0, 0, 0]);
    expect(await embeddedPixel(child, 650, 100)).toEqual([0, 0, 0, 0]);
    await control(child, 'crop').click();
    await embeddedDrag(page, child, [1, 1], [959, 539]);
    await (await parameter(child, 'applyCrop')).click();
    await expect.poll(() => embeddedPixel(child, 650, 100)).toEqual(outsideCrop);
    await control(child, 'erase').click();
    await (await parameter(child, 'restore')).click();
    await embeddedDrag(page, child, [175, 280], [230, 280]);
    await expect.poll(() => embeddedPixel(child, 200, 280)).toEqual(original);
    await embeddedDrag(page, child, [20, 280], [40, 280]);
    await expect.poll(() => embeddedPixel(child, 30, 280)).toEqual([232, 238, 245, 255]);
    await page.screenshot({
      path: info.outputPath('scenario-reopened-restored.png'),
      fullPage: false,
    });
    await apply.click();
    await expect(page.locator('.guide-image-editor')).toHaveCount(0);
    expect(await storedDocuments(page, 'image_workspaces')).toEqual([]);
  });
}
