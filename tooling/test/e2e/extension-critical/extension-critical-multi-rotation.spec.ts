import type { Locator, Page } from '@playwright/test';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { expect, test } from '../support/extension-fixture';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

type Point = { x: number; y: number };
type TextGeometry = Point & { width: number; height: number; angle: number; text: string };

function rotate(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const horizontal = point.x - center.x;
  const vertical = point.y - center.y;
  return {
    x: center.x + horizontal * Math.cos(radians) - vertical * Math.sin(radians),
    y: center.y + horizontal * Math.sin(radians) + vertical * Math.cos(radians),
  };
}

function selectionFrame(objects: Array<Point & { width: number; height: number }>) {
  const left = Math.min(...objects.map((object) => object.x));
  const top = Math.min(...objects.map((object) => object.y));
  const right = Math.max(...objects.map((object) => object.x + object.width));
  const bottom = Math.max(...objects.map((object) => object.y + object.height));
  return {
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
    corner: { x: right, y: top },
  };
}

function stableEditorGeometry(objects: Array<Record<string, unknown>>) {
  return objects.map((object) =>
    Object.fromEntries(
      Object.entries(object).map(([key, value]) => [
        key,
        typeof value === 'number' ? Number(value.toFixed(6)) : value,
      ])
    )
  );
}

async function dragRotation(page: Page, start: Point, center: Point, degrees: number) {
  const end = rotate(start, center, degrees);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Control');
}

async function readTexts(objects: Locator): Promise<TextGeometry[]> {
  return objects.evaluateAll((nodes) =>
    nodes.map((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      return {
        x: parseFloat(style.left),
        y: parseFloat(style.top),
        width: parseFloat(style.width),
        height: parseFloat(style.height),
        angle: Number(element.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0),
        text: element.textContent ?? '',
      };
    })
  );
}

async function startRecording(page: Page, extensionId: string) {
  const cdp = await page.context().browser()!.newBrowserCDPSession();
  try {
    const targets = await cdp.send('Target.getTargets', {
      filter: [{ type: 'tab', exclude: false }, { exclude: true }],
    });
    const tab = targets.targetInfos.find((candidate) => candidate.url === page.url());
    if (!tab) throw new Error('Recording tab unavailable');
    await cdp.send('Extensions.triggerAction', { id: extensionId, targetId: tab.targetId });
  } finally {
    await cdp.detach();
  }
  await page.bringToFront();
  await page.locator('[data-ui="content.toolbar.video-recording.start"]').click();
  await expect(page.locator('[data-ui="content.toolbar.video-recording.pause"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function stopRecording(page: Page, popup: Page) {
  await page.locator('[data-ui="content.toolbar.video-recording.stop"]').click();
  await expect
    .poll(
      () =>
        popup.evaluate(async () => {
          const result = await chrome.runtime.sendMessage({
            type: 'GET_RECORDING_STATE',
            __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
          });
          return result.state.status;
        }),
      { timeout: 30_000 }
    )
    .toBe(VideoRecordingStatus.IDLE);
  const result = await popup.evaluate(async () => {
    const state = await chrome.runtime.sendMessage({
      type: 'GET_RECORDING_STATE',
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    });
    if (typeof state.postRecordResult?.recordingId !== 'string')
      throw new Error('Saved recording identity unavailable');
    return chrome.runtime.sendMessage({
      type: 'ACKNOWLEDGE_POST_RECORD_RESULT',
      recordingId: state.postRecordResult.recordingId,
      __sniptaleRuntimeFreshness: { issuedAtEpochMs: Date.now(), nonce: crypto.randomUUID() },
    });
  });
  expect(result).toMatchObject({ success: true, result: 'acknowledged' });
}

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
]) {
  for (const mode of ['drawing', 'crop', 'video-recording'] as const) {
    test(`multi-layer rotation in ${mode} at ${viewport.width}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(120_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport);
      page.setDefaultTimeout(15000);
      try {
        if (mode === 'crop') {
          await page.locator('[data-ui="content.toolbar.timer-button"]').click();
          await page
            .locator('[data-ui="content.toolbar.timer-menu"]')
            .getByText('No delay', { exact: true })
            .click();
          await page.locator('[data-ui="content.toolbar.capture-selection-button"]').click();
          await expect(page.locator('.sniptale-selection-container')).toBeVisible();
          await page.mouse.move(350, 180);
          await page.mouse.down();
          await page.mouse.move(1050, 440, { steps: 8 });
          await page.mouse.up();
          await expect(page.locator('.sniptale-selection-toolbar')).toBeVisible();
          await page.locator('[data-ui="content.crop.mode.drawing"]').click();
        } else {
          await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
          await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
          if (mode === 'video-recording') await startRecording(page, extensionId);
        }
        const controls =
          mode === 'crop' ? page.locator('[data-ui="content.crop.drawing-slot"]') : page;
        await controls.locator('[data-ui="content.toolbar.drawing.text"]').click();
        const input = page.locator('[data-ui="content.drawing.text-input"]');
        for (const [index, text] of ['First layer', 'Second layer'].entries()) {
          await page.mouse.click(480 + index * 230, 260 + index * 35);
          await input.fill(text);
          await input.press('Enter');
        }
        const objects = page.locator('[data-ui="content.drawing.text-object"]');
        await expect(objects).toHaveCount(2);
        const before = await readTexts(objects);
        await controls.locator('[data-ui="content.toolbar.drawing.select"]').click();
        await page.mouse.click(
          before[0]!.x + before[0]!.width / 2,
          before[0]!.y + before[0]!.height / 2
        );
        await page.keyboard.down('Shift');
        await page.mouse.click(
          before[1]!.x + before[1]!.width / 2,
          before[1]!.y + before[1]!.height / 2
        );
        await page.keyboard.up('Shift');
        const frame = selectionFrame(before);
        const distance = Math.hypot(
          frame.corner.x - frame.center.x,
          frame.corner.y - frame.center.y
        );
        const handle = {
          x: frame.corner.x + ((frame.corner.x - frame.center.x) / distance) * 18,
          y: frame.corner.y + ((frame.corner.y - frame.center.y) / distance) * 18,
        };
        await page.mouse.move(handle.x, handle.y);
        await expect(page.locator('canvas.sniptale-drawing-canvas[tabindex="0"]')).toHaveCSS(
          'cursor',
          'grab'
        );
        await page.screenshot({
          path: info.outputPath(`${mode}-group-handle.png`),
          fullPage: false,
        });
        await dragRotation(page, handle, frame.center, 30);
        await expect
          .poll(async () =>
            (await readTexts(objects)).every((object) => Math.abs(object.angle - 30) <= 1)
          )
          .toBe(true);
        const after = await readTexts(objects);
        for (const [index, object] of after.entries()) {
          const original = before[index]!;
          const expected = rotate(
            { x: original.x + original.width / 2, y: original.y + original.height / 2 },
            frame.center,
            object.angle
          );
          expect(object.x + object.width / 2).toBeCloseTo(expected.x, 2);
          expect(object.y + object.height / 2).toBeCloseTo(expected.y, 2);
          expect(object.width).toBe(original.width);
          expect(object.height).toBe(original.height);
          expect(object.text).toBe(original.text);
        }
        await expect(input).toHaveCount(0);
        await expect(objects).toHaveCount(2);
        await page.screenshot({
          path: info.outputPath(`${mode}-group-rotated.png`),
          fullPage: false,
        });
        if (mode !== 'video-recording') {
          const undo = page.locator(
            `[data-ui="${mode === 'crop' ? 'content.crop.undo' : 'content.toolbar.history-undo-button'}"]`
          );
          const redo = page.locator(
            `[data-ui="${mode === 'crop' ? 'content.crop.redo' : 'content.toolbar.history-redo-button'}"]`
          );
          await undo.click();
          await expect.poll(() => readTexts(objects)).toEqual(before);
          await redo.click();
          await expect.poll(() => readTexts(objects)).toEqual(after);
        } else await stopRecording(page, popup);
      } catch (error) {
        await page.screenshot({
          path: info.outputPath('failure-before-cleanup.png'),
          fullPage: false,
        });
        throw error;
      } finally {
        await page.close();
        await popup.close();
      }
    });
  }

  test(`multi-layer rotation in editor at ${viewport.width}`, async ({
    context,
    hostOrigin,
  }, info) => {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewportSize(viewport);
    await applyHarnessBootstrap(page, {});
    try {
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
      const canvas = page.locator('[data-ui="editor.canvas.layer"] canvas.upper-canvas');
      const box = (await canvas.boundingBox())!;
      const starts = [
        { x: box.x + box.width / 2 - 160, y: box.y + box.height / 2 - 30 },
        { x: box.x + box.width / 2 + 40, y: box.y + box.height / 2 + 30 },
      ];
      for (const [index, point] of starts.entries()) {
        await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
        await page.keyboard.press('Escape');
        await page.mouse.click(point.x, point.y);
        await page.keyboard.insertText(index === 0 ? 'First layer' : 'Second layer');
        await page.keyboard.press('Escape');
      }
      await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
      const clearSelection = () => page.mouse.click(box.x + 10, box.y + 10);
      const readObjects = () =>
        page.evaluate(() =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .filter((object) => object['sniptaleType'] === 'text')
        );
      await clearSelection();
      const before = await readObjects();
      expect(before).toHaveLength(2);
      const dimensions = before.map((object, index) => ({
        ...starts[index]!,
        width: Number(object['scaledWidth']),
        height: Number(object['scaledHeight']),
      }));
      await page.mouse.click(starts[0]!.x + 15, starts[0]!.y + 10);
      await page.keyboard.down('Shift');
      await page.mouse.click(starts[1]!.x + 15, starts[1]!.y + 10);
      await page.keyboard.up('Shift');
      const frame = selectionFrame(dimensions);
      const handle = { x: frame.corner.x + 20, y: frame.corner.y - 20 };
      await page.mouse.move(handle.x, handle.y);
      await expect(canvas).toHaveCSS('cursor', 'grab');
      await page.screenshot({ path: info.outputPath('editor-group-handle.png'), fullPage: false });
      await dragRotation(page, handle, frame.center, 30);
      await expect(page.locator('textarea[data-fabric="textarea"]:focus')).toHaveCount(0);
      await clearSelection();
      const after = await readObjects();
      expect(after).toHaveLength(2);
      const sceneFrame = selectionFrame(
        before.map((object) => ({
          x: Number(object['left']),
          y: Number(object['top']),
          width: Number(object['scaledWidth']),
          height: Number(object['scaledHeight']),
        }))
      );
      for (const [index, object] of after.entries()) {
        const original = before[index]!;
        const expected = rotate(
          {
            x: Number(original['left']) + Number(original['scaledWidth']) / 2,
            y: Number(original['top']) + Number(original['scaledHeight']) / 2,
          },
          sceneFrame.center,
          30
        );
        expect(Math.abs(Number(object['left']) - expected.x)).toBeLessThanOrEqual(4);
        expect(Math.abs(Number(object['top']) - expected.y)).toBeLessThanOrEqual(4);
        expect(Number(object['width'])).toBeCloseTo(Number(original['width']), 3);
        expect(Number(object['height'])).toBeCloseTo(Number(original['height']), 3);
      }
      await page.screenshot({ path: info.outputPath('editor-group-rotated.png'), fullPage: false });
      await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
      await clearSelection();
      await expect
        .poll(async () => stableEditorGeometry(await readObjects()))
        .toEqual(stableEditorGeometry(before));
      await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
      await clearSelection();
      await expect
        .poll(async () => stableEditorGeometry(await readObjects()))
        .toEqual(stableEditorGeometry(after));
    } catch (error) {
      await page.screenshot({
        path: info.outputPath('failure-before-cleanup.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await page.close();
    }
  });
}
