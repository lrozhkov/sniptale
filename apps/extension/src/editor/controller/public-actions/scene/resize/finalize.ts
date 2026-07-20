import { finalizeEditorSceneMutation } from '../helpers';

import type { SceneResizeOptions } from './types';

type FinalizeSceneResizeOptions = Pick<
  SceneResizeOptions,
  | 'canvas'
  | 'zoomLevel'
  | 'viewportDevicePixelRatioBaseline'
  | 'getCanvasDocumentSize'
  | 'ensureReachableObjects'
  | 'rebuildFrameDecorations'
  | 'commitHistory'
  | 'syncRuntimeState'
>;

export function getViewportDevicePixelRatioBaselinePatch(
  viewportDevicePixelRatioBaseline?: number
): { viewportDevicePixelRatioBaseline?: number } {
  return viewportDevicePixelRatioBaseline === undefined ? {} : { viewportDevicePixelRatioBaseline };
}

export function finalizeSceneResizeMutation(options: FinalizeSceneResizeOptions): void {
  if (!options.canvas) {
    return;
  }

  finalizeEditorSceneMutation({
    canvas: options.canvas,
    zoomLevel: options.zoomLevel,
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
    getCanvasDocumentSize: options.getCanvasDocumentSize,
    ensureReachableObjects: options.ensureReachableObjects,
    rebuildFrameDecorations: options.rebuildFrameDecorations,
    commitHistory: options.commitHistory,
    syncRuntimeState: options.syncRuntimeState,
  });
}
