import type { Canvas } from 'fabric';
import type { EditorDocument } from '../../../../features/editor/document/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { type PreparedAppliedDocument, prepareAppliedDocument } from '..';
import { logEditorOpenTrace } from '../../core/debug';

import type { SourceState } from '../../../document/model/source-state';
import { maskCanvasElementDuringLoad } from './canvas';
import { loadPreparedDocumentOnCanvas } from './load';
import type { AppliedDocumentCanvasLoadCallbacks, LoadPreparedDocumentOptions } from './types';

function logPreparedDocument(prepared: PreparedAppliedDocument): void {
  logEditorOpenTrace('canvas:prepare', {
    canvasWidth: prepared.canvasSize.width,
    canvasHeight: prepared.canvasSize.height,
    sourceWidth: prepared.source.displayWidth,
    sourceHeight: prepared.source.displayHeight,
  });
}

export async function applyEditorDocumentToCanvas(
  options: {
    canvas: Canvas;
    document: EditorDocument;
    zoomLevel: number;
    viewportDevicePixelRatioBaseline?: number;
  } & AppliedDocumentCanvasLoadCallbacks
): Promise<{
  prepared: PreparedAppliedDocument;
  source: SourceState | null;
}> {
  const prepared = prepareAppliedDocument(options.document);
  const restoreCanvasMask = maskCanvasElementDuringLoad(
    options.canvas,
    useEditorStore.getState().workspace.backgroundColor
  );
  logPreparedDocument(prepared);

  try {
    const loadOptions: LoadPreparedDocumentOptions & AppliedDocumentCanvasLoadCallbacks = {
      canvas: options.canvas,
      prepared,
      zoomLevel: options.zoomLevel,
      prepareObject: options.prepareObject,
      upgradeLegacyArrowObjects: options.upgradeLegacyArrowObjects,
      rebuildFrameDecorations: options.rebuildFrameDecorations,
    };
    if (options.syncBackgroundLayer) {
      loadOptions.syncBackgroundLayer = options.syncBackgroundLayer;
    }
    if (options.viewportDevicePixelRatioBaseline !== undefined) {
      loadOptions.viewportDevicePixelRatioBaseline = options.viewportDevicePixelRatioBaseline;
    }
    const source = await loadPreparedDocumentOnCanvas(loadOptions);

    return {
      prepared,
      source,
    };
  } finally {
    restoreCanvasMask?.();
  }
}
