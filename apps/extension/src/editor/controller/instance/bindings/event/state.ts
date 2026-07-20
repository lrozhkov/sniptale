import type { Rect } from 'fabric';
import type { CropSelection, DrawSession, PanSession } from '../../../core/types';
import type { SourceState } from '../../../../document/model/source-state';
import type { EditorControllerInstance } from '../../types';

export function createEventCanvasStateBindings(controller: EditorControllerInstance) {
  return {
    getCanvas: () => controller.canvas,
    getViewportElement: () => controller.viewportElement,
    getCanvasDocumentSize: () => controller.canvasDocumentSize,
    getViewportSyncFrame: () => controller.viewportSyncFrame,
    setViewportSyncFrame: (frame: number) => {
      controller.viewportSyncFrame = frame;
    },
  };
}

export function createEventCropStateBindings(controller: EditorControllerInstance) {
  return {
    getCropGuide: () => controller.cropGuide,
    getCropSelection: () => controller.cropSelection,
    getCropSelectionMouseEnabled: () => controller.cropSelectionMouseEnabled,
    setCropState: (cropGuide: Rect | null, cropSelection: CropSelection | null) => {
      controller.cropGuide = cropGuide;
      controller.cropSelection = cropSelection;
    },
  };
}

export function createEventDocumentStateBindings(controller: EditorControllerInstance) {
  return {
    getDrawSession: () => controller.drawSession,
    setDrawSession: (drawSession: DrawSession | null) => {
      controller.drawSession = drawSession;
    },
    getSource: () => controller.source,
    setSource: (source: SourceState | null) => {
      controller.source = source;
    },
    getActiveTool: () => controller.activeTool,
    getHistoryMuted: () => controller.historyMuted,
  };
}

export function createEventInteractionStateBindings(controller: EditorControllerInstance) {
  return {
    getIsSpacePressed: () => controller.isSpacePressed,
    setIsSpacePressed: (value: boolean) => {
      controller.isSpacePressed = value;
    },
    getPanSession: () => controller.panSession,
    setPanSession: (session: PanSession | null) => {
      controller.panSession = session;
    },
    getRasterToolSession: () => controller.rasterToolSession,
  };
}
