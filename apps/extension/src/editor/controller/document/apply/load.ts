import type { Canvas } from 'fabric';
import { createRichShapeObject } from '../../../objects/rich-shape';
import { logEditorSourceTrace } from '../../core/debug';

import type { SourceState } from '../../../document/model/source-state';
import { ensureEditorSourceLayer } from '../source';
import { prepareCanvasForDocumentLoad, renderCanvasAfterDocumentLoad } from './canvas';
import type { AppliedDocumentCanvasLoadCallbacks, LoadPreparedDocumentOptions } from './types';

export async function loadPreparedDocumentOnCanvas(
  options: LoadPreparedDocumentOptions & AppliedDocumentCanvasLoadCallbacks
): Promise<SourceState | null> {
  await options.canvas.loadFromJSON(options.prepared.normalizedDocument.canvasJson);
  const canvasPrepareOptions: Parameters<typeof prepareCanvasForDocumentLoad>[0] = {
    canvas: options.canvas,
    canvasSize: options.prepared.canvasSize,
    zoomLevel: options.zoomLevel,
  };
  if (options.viewportDevicePixelRatioBaseline !== undefined) {
    canvasPrepareOptions.viewportDevicePixelRatioBaseline =
      options.viewportDevicePixelRatioBaseline;
  }
  prepareCanvasForDocumentLoad(canvasPrepareOptions);
  options.upgradeLegacyArrowObjects();
  options.canvas.getObjects().forEach((object) => options.prepareObject(object));
  restoreRichShapeObjects(options.canvas, options.prepared.normalizedDocument.richShapes ?? [], {
    prepareObject: options.prepareObject,
  });
  logEditorSourceTrace('canvas:json-loaded', {
    objectCount: options.canvas.getObjects().length,
  });

  const source = await ensureEditorSourceLayer({
    canvas: options.canvas,
    source: options.prepared.source,
    prepareObject: options.prepareObject,
  });
  logEditorSourceTrace('canvas:source-ready', {
    objectCount: options.canvas.getObjects().length,
    hasSource: Boolean(source),
  });

  await options.syncBackgroundLayer?.(
    options.prepared.normalizedDocument.frame,
    options.prepared.canvasSize
  );
  await options.rebuildFrameDecorations();
  renderCanvasAfterDocumentLoad(options.canvas);
  return source;
}

export function restoreRichShapeObjects(
  canvas: Canvas,
  richShapes: NonNullable<
    LoadPreparedDocumentOptions['prepared']['normalizedDocument']['richShapes']
  >,
  callbacks: Pick<AppliedDocumentCanvasLoadCallbacks, 'prepareObject'>
): void {
  richShapes.forEach((shape) => {
    const object = createRichShapeObject(shape);
    if (!object) {
      return;
    }
    callbacks.prepareObject(object);
    canvas.add(object);
  });
}
