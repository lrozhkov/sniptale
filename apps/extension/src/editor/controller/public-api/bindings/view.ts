import type { EditorControllerInstance } from '../../instance/types';

export function createEditorControllerPublicApiView(controller: EditorControllerInstance) {
  return {
    get canvas() {
      return controller.canvas;
    },
    get source() {
      return controller.source;
    },
    get originalDocument() {
      return controller.originalDocument;
    },
    get history() {
      return controller.history;
    },
    get zoomLevel() {
      return controller.zoomLevel;
    },
    get viewportDevicePixelRatioBaseline() {
      return controller.viewportDevicePixelRatioBaseline;
    },
    get canvasDocumentSize() {
      return controller.canvasDocumentSize;
    },
    get drawSession() {
      return controller.drawSession;
    },
    get cropGuide() {
      return controller.cropGuide;
    },
    get cropSelection() {
      return controller.cropSelection;
    },
    get panSession() {
      return controller.panSession;
    },
    get activeTool() {
      return controller.activeTool;
    },
    get layerMutationToken() {
      return controller.layerMutationToken;
    },
    get lastLayerSelectionAnchorId() {
      return controller.lastLayerSelectionAnchorId;
    },
  };
}
