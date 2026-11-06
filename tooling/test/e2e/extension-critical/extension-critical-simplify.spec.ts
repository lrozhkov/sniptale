import { test, expect } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import {
  mountSimplifyEditorHarness,
  assertEditorAutomaticSimplify,
  assertEditorManualGestures,
  assertEditorManualResize,
} from './extension-critical-simplify-editor.helpers';
import {
  grantNativeSimplifyCapture,
  prepareNativeSimplifySource,
  drawNativeAutomaticSimplify,
  assertNativeAutomaticRaster,
  assertNativeAutomaticResize,
  assertNativeManualMove,
  assertNativeManualResize,
  assertNativeNestedScrollSimplify,
  captureSimplifyToEditor,
} from './extension-critical-simplify-native.helpers';
import {
  observeSimplifyWorker,
  writeSimplifyWorkerObservation,
} from './extension-critical-simplify-observation.helpers';
import {
  startSimplifyRecording,
  assertSavedSimplifyRecording,
} from './extension-critical-simplify-recording.helpers';
import {
  assertFlattenedEditor,
  assertEditableSimplifyReopens,
} from './extension-critical-simplify-persistence.helpers';

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Simplify editor gestures use real product Worker ${name}`, async ({
    context,
    hostOrigin,
    extensionId,
  }, info) => {
    test.setTimeout(120_000);
    // The editor host harness mocks platform capture/storage. Only supplied-pixel compute crosses
    // this binding to an owned extension document and its actual background/offscreen Worker.
    const computeOwner = await context.newPage();
    await computeOwner.setViewportSize(size);
    await computeOwner.goto(
      `chrome-extension://${extensionId}/apps/extension/src/editor/index.html`
    );
    const editor = await context.newPage();
    await editor.setViewportSize(size);
    const commands: unknown[] = [];
    await editor.exposeFunction('__simplifyProductCompute', async (message: unknown) => {
      commands.push(message);
      return computeOwner.evaluate(async (request: unknown) => {
        return chrome.runtime.sendMessage(request);
      }, message);
    });
    try {
      await mountSimplifyEditorHarness(editor, hostOrigin);
      const { originalExport, start } = await assertEditorAutomaticSimplify(editor, commands, info);
      const simplifiedExport = await assertEditorManualGestures(
        editor,
        start,
        originalExport,
        info
      );
      await assertEditorManualResize(editor, simplifiedExport, info);
    } catch (error) {
      await editor.screenshot({
        path: info.outputPath('editor-failure-state.png'),
        fullPage: false,
      });
      throw error;
    } finally {
      await editor.close();
      await computeOwner.close();
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  for (const mode of ['drawing', 'crop', 'video-recording'] as const) {
    test(`Simplify ${mode} uses native capture and product Worker ${name}`, async ({
      context,
      extensionId,
      hostOrigin,
    }, info) => {
      test.setTimeout(150_000);
      const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
      page.setDefaultTimeout(15_000);
      try {
        await grantNativeSimplifyCapture(popup);
        await prepareNativeSimplifySource(page, mode);
        if (mode === 'video-recording') await startSimplifyRecording(context, extensionId, page);
        const offscreenTargetId = await observeSimplifyWorker(context, extensionId, page);
        const beforePixels = await drawNativeAutomaticSimplify(page, mode, info);
        if (offscreenTargetId)
          await writeSimplifyWorkerObservation(context, page, offscreenTargetId, mode, info);
        await assertNativeAutomaticRaster(page, mode, beforePixels, info);
        await assertNativeAutomaticResize(page, mode, info);
        await assertNativeManualMove(page, mode, info);
        await assertNativeManualResize(page, mode, info);
        if (mode === 'video-recording') {
          await assertSavedSimplifyRecording(page, popup, info);
        } else {
          const editor = await captureSimplifyToEditor(context, page, mode);
          await editor.setViewportSize(size);
          await assertFlattenedEditor(editor);
          await editor.screenshot({
            path: info.outputPath(`${mode}-flattened-editor.png`),
            fullPage: false,
          });
          if (mode === 'drawing') {
            await assertEditableSimplifyReopens(editor, {
              reopened: info.outputPath('simplify-native-editor-reopened.png'),
              edited: info.outputPath('simplify-native-editor-reopened-edited.png'),
            });
          }
          await editor.close();
        }
      } finally {
        await popup.close();
        await page.close();
      }
    });
  }
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Simplify resize stops at retained pixels on a scrolled page ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await grantNativeSimplifyCapture(popup);
      await page.evaluate(() => {
        document.body.style.minHeight = '3000px';
      });
      await prepareNativeSimplifySource(page, 'drawing');
      // Native TAB pixels follow the browser window, which can differ from its CSS test viewport.
      const nativeHeight = await popup.evaluate(async () => {
        const image = new Image();
        image.src = await chrome.tabs.captureVisibleTab({ format: 'png' });
        await image.decode();
        return image.naturalHeight;
      });
      const dpr = await page.evaluate(() => devicePixelRatio || 1);
      const sourceHeight = nativeHeight / dpr;
      const scroll = Math.max(80, Math.ceil(sourceHeight - size.height + 80));
      await drawNativeAutomaticSimplify(page, 'drawing', info);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.click(540, 240);
      await page.evaluate((top) => window.scrollTo(0, top), scroll);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
      const raster = page.locator('[data-ui="content.drawing.simplify-private"]');
      const before = await raster.boundingBox();
      if (!before) throw new Error('Source mask missing before edge resize');
      await page.mouse.move(before.x + before.width / 2, before.y + before.height);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2, size.height - 15, { steps: 8 });
      const during = await raster.boundingBox();
      expect(during).not.toBeNull();
      expect(during!.y + during!.height).toBeLessThanOrEqual(sourceHeight - scroll + 1);
      expect(during!.height).toBeGreaterThan(before.height + 20);
      await page.screenshot({ path: info.outputPath('source-edge-drag.png'), fullPage: false });
      await page.mouse.up();
      await expect(page.locator('[data-ui="content.drawing.simplify-pending"]')).toHaveCount(0, {
        timeout: 45_000,
      });
      await expect(raster).toHaveCount(1);
      const accepted = await raster.boundingBox();
      expect(accepted!.height).toBeGreaterThan(before.height + 20);
      expect(accepted!.y + accepted!.height).toBeLessThanOrEqual(sourceHeight - scroll + 1);
      await expect(page.getByText(/Could not acquire.*(?:source|image)/iu)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('source-edge-accepted.png'), fullPage: false });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Simplify keeps header and body aligned around an internal scroll container ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.setTimeout(120_000);
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await grantNativeSimplifyCapture(popup);
      const observer = await observeSimplifyWorker(context, extensionId, page);
      await assertNativeNestedScrollSimplify(page, info);
      if (observer) await writeSimplifyWorkerObservation(context, page, observer, 'nested', info);
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
