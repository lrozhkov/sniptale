import { test } from '../support/extension-fixture';
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
