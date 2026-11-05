import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { Page } from '@playwright/test';
import { expect } from '../support/extension-fixture';
import { dragSimplify } from './extension-critical-simplify-pixels.helpers';

async function readCurrentWorkspace(editor: Page) {
  const assetId = new URL(editor.url()).searchParams.get('assetId');
  if (!assetId) throw new Error('Current editor workspace identity missing');
  const value: unknown = await editor.evaluate(async (id) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sniptale-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction('image_workspaces', 'readonly')
          .objectStore('image_workspaces')
          .get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, assetId);
  if (!isPlainRecord(value) || typeof value['revision'] !== 'number') return null;
  const document = value['document'];
  if (!isPlainRecord(document) || typeof document['canvasJson'] !== 'string') return null;
  const canvas: unknown = JSON.parse(document['canvasJson']);
  if (!isPlainRecord(canvas) || !Array.isArray(canvas['objects'])) return null;
  return { revision: value['revision'], objects: canvas['objects'].filter(isPlainRecord) };
}

async function readPersistedSimplify(editor: Page) {
  const workspace = await readCurrentWorkspace(editor);
  const layers = workspace?.objects.filter((object) => object['sniptaleType'] === 'simplify');
  if (!workspace || layers?.length !== 1) return null;
  const layer = layers[0]!;
  if (typeof layer['sniptaleDrawingJson'] !== 'string') return null;
  const metadata: unknown = JSON.parse(layer['sniptaleDrawingJson']);
  const drawing = isPlainRecord(metadata) ? metadata['object'] : null;
  if (!isPlainRecord(drawing) || !isPlainRecord(drawing['settings'])) return null;
  return { revision: workspace.revision, layer, settings: drawing['settings'] };
}

export async function assertEditableSimplifyReopens(
  editor: Page,
  screenshotPaths: { reopened: string; edited: string }
) {
  await editor.locator('[data-ui="editor.floating.tool-rail.simplify"]').click();
  const automatic = editor.locator(
    '[data-ui="content.toolbar.drawing-options.simplify.automatic"]'
  );
  await expect(automatic).toBeVisible();
  // Choose explicit settings so preferences from earlier native cases cannot change this proof.
  if ((await automatic.getAttribute('aria-pressed')) !== 'true') await automatic.click();
  const bounds = await editor
    .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
    .boundingBox();
  if (!bounds) throw new Error('Native editor drawing surface missing');
  await dragSimplify(
    editor,
    { x: bounds.x + bounds.width * 0.3, y: bounds.y + bounds.height * 0.35 },
    { x: bounds.x + bounds.width * 0.6, y: bounds.y + bounds.height * 0.6 }
  );
  await expect.poll(() => readPersistedSimplify(editor)).not.toBeNull();
  await automatic.click();
  const manualImage = editor.locator(
    '[data-ui="content.toolbar.drawing-options.simplify.manual-image"]'
  );
  await manualImage.click();
  await editor
    .locator('[data-ui="content.toolbar.drawing-options.quick-colors"] button[title="#ff7f50"]')
    .click();
  await expect
    .poll(async () => (await readPersistedSimplify(editor))?.settings)
    .toMatchObject({
      automatic: false,
      manualKind: 'image',
      color: '#ff7f50',
    });
  const saved = await readPersistedSimplify(editor);
  if (!saved) throw new Error('Native Simplify workspace was not saved');
  const assetId = new URL(editor.url()).searchParams.get('assetId');
  await editor.reload();
  await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
  expect(new URL(editor.url()).searchParams.get('assetId')).toBe(assetId);
  await editor
    .locator('[data-ui="editor.layers.list-viewport"] button[aria-pressed]')
    .first()
    .click();
  await expect(automatic).toHaveAttribute('aria-pressed', 'false');
  await expect(manualImage).toHaveAttribute('aria-pressed', 'true');
  await expect(
    editor.locator(
      '[data-ui="content.toolbar.drawing-options.quick-colors"] button[title="#ff7f50"]'
    )
  ).toHaveAttribute('aria-pressed', 'true');
  await editor.screenshot({
    path: screenshotPaths.reopened,
    fullPage: false,
    animations: 'disabled',
  });
  await expect
    .poll(async () => (await readPersistedSimplify(editor))?.layer['sniptaleId'])
    .toBe(saved.layer['sniptaleId']);
  const canvas = editor.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas');
  const beforeEdit = await canvas.screenshot({ animations: 'disabled' });
  // A UI settings change after reload must rebuild the restored layer and commit it again.
  await automatic.click();
  await expect
    .poll(async () => (await readPersistedSimplify(editor))?.settings['automatic'])
    .toBe(true);
  await expect
    .poll(async () => (await readPersistedSimplify(editor))?.revision ?? 0)
    .toBeGreaterThan(saved.revision);
  await expect
    .poll(async () => (await readPersistedSimplify(editor))?.layer['src'])
    .not.toBe(saved.layer['src']);
  await expect
    .poll(async () => (await canvas.screenshot({ animations: 'disabled' })).equals(beforeEdit))
    .toBe(false);
  await editor.screenshot({
    path: screenshotPaths.edited,
    fullPage: false,
    animations: 'disabled',
  });
}

export async function assertFlattenedEditor(editor: Page) {
  await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect(editor.locator('[data-ui="editor.page.open-loading"]')).toBeHidden();
  await expect
    .poll(() =>
      editor.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
        );
        return (
          canvas &&
          canvas.width > 0 &&
          canvas.height > 0 &&
          canvas
            .getContext('2d')
            ?.getImageData(0, 0, canvas.width, canvas.height)
            .data.some((value, index) => index % 4 === 3 && value > 0)
        );
      })
    )
    .toBe(true);
  await expect
    .poll(
      () =>
        editor.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>(
            '[data-ui="editor.canvas.layer"] canvas.lower-canvas'
          );
          if (!canvas || !canvas.width || !canvas.height) return 0;
          const pixels = canvas
            .getContext('2d')
            ?.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!pixels) return 0;
          let coral = 0;
          for (let index = 0; index < pixels.length; index += 4)
            if (
              Math.abs(pixels[index]! - 255) <= 8 &&
              Math.abs(pixels[index + 1]! - 127) <= 8 &&
              Math.abs(pixels[index + 2]! - 80) <= 8
            )
              coral++;
          return coral;
        }),
      'Captured image must contain the accepted manual Simplify fill'
    )
    .toBeGreaterThan(1000);
  // Read only this editor's committed workspace; another capture cannot satisfy flattening.
  await expect
    .poll(async () => {
      const workspace = await readCurrentWorkspace(editor);
      return (
        workspace !== null &&
        workspace.revision > 0 &&
        workspace.objects.length > 0 &&
        workspace.objects.every((object) => object['sniptaleType'] !== 'simplify')
      );
    })
    .toBe(true);
}
