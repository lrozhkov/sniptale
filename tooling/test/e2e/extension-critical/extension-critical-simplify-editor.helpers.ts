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
  const start = await editor
    .locator('[data-ui="editor.canvas.layer"] canvas.lower-canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Editor source canvas missing');
      const rect = canvas.getBoundingClientRect();
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const sx = rect.width / width;
      const sy = rect.height / height;
      for (let y = 0; y < height; y += 2) {
        for (let x = 0; x + 4 < width; x += 2) {
          const first = (y * width + x) * 4;
          const second = first + 16;
          const dark = data[first]! < 15 && data[first + 1]! < 15 && data[first + 2]! < 15;
          const light = data[second]! > 240 && data[second + 1]! > 240 && data[second + 2]! > 240;
          const point = { x: rect.left + x * sx - 24, y: rect.top + y * sy - 16 };
          if (
            dark &&
            light &&
            data[first + 3] === 255 &&
            data[second + 3] === 255 &&
            point.x >= rect.left &&
            point.y >= rect.top &&
            point.x + 160 <= rect.right &&
            point.y + 70 <= rect.bottom &&
            point.x + 160 <= window.innerWidth &&
            point.y + 70 <= window.innerHeight
          )
            return point;
        }
      }
      throw new Error('Visible high-contrast editor source edge missing');
    });
  const roi = { x: start.x + 8, y: start.y + 8, width: 40, height: 20 };
  const beforePixels = await editor.screenshot({ clip: roi, fullPage: false });
  await editor.mouse.move(start.x, start.y);
  await editor.mouse.down();
  await editor.mouse.move(
    start.x + Math.min(160, bounds.width * 0.3),
    start.y + Math.min(70, bounds.height * 0.3),
    { steps: 5 }
  );
  const draftPixels = await editor.screenshot({ clip: roi, fullPage: false });
  expect(draftPixels.equals(beforePixels)).toBe(false);
  await editor.screenshot({ path: info.outputPath('editor-draft.png'), fullPage: false });
  await editor.evaluate(() => {
    const state = {
      active: true,
      released: false,
      samples: [] as { released: boolean; pending: boolean; blurred: boolean; accepted: boolean }[],
    };
    (window as typeof window & { __simplifyEditorFrames?: typeof state }).__simplifyEditorFrames =
      state;
    const released = () => {
      state.released = true;
    };
    window.addEventListener('pointerup', released, { capture: true, once: true });
    const sample = () => {
      if (!state.active) return;
      const pending = document.querySelector<HTMLElement>('[data-ui="editor.simplify.pending"]');
      state.samples.push({
        released: state.released,
        pending: Boolean(pending),
        blurred: Boolean(pending && getComputedStyle(pending).backdropFilter.includes('blur')),
        accepted:
          window.__sniptaleEditorHarness
            ?.getCanvasObjects()
            .some(
              (object) =>
                object['sniptaleType'] === 'simplify' &&
                typeof object['src'] === 'string' &&
                object['src'].startsWith('data:image/png;base64,')
            ) ?? false,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await editor.mouse.up();
  const releasePixels = await editor.screenshot({ clip: roi, fullPage: false });
  expect(releasePixels.equals(beforePixels)).toBe(false);
  await editor.screenshot({ path: info.outputPath('editor-release.png'), fullPage: false });
  await expect.poll(async () => (await accepted()).length).toBe(1);
  const frames = await editor.evaluate(() => {
    const state = (
      window as typeof window & {
        __simplifyEditorFrames?: {
          active: boolean;
          samples: { released: boolean; pending: boolean; blurred: boolean; accepted: boolean }[];
        };
      }
    ).__simplifyEditorFrames;
    if (!state) throw new Error('Editor Simplify frame observation missing');
    state.active = false;
    return state.samples;
  });
  const waiting = frames.filter((frame) => frame.released && !frame.accepted);
  expect(waiting.length).toBeGreaterThan(0);
  expect(waiting.every((frame) => frame.pending && frame.blurred)).toBe(true);
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
  const colorToggle = editor.locator('[data-ui="content.toolbar.drawing-options.simplify.color"]');
  if ((await colorToggle.getAttribute('aria-pressed')) !== 'true') await colorToggle.click();
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
