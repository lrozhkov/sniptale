import { createLogger } from '@sniptale/platform/observability/logger';
import type { EditorControllerInstance } from '../types';
import {
  applyEditorControllerCropSelection,
  cancelEditorControllerCropMode,
  clearEditorCanvasSizePreview,
  clearEditorControllerCropSelection,
  previewEditorCanvasSizeSelection,
} from '../../crop-workflow';
import { applyEditorViewportZoom } from '../../viewport';

const logger = createLogger({ namespace: 'EditorCrop' });

export function clearCropSelectionForController(controller: EditorControllerInstance): void {
  const nextState = clearEditorControllerCropSelection({
    canvas: controller.canvas,
    cropGuide: controller.cropGuide,
  });
  if (!nextState) {
    return;
  }

  controller.cropGuide = nextState.cropGuide;
  controller.cropSelection = nextState.cropSelection;
  controller.syncRuntimeState();
}

export function previewCanvasSizeForController(
  controller: EditorControllerInstance,
  width: number,
  height: number
): void {
  const nextState = previewEditorCanvasSizeSelection({
    canvas: controller.canvas,
    cropGuide: controller.cropGuide,
    cropSelection: controller.cropSelection,
    canvasDocumentSize: controller.canvasDocumentSize,
    width,
    height,
  });
  if (!nextState) {
    return;
  }

  controller.cropGuide = nextState.cropGuide;
  controller.cropSelection = nextState.cropSelection;
  controller.syncRuntimeState();
}

export function clearCanvasSizePreviewForController(controller: EditorControllerInstance): void {
  const nextState = clearEditorCanvasSizePreview({
    canvas: controller.canvas,
    cropGuide: controller.cropGuide,
    cropSelection: controller.cropSelection,
  });
  if (!nextState) {
    return;
  }

  controller.cropGuide = nextState.cropGuide;
  controller.cropSelection = nextState.cropSelection;
  controller.syncRuntimeState();
}

export function cancelCropModeForController(controller: EditorControllerInstance): void {
  const nextState = cancelEditorControllerCropMode({
    canvas: controller.canvas,
    cropGuide: controller.cropGuide,
    drawSession: controller.drawSession,
    clearCropSelection: () => controller.clearCropSelection(),
    switchToSelectTool: () => controller.switchToSelectTool(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
  if (!nextState) {
    return;
  }

  controller.drawSession = nextState.drawSession;
  controller.cropSelection = nextState.cropSelection;
}

export async function applyCropSelectionForController(
  controller: EditorControllerInstance
): Promise<void> {
  const nextState = await applyEditorControllerCropSelection({
    canvas: controller.canvas,
    cropGuide: controller.cropGuide,
    cropSelection: controller.cropSelection,
    canvasDocumentSize: controller.canvasDocumentSize,
    source: controller.source,
    setCanvasDocumentSize: (size) => {
      controller.canvasDocumentSize = size;
    },
    setCropState: (state) => {
      controller.cropGuide = state.cropGuide;
      controller.cropSelection = state.cropSelection;
    },
    setSource: (source) => {
      controller.source = source;
    },
    syncViewportTransform: () => {
      applyEditorViewportZoom(
        controller.canvas,
        controller.canvasDocumentSize,
        controller.zoomLevel,
        controller.viewportDevicePixelRatioBaseline
      );
    },
    switchToSelectTool: () => controller.switchToSelectTool(),
    rebuildFrameDecorations: () => controller.rebuildFrameDecorations(),
    commitHistory: () => controller.commitHistory(),
    logCrop: (stage, payload) => logger.debug(stage, payload),
  });
  if (!nextState) {
    return;
  }

  controller.cropGuide = nextState.cropGuide;
  controller.cropSelection = nextState.cropSelection;
}
