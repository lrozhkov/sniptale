import { Canvas } from 'fabric';
import { useEditorStore } from '../../../../state/useEditorStore';
import { attachEditorControllerEventHandlers } from '../../../events';
import { createEditorMagnetManager } from '../../../magnet';
import { clearEditorRasterSelection } from '../../../raster-tools/session';
import {
  applyEditorViewportZoom,
  getEditorViewportDevicePixelRatioBaseline,
} from '../../../viewport';
import { refreshEditorViewportPresentation } from '../../../viewport/actions';
import type { EditorControllerInstance } from '../../types';
import { ensureEditorCanvasReadyHandoff } from '../../../../document/canvas-ready/handoff';
import { createViewportPresentationContext } from '../viewport-context';

function createMountedCanvas(canvasElement: HTMLCanvasElement) {
  const canvas = new Canvas(canvasElement, {
    preserveObjectStacking: true,
    selection: true,
  });
  canvas.backgroundColor = 'transparent';
  canvas.setDimensions({ width: 0, height: 0 });
  canvas.setZoom(1);
  return canvas;
}

function attachViewportObserver(
  controller: EditorControllerInstance,
  canvas: Canvas,
  viewportElement: HTMLElement
) {
  return attachEditorControllerEventHandlers({
    canvas,
    viewportElement,
    handlers: controller.eventHandlers,
    onViewportResize: () =>
      refreshEditorViewportPresentation(createViewportPresentationContext(controller)),
  });
}

export function mountEditorController(
  controller: EditorControllerInstance,
  canvasElement: HTMLCanvasElement,
  viewportElement: HTMLElement,
  stageElement: HTMLElement
): void {
  if (controller.canvas) {
    controller.dispose();
  }

  const canvasReadyHandoff = ensureEditorCanvasReadyHandoff(controller);
  const mountGeneration = canvasReadyHandoff.beginMount();

  try {
    const canvas = createMountedCanvas(canvasElement);

    controller.canvas = canvas;
    controller.viewportElement = viewportElement;
    controller.stageElement = stageElement;
    controller.zoomLevel = 1;
    controller.viewportDevicePixelRatioBaseline = getEditorViewportDevicePixelRatioBaseline();
    applyEditorViewportZoom(
      canvas,
      controller.canvasDocumentSize,
      controller.zoomLevel,
      controller.viewportDevicePixelRatioBaseline
    );

    controller.viewportResizeObserver = attachViewportObserver(controller, canvas, viewportElement);
    controller.magnetManager = createEditorMagnetManager({
      canvas,
      getActiveTool: () => controller.activeTool,
      getCanvasDocumentSize: () => controller.canvasDocumentSize,
      getCropGuide: () => controller.cropGuide,
      getWorkspace: () => useEditorStore.getState().workspace,
    });
    controller.selectionNudgeSession = null;
    clearEditorRasterSelection(controller.rasterToolSession);
    controller.syncRuntimeState();
    canvasReadyHandoff.markReady(mountGeneration);
  } catch (error) {
    canvasReadyHandoff.tearDown();
    controller.dispose();
    throw error;
  }
}
