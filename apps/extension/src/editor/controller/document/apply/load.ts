import { normalizeEditorImageSettings } from '../../../../features/editor/document/constants';
import { applyImageSettings, readImageSettingsFromObject } from '../../../objects/image-style';
import { getSourceObject } from '../layers';
import type { Canvas } from 'fabric';
import { createRichShapeObject } from '../../../objects/rich-shape';
import { logEditorSourceTrace } from '../../core/debug';

import type { SourceState } from '../../../document/model/source-state';
import { ensureEditorSourceLayer } from '../source';
import { prepareCanvasForDocumentLoad, renderCanvasAfterDocumentLoad } from './canvas';
import type { AppliedDocumentCanvasLoadCallbacks, LoadPreparedDocumentOptions } from './types';
import { restoreFrameAnnotationProxyFromMetadata } from '../../../frame-annotation/proxy';
import { normalizeFrameAnnotationsInCanvasJson } from '../../../frame-annotation/import-boundary';
import { assertValidEditorDrawingCanvasJson } from '../../../document/import-boundary';
import { restoreCanonicalEditorDrawingObjects } from '../../../drawing/object/canonicalize';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { EditorCanvas } from '../../../document/canvas-surface/render-region';

export async function loadPreparedDocumentOnCanvas(
  options: LoadPreparedDocumentOptions & AppliedDocumentCanvasLoadCallbacks
): Promise<SourceState | null> {
  const canvasJson = normalizeFrameAnnotationsInCanvasJson(
    options.prepared.normalizedDocument.canvasJson
  );
  assertValidEditorDrawingCanvasJson(options.prepared.normalizedDocument.canvasJson);
  await options.canvas.loadFromJSON(canvasJson);
  const canvasPrepareOptions: Parameters<typeof prepareCanvasForDocumentLoad>[0] = {
    canvas: options.canvas,
    canvasSize: options.prepared.canvasSize,
    zoomLevel: options.zoomLevel,
    ...(options.preserveViewport ? { preserveViewport: true } : {}),
  };
  if (options.viewportDevicePixelRatioBaseline !== undefined) {
    canvasPrepareOptions.viewportDevicePixelRatioBaseline =
      options.viewportDevicePixelRatioBaseline;
  }
  prepareCanvasForDocumentLoad(canvasPrepareOptions);
  options.canvas.getObjects().forEach((object) => {
    if (!readEditorDrawingObject(object)) options.prepareObject(object);
    if (
      object.sniptaleType === 'frame-annotation' &&
      !restoreFrameAnnotationProxyFromMetadata(object)
    ) {
      throw new Error('Invalid frame annotation proxy');
    }
  });
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
  const sourceObject = getSourceObject(options.canvas);
  if (sourceObject) {
    applyImageSettings(
      sourceObject,
      readImageSettingsFromObject(
        sourceObject,
        normalizeEditorImageSettings(options.prepared.normalizedDocument.frame.sourceImage)
      )
    );
  }
  restoreCanonicalEditorDrawingObjects({
    canvas: options.canvas,
    prepareObject: options.prepareObject,
    source,
  });
  logEditorSourceTrace('canvas:source-ready', {
    objectCount: options.canvas.getObjects().length,
    hasSource: Boolean(source),
  });

  await options.syncBackgroundLayer?.(
    options.prepared.normalizedDocument.frame,
    options.prepared.canvasSize
  );
  await options.rebuildFrameDecorations(options.prepared.browserFrame);
  if (options.canvas instanceof EditorCanvas) {
    options.canvas.ensureWorkspaceContainsObjects();
    if (!options.preserveViewport) options.canvas.centerDocumentInViewport();
  }
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
