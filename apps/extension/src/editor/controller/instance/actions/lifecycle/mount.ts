import { Canvas } from 'fabric';
import { useEditorStore } from '../../../../state/useEditorStore';
import { attachEditorControllerEventHandlers } from '../../../events';
import { createEditorMagnetManager } from '../../../magnet';
import {
  applyEditorViewportZoom,
  getEditorViewportDevicePixelRatioBaseline,
} from '../../../viewport';
import { refreshEditorViewportPresentation } from '../../../viewport/actions';
import type { EditorControllerInstance } from '../../types';
import { ensureEditorCanvasReadyHandoff } from '../../../../document/canvas-ready/handoff';
import { createViewportPresentationContext } from '../viewport-context';
import { attachEditorCanvasPointerCapture } from './pointer-capture';

export function createMountedCanvas(canvasElement: HTMLCanvasElement) {
  const canvas = new Canvas(canvasElement, {
    altActionKey: 'ctrlKey',
    centeredKey: 'ctrlKey',
    enablePointerEvents: true,
    preserveObjectStacking: true,
    selection: true,
    selectionKey: 'ctrlKey',
    uniformScaling: false,
    uniScaleKey: 'shiftKey',
  });
  // Fabric marks the upper canvas as a native drag source for selected-text DnD. That browser
  // gesture can take over an already-started object transform, so the editor keeps canvas
  // interaction exclusively on the pointer-event path.
  canvas.upperCanvasEl.draggable = false;
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
    attachEditorCanvasPointerCapture(
      canvas,
      controller.eventHandlers.handlePointerCancel,
      controller.eventHandlers.handlePointerDownBeforeFabric,
      (event) => !canvas.findTarget(event).target
    );
    applyEditorViewportZoom(
      canvas,
      controller.canvasDocumentSize,
      controller.zoomLevel,
      controller.viewportDevicePixelRatioBaseline
    );

    controller.magnetManager = createEditorMagnetManager({
      canvas,
      getActiveTool: () => controller.activeTool,
      getCanvasDocumentSize: () => controller.canvasDocumentSize,
      getCropGuide: () => controller.cropGuide,
      getWorkspace: () => useEditorStore.getState().workspace,
    });
    controller.viewportResizeObserver = attachViewportObserver(controller, canvas, viewportElement);
    controller.selectionNudgeSession = null;
    controller.syncRuntimeState();
    canvasReadyHandoff.markReady(mountGeneration);
  } catch (error) {
    canvasReadyHandoff.tearDown();
    controller.dispose();
    throw error;
  }
}
