import { serializeCanvasObjects } from './serialization';
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
    ...(options.applyOptions.preserveViewport ? { preserveViewport: true } : {}),
    ...getViewportDevicePixelRatioBaselinePatch(options.viewportDevicePixelRatioBaseline),
    prepareObject: options.prepareObject,
    ...syncBackgroundLayerPatch,
    rebuildFrameDecorations: options.rebuildFrameDecorations,
  });

  if (options.applyOptions.freshSourceContent) {
    const sourceObject = options.canvas
      .getObjects()
      .find((object) => object.sniptaleRole === 'source');
    if (sourceObject) sourceObject.sniptaleContentLocked = false;
    prepared.normalizedDocument = {
      ...prepared.normalizedDocument,
      canvasJson: serializeCanvasObjects(options.canvas),
    };
  }

  applyPreparedEditorDocumentState({
    ...createPreparedEditorDocumentStateOptions({
      options,
      prepared,
      source,
    }),
    canvasObjects: options.canvas.getObjects(),
  });
}
