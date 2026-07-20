import {
  ensureEditorBrowserFrameOnTop,
  logEditorBrowserFrame,
  rebuildEditorControllerFrameDecorations,
} from '../../browser-frame/document';
import type { EditorControllerInstance } from '../types';

export async function rebuildFrameDecorationsForController(
  controller: EditorControllerInstance
): Promise<void> {
  await rebuildEditorControllerFrameDecorations({
    canvas: controller.canvas,
    canvasDocumentSize: controller.canvasDocumentSize,
    source: controller.source,
    browserFrameRenderToken: controller.browserFrameRenderToken,
    setBrowserFrameRenderToken: (token) => {
      controller.browserFrameRenderToken = token;
    },
    isBrowserFrameRenderTokenCurrent: (token) => controller.browserFrameRenderToken === token,
    ensureBrowserFrameOnTop: () => controller.ensureBrowserFrameOnTop(),
  });
}

export function logBrowserFrameForController(
  stage: string,
  payload: Record<string, unknown> = {}
): void {
  logEditorBrowserFrame(stage, payload);
}

export function ensureBrowserFrameOnTopForController(controller: EditorControllerInstance): void {
  ensureEditorBrowserFrameOnTop(controller.canvas);
}
