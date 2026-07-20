import { applyEditorControllerDocumentState } from './state';
import { logEditorOpenTrace } from '../core/debug';
import type { ApplyEditorControllerDocumentOptions } from './apply-types';
import { createApplyEditorControllerDocumentSharedOptions } from './params';

export async function runApplyEditorControllerDocument(
  options: ApplyEditorControllerDocumentOptions
): Promise<void> {
  const { canvas, syncRuntimeState } = options;
  if (!canvas) {
    logEditorOpenTrace('apply:skipped', {
      reason: 'canvas-missing',
      canvasWidth: options.document.canvasWidth,
      canvasHeight: options.document.canvasHeight,
    });
    return;
  }

  logEditorOpenTrace('apply:start', {
    canvasWidth: options.document.canvasWidth,
    canvasHeight: options.document.canvasHeight,
    sourceWidth: options.document.sourceWidth,
    sourceHeight: options.document.sourceHeight,
  });
  await applyEditorControllerDocumentState({
    canvas,
    ...createApplyEditorControllerDocumentSharedOptions(options),
  });
  logEditorOpenTrace('apply:state-ready', {
    canvasObjects: canvas.getObjects().length,
  });
  syncRuntimeState();
  logEditorOpenTrace('apply:runtime-synced', {
    canvasObjects: canvas.getObjects().length,
  });
}
