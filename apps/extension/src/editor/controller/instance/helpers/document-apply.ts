import type { EditorDocument } from '../../../../features/editor/document/types';
import { createEditorSnapshotHistory } from '../../history';
import { applyEditorControllerDocument } from '../../document/lifecycle/apply/run';
import type { ApplyDocumentOptions } from '../../core/types';
import type { EditorControllerInstance } from '../types';
import { syncBackgroundLayerForController } from './document-background';

export async function applyDocumentForController(
  controller: EditorControllerInstance,
  document: EditorDocument,
  options: ApplyDocumentOptions
): Promise<void> {
  await applyEditorControllerDocument({
    canvas: controller.canvas,
    document,
    zoomLevel: controller.zoomLevel,
    prepareObject: (object) => controller.prepareObject(object),
    syncBackgroundLayer: (frame, canvasSize) =>
      syncBackgroundLayerForController(controller, frame, canvasSize),
    rebuildFrameDecorations: () => controller.rebuildFrameDecorations(),
    setCanvasDocumentSize: (size) => {
      controller.canvasDocumentSize = size;
    },
    setSource: (source) => {
      controller.source = source;
    },
    setCropState: (cropGuide, cropSelection) => {
      controller.cropGuide = cropGuide;
      controller.cropSelection = cropSelection;
    },
    setActiveTool: (tool) => {
      controller.activeTool = tool as typeof controller.activeTool;
      controller.toolModeEnabled = true;
    },
    applyToolMode: () => controller.applyToolMode(),
    setOriginalDocument: (nextDocument) => {
      controller.originalDocument = nextDocument;
    },
    setHistory: (nextDocument) => {
      controller.history = createEditorSnapshotHistory(nextDocument);
    },
    hasHistory: Boolean(controller.history),
    options,
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
}
