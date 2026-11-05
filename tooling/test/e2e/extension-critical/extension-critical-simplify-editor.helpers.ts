import type { Page, TestInfo } from '@playwright/test';
import { expect } from '../support/extension-fixture';
import { writeFile } from 'node:fs/promises';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { readSimplifyGlyph } from './extension-critical-simplify-pixels.helpers';

declare global {
  interface Window {
    __simplifyProductCompute?: (message: unknown) => Promise<unknown>;
  }
}

async function saveRendered(editor: Page) {
  const before = await editor.evaluate(
    () => window.__sniptaleHarness?.getRuntimeMessages().length ?? 0
  );
  await editor.locator('[data-ui="editor.floating.document-bar.save-button"]').click();
  await expect
    .poll(() =>
      editor.evaluate(
        ({ before, type }) => {
          return (
            window.__sniptaleHarness
              ?.getRuntimeMessages()
              .slice(before)
              .some(
                (value) =>
                  typeof value === 'object' &&
                  value !== null &&
                  'type' in value &&
                  value.type === type &&
                  'dataUrl' in value &&
                  typeof value.dataUrl === 'string'
              ) ?? false
          );
        },
        { before, type: MessageType.EXECUTE_SAVE }
      )
    )
    .toBe(true);
  return editor.evaluate((type) => {
    const messages = window.__sniptaleHarness?.getRuntimeMessages() ?? [];
    for (const message of messages.toReversed()) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === type &&
        'dataUrl' in message &&
        typeof message.dataUrl === 'string'
      )
        return message.dataUrl;
    }
    throw new Error('Exported image missing');
  }, MessageType.EXECUTE_SAVE);
}

async function readAcceptedSimplify(editor: Page) {
  return editor.evaluate(
    () =>
      window.__sniptaleEditorHarness
        ?.getCanvasObjects()
        .filter(
          (object) =>
            object['sniptaleType'] === 'simplify' &&
            typeof object['src'] === 'string' &&
            object['src'].startsWith('data:image/png;base64,')
        ) ?? []
  );
}

export async function mountSimplifyEditorHarness(editor: Page, hostOrigin: string) {
  await applyHarnessBootstrap(editor, {});
  await editor.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect(editor.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect
    .poll(() =>
      editor.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
    )
    .toBeGreaterThan(0);
  await editor.evaluate((type) => {
    window.__sniptaleHarness?.setRuntimeResponse(type, (request: unknown) => {
      if (!window.__simplifyProductCompute) throw new Error('Product compute binding missing');
      return window.__simplifyProductCompute(request);
    });
  }, MessageType.SIMPLIFY_COMMAND);
  await editor.evaluate((type) => {
    window.__sniptaleHarness?.setRuntimeResponse(type, { success: true });
  }, MessageType.EXECUTE_SAVE);
}

export async function assertEditorAutomaticSimplify(
  editor: Page,
  commands: unknown[],
  info: TestInfo
) {
  const originalExport = await saveRendered(editor);
  const accepted = () => readAcceptedSimplify(editor);
  await editor.locator('[data-ui="editor.floating.tool-rail.simplify"]').click();
  const automatic = editor.locator(
    '[data-ui="content.toolbar.drawing-options.simplify.automatic"]'
  );
  await expect(automatic).toBeVisible();
  const bounds = await editor
    .locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas')
    .boundingBox();
  if (!bounds) throw new Error('Editor drawing surface missing');
  const start = { x: bounds.x + bounds.width * 0.25, y: bounds.y + bounds.height * 0.3 };
  await editor.mouse.move(start.x, start.y);
  await editor.mouse.down();
  await editor.mouse.move(
    start.x + Math.min(160, bounds.width * 0.3),
    start.y + Math.min(70, bounds.height * 0.3),
    { steps: 5 }
  );
  await editor.mouse.up();
  await expect.poll(async () => (await accepted()).length).toBe(1);
  expect(
    commands.some(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'operation' in value &&
        value.operation === 'prepare'
    )
  ).toBe(true);
  expect(
    commands.some(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'operation' in value &&
        value.operation === 'render'
    )
  ).toBe(true);
  await editor.screenshot({ path: info.outputPath('simplify-automatic.png'), fullPage: false });
  return { originalExport, start };
}

export async function assertEditorManualGestures(
  editor: Page,
  start: { x: number; y: number },
  originalExport: string,
  info: TestInfo
) {
  const accepted = () => readAcceptedSimplify(editor);
  const automatic = editor.locator(
    '[data-ui="content.toolbar.drawing-options.simplify.automatic"]'
  );
  const beforeManual = (await accepted())[0]?.['src'];
  await automatic.click();
  await editor.locator('[data-ui="content.toolbar.drawing-options.simplify.manual-image"]').click();
  await expect.poll(async () => (await accepted())[0]?.['src']).not.toBe(beforeManual);
  const beforeMove = (await accepted())[0];
  await editor.keyboard.press('Escape');
  await editor.mouse.move(start.x + 35, start.y + 25);
  await editor.mouse.down();
  await editor.mouse.move(start.x + 60, start.y + 40, { steps: 5 });
  await editor.mouse.up();
  await expect.poll(async () => (await accepted())[0]?.['left']).not.toBe(beforeMove?.['left']);
  const simplifiedExport = await saveRendered(editor);
  expect(simplifiedExport).not.toBe(originalExport);
  await editor.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    if (!image.width || !image.height) throw new Error('Exported Simplify image cannot decode');
  }, simplifiedExport);
  await editor.screenshot({
    path: info.outputPath('simplify-manual-moved.png'),
    fullPage: false,
  });
  await editor.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
  await expect.poll(async () => (await accepted())[0]?.['left']).toBe(beforeMove?.['left']);
  await editor.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
  await expect.poll(async () => (await accepted())[0]?.['left']).not.toBe(beforeMove?.['left']);
  await editor
    .locator('[data-ui="editor.layers.list-viewport"] button[aria-pressed]')
    .first()
    .click();
  const beforeColor = (await accepted())[0]?.['src'];
  await editor
    .locator('[data-ui="content.toolbar.drawing-options.quick-colors"] button[title="#ff7f50"]')
    .click();
  await expect.poll(async () => (await accepted())[0]?.['src']).not.toBe(beforeColor);
  return simplifiedExport;
}

export async function assertEditorManualResize(
  editor: Page,
  simplifiedExport: string,
  info: TestInfo
) {
  const accepted = () => readAcceptedSimplify(editor);
  const controls = editor.locator('[data-ui="editor.canvas.selection-controls"]');
  await expect(controls.locator('circle')).toHaveCount(8);
  const editorMask = () =>
    controls.locator('circle').evaluateAll((nodes) => {
      const first = nodes[0]?.getBoundingClientRect(),
        last = nodes[4]?.getBoundingClientRect();
      if (!first || !last || !first.width || !last.width) return null;
      const x = first.x + first.width / 2,
        y = first.y + first.height / 2;
      return { x, y, width: last.x + last.width / 2 - x, height: last.y + last.height / 2 - y };
    });
  await expect(controls.locator('circle').first()).toBeVisible();
  const before = await editorMask();
  if (!before) throw new Error('Editor selection corners missing');
  const scaledWidth = (await accepted())[0]?.['scaledWidth'];
  if (typeof scaledWidth !== 'number' || scaledWidth <= 0)
    throw new Error('Editor object dimensions missing');
  const sceneZoom = before.width / scaledWidth;
  const documentGrid = editor.locator('[data-ui="editor.canvas.document-grid"]');
  const documentClip = (await documentGrid.count())
    ? documentGrid
    : editor.locator('[data-ui="editor.canvas.document-checkerboard"]');
  const visibleCanvas = await documentClip.boundingBox();
  if (!visibleCanvas) throw new Error('Visible editor raster bounds missing');
  await writeFile(
    info.outputPath('editor-glyph-sampling.json'),
    JSON.stringify(
      {
        mask: before,
        visibleDocument: visibleCanvas,
        backingCanvas: await editor
          .locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas')
          .boundingBox(),
      },
      null,
      2
    )
  );
  let glyphBefore = { count: 0, width: 0, height: 0, fillFraction: 0 };
  await expect
    .poll(async () => {
      glyphBefore = await readSimplifyGlyph(editor, before, visibleCanvas);
      return (
        glyphBefore.count > 0 &&
        glyphBefore.fillFraction > 0.85 &&
        Math.max(glyphBefore.width, glyphBefore.height) <= 32 * sceneZoom + 2
      );
    }, 'Editor ManualImage glyph must be capped at the actual canvas zoom')
    .toBe(true);
  await editor.screenshot({
    path: info.outputPath('simplify-editor-manual-before-resize.png'),
    fullPage: false,
    animations: 'disabled',
  });
  const east = await controls.locator('circle').nth(3).boundingBox();
  if (!east) throw new Error('Editor east resize control missing');
  const handle = { x: east.x + east.width / 2, y: east.y + east.height / 2 };
  await editor.mouse.move(handle.x, handle.y);
  await editor.mouse.down();
  await editor.mouse.move(handle.x + 120, handle.y, { steps: 6 });
  expect(
    (await readSimplifyGlyph(editor, { ...before, width: before.width + 120 }, visibleCanvas))
      .count,
    'Editor resize preview must show flat fill without the old glyph'
  ).toBe(0);
  await editor.screenshot({
    path: info.outputPath('simplify-editor-manual-resize-drag.png'),
    fullPage: false,
    animations: 'disabled',
  });
  await editor.mouse.up();
  await expect(controls.locator('circle')).toHaveCount(8);
  await expect
    .poll(async () => (await editorMask())?.width ?? 0)
    .toBeGreaterThan(before.width + 110);
  await expect
    .poll(async () => {
      const bounds = await editorMask();
      if (!bounds) return Infinity;
      const glyph = await readSimplifyGlyph(editor, bounds, visibleCanvas);
      if (!glyph.count || glyph.fillFraction <= 0.85) return Infinity;
      return Math.max(
        Math.abs(glyph.width - glyphBefore.width),
        Math.abs(glyph.height - glyphBefore.height)
      );
    }, 'Editor ManualImage resize must preserve actual glyph width and height')
    .toBeLessThanOrEqual(2);
  await editor.screenshot({
    path: info.outputPath('simplify-editor-manual-resized.png'),
    fullPage: false,
    animations: 'disabled',
  });
  expect(await saveRendered(editor)).not.toBe(simplifiedExport);
}
