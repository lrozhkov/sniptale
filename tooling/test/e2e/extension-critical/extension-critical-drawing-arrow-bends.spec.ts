import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { triggerExtensionAction } from '../support/recording-action';

async function pixelsNear(canvas: Locator, point: { x: number; y: number }, blue = false) {
  return canvas.evaluate(
    (node, { point, blue }) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Missing drawing canvas');
      const box = node.getBoundingClientRect();
      if (node.width === 0 || node.height === 0 || box.width === 0 || box.height === 0) return 0;
      const scale = node.width / box.width;
      const scaleY = node.height / box.height;
      const data = node
        .getContext('2d')!
        .getImageData(
          Math.round((point.x - box.x - 7) * scale),
          Math.round((point.y - box.y - 7) * scaleY),
          Math.ceil(14 * scale),
          Math.ceil(14 * scaleY)
        ).data;
      let count = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3]! < 40) continue;
        if (blue ? data[offset + 2]! > data[offset]! + 40 : data[offset]! > data[offset + 1]! + 40)
          count++;
      }
      return count;
    },
    { point, blue }
  );
}

async function addSecondBend(
  page: Page,
  canvas: Locator,
  start: { x: number; y: number },
  length: number
) {
  const point = { x: start.x + length * 0.78125, y: start.y + 45 };
  const moved = { x: point.x, y: point.y + 40 };
  await page.mouse.move(point.x, point.y);
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await expect(canvas).toHaveCSS('cursor', 'none');
  await page.mouse.move(moved.x, moved.y, { steps: 5 });
  await page.mouse.up();
  return moved;
}

async function seedEditor(page: Page, assetId: string, theme: string) {
  await applyHarnessBootstrap(page, {
    preserveMediaLibrary: true,
    storage: { 'sniptale-theme-preference': theme },
  });
  await page.addInitScript((id) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 800, 500);
    const data = atob(canvas.toDataURL('image/png').split(',')[1]!);
    const blob = new Blob([Uint8Array.from(data, (value) => value.charCodeAt(0))], {
      type: 'image/png',
    });
    const now = Date.now();
    window.__sniptaleHarnessBootstrap = {
      ...window.__sniptaleHarnessBootstrap,
      editorDispatchBootstrapPayload: false,
      mediaLibrary: [
        {
          entry: {
            id,
            kind: 'screenshot',
            source: { kind: 'screenshot' },
            filename: 'Bends.png',
            originalFilename: 'Bends.png',
            createdAt: now,
            updatedAt: now,
            size: blob.size,
            mimeType: 'image/png',
            width: 800,
            height: 500,
            duration: null,
            sourceUrl: 'https://example.com/',
            sourceTitle: 'Bends',
            sourceFavicon: null,
            tags: [],
            lifecycle: { savedAt: now, storageClass: 'library', updatedAt: now },
            blob,
          },
        },
      ],
    };
  }, assetId);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`freehand bends image editor ${name}`, async ({ context, hostOrigin }, info) => {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
    const assetId = `bends-${name}`;
    const theme = size.width === 1280 ? 'light' : 'dark';
    await page.setViewportSize(size);
    await seedEditor(page, assetId, theme);
    try {
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?assetId=${assetId}`);
      await page.locator('[data-ui="editor.floating.tool-rail.arrow"]').click();
      await page.locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]').click();
      const upper = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
      const ink = page.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas');
      const bounds = (await upper.boundingBox())!;
      const start = {
        x: Math.round(bounds.x + bounds.width * 0.3),
        y: Math.round(bounds.y + bounds.height * 0.4),
      };
      const end = { x: start.x + 300, y: start.y };
      const middle = { x: start.x + 150, y: start.y };
      const bend = { x: middle.x, y: middle.y + 80 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => pixelsNear(ink, middle)).toBeGreaterThan(0);
      const beforeBend = await page.evaluate(() =>
        window.__sniptaleEditorHarness!.getInteractionState()
      );
      const controls = page.locator('[data-ui="editor.canvas.selection-controls"] circle');
      await expect(controls).toHaveCount(2);
      await page.mouse.move(middle.x, middle.y);
      await expect(controls).toHaveCount(3);
      await expect
        .poll(() =>
          controls.evaluateAll(
            (nodes, point) =>
              nodes.some((node) => {
                const bounds = node.getBoundingClientRect();
                return (
                  Math.hypot(
                    bounds.x + bounds.width / 2 - point.x,
                    bounds.y + bounds.height / 2 - point.y
                  ) <= 2
                );
              }),
            middle
          )
        )
        .toBe(true);
      await page.screenshot({ path: info.outputPath('editor-hover.png'), fullPage: false });
      await page.mouse.down();
      await expect(upper).toHaveCSS('cursor', 'none');
      await page.mouse.move(bend.x, bend.y, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
      await expect.poll(() => pixelsNear(ink, middle)).toBe(0);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState())
      ).toEqual({
        historyIndex: beforeBend.historyIndex + 1,
        transform: null,
      });
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await expect.poll(() => pixelsNear(ink, middle)).toBeGreaterThan(0);
      await expect.poll(() => pixelsNear(ink, bend)).toBe(0);
      await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
      await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
      await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
      await page.mouse.click(bend.x, bend.y);
      await page.mouse.click(middle.x, middle.y);
      await expect(controls).toHaveCount(0);
      await page.mouse.click(bend.x, bend.y);
      const second = await addSecondBend(page, upper, start, 300);
      await expect.poll(() => pixelsNear(ink, second)).toBeGreaterThan(0);
      await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
      await page.mouse.move(bend.x, bend.y);
      await page.mouse.down();
      await page.mouse.move(bend.x, bend.y + 40, { steps: 3 });
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
      await expect.poll(() => pixelsNear(ink, { x: bend.x, y: bend.y + 40 })).toBe(0);
      await expect(upper).not.toHaveCSS('cursor', 'none');
      await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + 20);
      await page.screenshot({ path: info.outputPath('editor-bent.png'), fullPage: false });
      await expect(page.locator('[data-ui="autosave-control"] > button')).toHaveAttribute(
        'title',
        /: (Saved|Сохранено)$/u
      );
      await expect
        .poll(() =>
          page.evaluate(async (id) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open('sniptale-db');
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            try {
              const value = await new Promise<unknown>((resolve, reject) => {
                const request = db
                  .transaction('image_workspaces', 'readonly')
                  .objectStore('image_workspaces')
                  .get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              });
              return JSON.stringify(value)?.includes('bendPoints') ?? false;
            } finally {
              db.close();
            }
          }, assetId)
        )
        .toBe(true);
      const reopened = await context.newPage();
      try {
        await reopened.setViewportSize(size);
        await applyHarnessBootstrap(reopened, {
          preserveMediaLibrary: true,
          editorDispatchBootstrapPayload: false,
          storage: { 'sniptale-theme-preference': theme },
        });
        await reopened.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}?assetId=${assetId}`);
        await expect
          .poll(() =>
            pixelsNear(
              reopened.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas'),
              bend
            )
          )
          .toBeGreaterThan(0);
        await expect
          .poll(() =>
            pixelsNear(
              reopened.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas'),
              second
            )
          )
          .toBeGreaterThan(0);
        await reopened.screenshot({
          path: info.outputPath('editor-reopened.png'),
          fullPage: false,
        });
        await reopened.mouse.click(bend.x, bend.y);
        await reopened.locator('[data-ui="content.toolbar.drawing-options.arrow.uniform"]').click();
        const reopenedInk = reopened.locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas');
        await expect.poll(() => pixelsNear(reopenedInk, middle)).toBeGreaterThan(0);
        await expect.poll(() => pixelsNear(reopenedInk, bend)).toBe(0);
        await reopened
          .locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]')
          .click();
        await expect.poll(() => pixelsNear(reopenedInk, middle)).toBeGreaterThan(0);
        await expect.poll(() => pixelsNear(reopenedInk, second)).toBe(0);
        await reopened.screenshot({
          path: info.outputPath('editor-style-reset.png'),
          fullPage: false,
        });
      } finally {
        await reopened.close();
      }
    } catch (error) {
      await page.screenshot({ path: info.outputPath('editor-failure.png'), fullPage: false });
      throw error;
    } finally {
      await page.close();
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['drawing', 'video-recording', 'crop'] as const) {
    test(`freehand bends ${mode} ${name}`, async ({ context, extensionId, hostOrigin }, info) => {
      test.setTimeout(90000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      try {
        const theme = size.width === 1280 ? 'light' : 'dark';
        await popup.evaluate(
          async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
          theme
        );
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page
          .locator(`[data-ui="content.toolbar.mode-option.${mode === 'crop' ? 'drawing' : mode}"]`)
          .click();
        const recording = mode === 'video-recording' && size.width === 1920;
        if (recording) {
          await triggerExtensionAction(context, extensionId, page);
          await page.bringToFront();
          await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
          await page
            .getByRole('alertdialog')
            .getByRole('button', { name: /^(Continue|Продолжить)$/u })
            .click();
          await expect(
            page.locator('[data-ui="content.toolbar.video-recording.pause"]')
          ).toBeVisible({ timeout: 30000 });
        }
        if (mode === 'crop') {
          await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
          await page.mouse.move(200, 180);
          await page.mouse.down();
          await page.mouse.move(950, 440, { steps: 4 });
          await page.mouse.up();
          await page.locator('[data-ui="content.crop.mode.drawing"]').click();
        }
        const scope = page.locator(
          mode === 'crop'
            ? '[data-ui="content.crop.drawing-slot"]'
            : '[data-ui="content.toolbar.root"]'
        );
        const arrow = scope.locator('[data-ui="content.toolbar.drawing.arrow"]');
        await arrow.click();
        const freehand = scope.locator(
          '[data-ui="content.toolbar.drawing-options.arrow.freehand"]'
        );
        if (!(await freehand.isVisible())) await arrow.click();
        await freehand.click();
        const surface = page
          .locator(
            mode === 'crop'
              ? '[data-ui="content.crop.drawing-layer"]'
              : '[data-ui="content.drawing.surface"]'
          )
          .first();
        const ink = surface.locator('canvas.sniptale-drawing-canvas');
        await expect(ink).toHaveAttribute('tabindex', '0');
        const chrome = surface.locator('[data-ui="content.drawing.selection-chrome"]');
        const region =
          mode === 'crop'
            ? (await page.locator('.sniptale-selection-final-frame').boundingBox())!
            : null;
        const start = region ? { x: region.x + 100, y: region.y + 70 } : { x: 300, y: 260 };
        const end = { x: start.x + 400, y: start.y };
        const middle = { x: start.x + 200, y: start.y };
        const bend = { x: middle.x, y: middle.y + 80 };
        const canceled = { x: bend.x, y: bend.y + 40 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();
        await page.mouse.move(middle.x, middle.y);
        await expect(ink).toHaveCSS('cursor', 'grab');
        await expect.poll(() => pixelsNear(chrome, middle, true)).toBeGreaterThan(0);
        await page.screenshot({ path: info.outputPath('hover-point.png'), fullPage: false });
        await page.mouse.down();
        await expect(ink).toHaveCSS('cursor', 'none');
        await page.mouse.move(bend.x, bend.y, { steps: 5 });
        await page.mouse.up();
        await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
        await expect.poll(() => pixelsNear(ink, middle)).toBe(0);
        const second = await addSecondBend(page, ink, start, 400);
        await expect.poll(() => pixelsNear(ink, second)).toBeGreaterThan(0);
        await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
        if (mode !== 'video-recording') {
          const undo = page.locator(
            `[data-ui="${mode === 'crop' ? 'content.crop.undo' : 'content.toolbar.history-undo-button'}"]`
          );
          const redo = page.locator(
            `[data-ui="${mode === 'crop' ? 'content.crop.redo' : 'content.toolbar.history-redo-button'}"]`
          );
          await undo.click();
          await expect.poll(() => pixelsNear(ink, second)).toBe(0);
          await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
          await redo.click();
          await expect.poll(() => pixelsNear(ink, second)).toBeGreaterThan(0);
          await scope.locator('[data-ui="content.toolbar.drawing.select"]').click();
          await page.mouse.click(bend.x, bend.y);
        }
        await page.mouse.move(bend.x, bend.y);
        await page.mouse.down();
        await page.mouse.move(canceled.x, canceled.y, { steps: 3 });
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect.poll(() => pixelsNear(ink, bend)).toBeGreaterThan(0);
        await expect.poll(() => pixelsNear(ink, canceled)).toBe(0);
        await expect(ink).not.toHaveCSS('cursor', 'none');
        await page.mouse.move(800, 350);
        await page.screenshot({ path: info.outputPath('bent-arrow.png'), fullPage: false });
        if (mode !== 'video-recording') {
          await scope.locator('[data-ui="content.toolbar.drawing-options.arrow.uniform"]').click();
          await expect.poll(() => pixelsNear(ink, middle)).toBeGreaterThan(0);
          await expect.poll(() => pixelsNear(ink, bend)).toBe(0);
          await scope.locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]').click();
          await expect.poll(() => pixelsNear(ink, middle)).toBeGreaterThan(0);
          await expect.poll(() => pixelsNear(ink, second)).toBe(0);
          await page.screenshot({ path: info.outputPath('style-reset.png'), fullPage: false });
        }
        if (recording) {
          await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
          await expect(
            page.locator('[data-ui="content.toolbar.video-recording.pause"]')
          ).toHaveCount(0, { timeout: 30000 });
        }
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }
}
