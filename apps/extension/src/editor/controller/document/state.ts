import { applyEditorDocumentToCanvas } from './apply/orchestrate';
import { applyPreparedEditorDocumentState } from './lifecycle-helpers';
import type { ApplyEditorControllerDocumentStateOptions } from './apply-types';
import { createPreparedEditorDocumentStateOptions } from './params';

function getViewportDevicePixelRatioBaselinePatch(viewportDevicePixelRatioBaseline?: number) {
  return viewportDevicePixelRatioBaseline === undefined ? {} : { viewportDevicePixelRatioBaseline };
}

export async function applyEditorControllerDocumentState(
  options: ApplyEditorControllerDocumentStateOptions
): Promise<void> {
  const syncBackgroundLayerPatch = options.syncBackgroundLayer
    ? { syncBackgroundLayer: options.syncBackgroundLayer }
    : {};
  const { prepared, source } = await applyEditorDocumentToCanvas({
    canvas: options.canvas,
    document: options.document,
    zoomLevel: options.zoomLevel,
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
    prepareObject: options.prepareObject,
    ...syncBackgroundLayerPatch,
    rebuildFrameDecorations: options.rebuildFrameDecorations,
  });

  applyPreparedEditorDocumentState({
    ...createPreparedEditorDocumentStateOptions({
      options,
      prepared,
      source,
    }),
    canvasObjects: options.canvas.getObjects(),
  });
}
