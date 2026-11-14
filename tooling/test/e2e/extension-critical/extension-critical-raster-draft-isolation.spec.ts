import type { Page } from '@playwright/test';
import type { EditorDocument } from '../../../../apps/extension/src/features/editor/document/types';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../apps/extension/src/features/editor/document/constants';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  applyHarnessBootstrap,
  EDITOR_HARNESS_PATH,
  E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
  getRuntimeMessagesByType,
} from '../extension-critical.helpers';
import {
  enterRasterEditing,
  rasterControl,
  rasterDocument,
  rasterSnapshot,
  sourceClientPoint,
} from '../support/raster-tools-probe';

async function openFixture(
  page: Page,
  origin: string,
  size: { width: number; height: number },
  grouped: boolean
) {
  await page.setViewportSize(size);
  const dataUrl = await page.evaluate(() => {
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
    return canvas.toDataURL('image/png');
  });
  const image = {
    type: 'Image',
    version: '6.9.1',
    src: dataUrl,
    width: 100,
    height: 110,
    cropX: 40,
    cropY: 30,
    left: grouped ? -50 : 300,
    top: grouped ? -55 : 200,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
    sniptaleId: 'draft-image',
    sniptaleType: 'image',
    sniptaleRole: 'annotation',
    sniptaleLabel: 'Draft image',
    sniptaleContentLocked: false,
    sniptaleEffects: [],
    sniptaleRasterOriginalData: dataUrl,
    sniptaleRasterState: {
      version: 1,
      width: 320,
      height: 180,
      crop: { x: 40, y: 30, width: 100, height: 110 },
    },
  };
  const hiddenSource = {
    ...image,
    sniptaleId: 'source-image-layer',
    sniptaleType: 'source-image',
    sniptaleRole: 'source',
    sniptaleLabel: 'Hidden source',
    left: 0,
    top: 0,
    visible: false,
  };
  const target = grouped
    ? {
        type: 'Group',
        version: '6.9.1',
        left: 300,
        top: 200,
        width: 100,
        height: 110,
        originX: 'left',
        originY: 'top',
        strokeWidth: 0,
        sniptaleId: 'draft-group',
        sniptaleType: 'group',
        sniptaleLabel: 'Draft group',
        subTargetCheck: true,
        interactive: true,
        objects: [image],
      }
    : image;
  const document: EditorDocument = {
    version: 3,
    sourceImageData: dataUrl,
    sourceName: 'Draft isolation',
    sourceWidth: 320,
    sourceHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    canvasWidth: 800,
    canvasHeight: 500,
    frame: {
      ...DEFAULT_EDITOR_FRAME_SETTINGS,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: 'transparent',
      backgroundImageData: null,
    },
    canvasJson: JSON.stringify({ objects: [hiddenSource, target] }),
  };
  await applyHarnessBootstrap(page, {
    storage: { 'sniptale-locale-preference': 'en' },
    apiBehavior: E2E_RUNTIME_SUCCESS_API_BEHAVIOR,
    editorBootstrapPayload: { dataUrl, title: 'Draft isolation', document },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${origin}${EDITOR_HARNESS_PATH}`);
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
    )
    .toBe(true);
  await page.bringToFront();
  if (grouped) {
    const group = page
      .locator('[data-editor-layer-id="draft-group"]')
      .getByRole('button', { name: 'Draft group (1)', exact: true });
    await group.hover();
    await group.click();
  }
  const row = page.locator('[data-editor-layer-id="draft-image"]');
  if (await row.evaluate((node) => node.tagName === 'BUTTON')) await row.click();
  else {
    const button = row.getByRole('button', { name: 'Draft image', exact: true });
    await button.hover();
    await button.click();
  }
  await expect
    .poll(() => rasterSnapshot(page))
    .toMatchObject({ available: true, targetId: 'draft-image', permission: 'allowed' });
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1.25));
  const viewport = page.locator('[data-ui="editor.canvas.viewport"]');
  const scroll = await viewport.evaluate((node) => {
    const before = { x: node.scrollLeft, y: node.scrollTop };
    node.scrollLeft += 23;
    node.scrollTop += 19;
    return { before, after: { x: node.scrollLeft, y: node.scrollTop } };
  });
  expect(scroll.after).not.toEqual(scroll.before);
  await enterRasterEditing(page);
  await expect.poll(() => workspace(page)).not.toBeNull();
  return await workspace(page);
}

async function workspace(page: Page, aggregateId?: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const rows: unknown = await new Promise((resolve, reject) => {
        const store = db.transaction('image_workspaces').objectStore('image_workspaces');
        const request = id ? store.get(id) : store.getAll();
        request.onsuccess = () => resolve(id ? request.result : request.result[0]);
        request.onerror = () => reject(request.error);
      });
      if (rows === undefined) return null;
      if (
        typeof rows !== 'object' ||
        rows === null ||
        !('aggregateId' in rows) ||
        typeof rows.aggregateId !== 'string' ||
        !('revision' in rows) ||
        typeof rows.revision !== 'number' ||
        !('document' in rows)
      )
        throw new Error('Invalid workspace record');
      return {
        id: rows.aggregateId,
        revision: rows.revision,
        document: JSON.stringify(rows.document),
      };
    } finally {
      db.close();
    }
  }, aggregateId);
}

async function nativePixel(page: Page, x: number, y: number) {
  const point = await sourceClientPoint(page, x, y);
  return page.locator('canvas.lower-canvas').evaluate((node, point) => {
    if (!(node instanceof HTMLCanvasElement)) throw new Error('Expected native canvas');
    const rect = node.getBoundingClientRect();
    return [
      ...node
        .getContext('2d')!
        .getImageData(
          Math.floor(((point.x - rect.left) * node.width) / rect.width),
          Math.floor(((point.y - rect.top) * node.height) / rect.height),
          1,
          1
        ).data,
    ];
  }, point);
}

async function canonical(page: Page) {
  return page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());
}

async function pngPixel(page: Page, dataUrl: string, x: number, y: number) {
  const point = await sourceClientPoint(page, x, y);
  return page.evaluate(
    async ({ dataUrl, point }) => {
      const boundary = document.querySelector('[data-ui="editor.canvas.document-checkerboard"]');
      if (!boundary) throw new Error('Expected document rectangle');
      const rect = boundary.getBoundingClientRect();
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      try {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return [
          ...context.getImageData(
            Math.floor(((point.x - rect.left) * bitmap.width) / rect.width),
            Math.floor(((point.y - rect.top) * bitmap.height) / rect.height),
            1,
            1
          ).data,
        ];
      } finally {
        bitmap.close();
      }
    },
    { dataUrl, point }
  );
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  for (const grouped of [false, true]) {
    test(`native raster drafts stay outside capture and storage ${grouped ? 'grouped' : 'single'} ${viewport.name}`, async ({
      page,
      hostOrigin,
    }, info) => {
      const record = await openFixture(page, hostOrigin, viewport.size, grouped);
      if (!record) throw new Error('Initial durable workspace missing');
      const accepted = await rasterDocument(page);
      const rendered = await canonical(page);
      expect(await pngPixel(page, rendered, 80, 85)).toEqual([37, 99, 235, 255]);
      const assertAccepted = async () => {
        expect((await rasterDocument(page)).canvasJson).toBe(accepted.canvasJson);
        expect(await canonical(page)).toBe(rendered);
        expect(await workspace(page, record.id)).toEqual(record);
      };
      await rasterControl(page, 'erase').click();
      await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false });
      const a = await sourceClientPoint(page, 60, 85),
        b = await sourceClientPoint(page, 120, 85);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await expect.poll(() => nativePixel(page, 80, 85)).toEqual([0, 0, 0, 0]);
      await assertAccepted();
      await expect.poll(() => nativePixel(page, 80, 85)).toEqual([0, 0, 0, 0]);
      await page.screenshot({ path: info.outputPath('held-brush-visible.png'), fullPage: false });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect.poll(() => nativePixel(page, 80, 85)).toEqual([37, 99, 235, 255]);
      await rasterControl(page, 'crop').click();
      await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false, tool: 'crop' });
      await expect.poll(() => nativePixel(page, 230, 80)).toEqual([244, 197, 66, 255]);
      expect(await pngPixel(page, await canonical(page), 230, 80)).toEqual([0, 0, 0, 0]);
      await assertAccepted();
      await page.screenshot({ path: info.outputPath('crop-preview-visible.png'), fullPage: false });
      await rasterControl(page, 'cursor').click();
      await rasterControl(page, 'erase').click();
      await rasterControl(page, 'adjustments').click();
      const amount = page.getByRole('textbox', { name: 'Amount', exact: true });
      await expect(amount).toBeVisible();
      await amount.fill('0.7');
      await expect.poll(() => nativePixel(page, 80, 85)).not.toEqual([37, 99, 235, 255]);
      await assertAccepted();
      await page.screenshot({
        path: info.outputPath('correction-preview-visible.png'),
        fullPage: false,
      });
      const clipboardPng = page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const write = navigator.clipboard.write.bind(navigator.clipboard);
            navigator.clipboard.write = async (items) => {
              try {
                const item = items[0];
                if (!item) throw new Error('Clipboard image missing');
                const blob = await item.getType('image/png');
                const dataUrl = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    typeof reader.result === 'string'
                      ? resolve(reader.result)
                      : reject(new Error('Clipboard bytes unavailable'));
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(blob);
                });
                await write(items);
                navigator.clipboard.write = write;
                resolve(dataUrl);
              } catch (error) {
                reject(error);
                throw error;
              }
            };
          })
      );
      await page.locator('[data-ui="editor.floating.document-bar.copy-button"]').click();
      await expect
        .poll(() => page.evaluate(() => window.__sniptaleHarness!.getClipboardWrites().length))
        .toBe(1);
      expect(await pngPixel(page, await clipboardPng, 80, 85)).toEqual([37, 99, 235, 255]);
      const saves = (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length;
      await page.locator('[data-ui="editor.floating.document-bar.save-button"]').click();
      await expect
        .poll(async () => (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).length)
        .toBe(saves + 1);
      const save = (await getRuntimeMessagesByType(page, MessageType.EXECUTE_SAVE)).at(-1)!;
      if (typeof save['dataUrl'] !== 'string') throw new Error('Save omitted PNG bytes');
      expect(await pngPixel(page, save['dataUrl'], 80, 85)).toEqual([37, 99, 235, 255]);
      await assertAccepted();
    });
  }
}
