import { replaceCurrentEditorSnapshotHistory } from '../../../history';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../../../platform/i18n';
import { mountEditorSimplifyRuntime } from '../../../../drawing/simplify-runtime';
import type { Canvas } from 'fabric';
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
import { mountEditorSelectionChrome } from './selection-chrome';
import { EditorCanvas } from '../../../../document/canvas-surface/render-region';

export function createMountedCanvas(canvasElement: HTMLCanvasElement) {
  const canvas = new EditorCanvas(canvasElement, {
    altActionKey: 'ctrlKey',
    centeredKey: 'ctrlKey',
    enablePointerEvents: true,
    fireMiddleClick: false,
    preserveObjectStacking: true,
    selection: true,
    selectionFullyContained: true,
    selectionKey: 'ctrlKey',
    targetFindTolerance: 5,
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
    canvas.setRenderViewport(viewportElement, stageElement);

    controller.canvas = canvas;
    if (controller.createSimplifyCompute)
      mountEditorSimplifyRuntime({
        canvas,
        createCompute: controller.createSimplifyCompute,
        prepareObject: (object) => controller.prepareObject(object),
        commitHistory: () => controller.commitHistory(),
        syncRuntimeState: () => controller.syncRuntimeState(),
        publishDerived: () => {
          const history = controller.history;
          if (!history) return false;
          const changed = replaceCurrentEditorSnapshotHistory({
            history,
            expectedRevision: history.getRevision(),
            exportDocument: () => controller.exportDocument(),
          });
          if (changed) {
            controller.autosaveService?.scheduleAutosave(controller.exportDocument());
            controller.syncRuntimeState();
          }
          return changed;
        },
        reportFailure: () => showToast(translate('content.toolbar.drawingSimplifyFailed'), 'error'),
      });
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
    mountEditorSelectionChrome(canvas, controller.magnetManager);
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
