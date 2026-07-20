import type { EditorControllerInstance } from '../types';
import { setZoomCenteredForController } from '../actions/scene';
import {
  applyEditorControllerToolMode,
  commitEditorHistory,
  scheduleEditorControllerZoomToFit,
  switchEditorControllerToSelectTool,
  syncEditorControllerRuntimeState,
  withEditorHistoryMuted,
} from '../../runtime/actions';
import { syncEditorRasterSelectionSession } from '../../raster-tools/session';
import { refreshEditorToolSettingsPreview } from '../../tools/settings-preview';

export function withHistoryMutedForController<T>(
  controller: EditorControllerInstance,
  callback: () => T
): T {
  return withEditorHistoryMuted({
    getHistoryMuted: () => controller.historyMuted,
    setHistoryMuted: (nextValue) => {
      controller.historyMuted = nextValue;
    },
    callback,
  });
}

export function commitHistoryForController(controller: EditorControllerInstance): void {
  let snapshot: ReturnType<EditorControllerInstance['exportDocument']> | null = null;
  const getSnapshot = () => {
    snapshot ??= controller.exportDocument();
    return snapshot;
  };

  const committed = commitEditorHistory({
    history: controller.history,
    historyMuted: controller.historyMuted > 0,
    exportDocument: getSnapshot,
    syncRuntimeState: () => controller.syncRuntimeState(),
  });

  if (!committed) {
    return;
  }

  controller.autosaveService?.scheduleAutosave(getSnapshot());
}

export function syncRuntimeStateForController(controller: EditorControllerInstance): void {
  syncEditorRasterSelectionSession({
    canvas: controller.canvas,
    session: controller.rasterToolSession,
  });
  const topMostSelectedId =
    controller.canvas
      ?.getObjects()
      .slice()
      .reverse()
      .find((object) =>
        controller.canvas
          ?.getActiveObjects()
          .some(
            (activeObject) =>
              activeObject.sniptaleId && activeObject.sniptaleId === object.sniptaleId
          )
      )?.sniptaleId ?? null;
  controller.lastLayerSelectionAnchorId = topMostSelectedId;
  syncEditorControllerRuntimeState({
    canvas: controller.canvas,
    history: controller.history,
    cropGuide: controller.cropGuide,
    cropSelection: controller.cropSelection,
    viewportState: controller.buildViewportState(),
  });
  controller.applyToolMode();
}

export function applyToolModeForController(controller: EditorControllerInstance): void {
  applyEditorControllerToolMode({
    canvas: controller.canvas,
    activeTool: controller.activeTool,
    enabled: controller.toolModeEnabled,
    hasCropGuide: Boolean(controller.cropGuide),
    clearCropSelection: () => controller.clearCropSelection(),
  });
}

export function refreshActiveToolSettingsPreviewForController(
  controller: EditorControllerInstance
): void {
  refreshEditorToolSettingsPreview({
    activeTool: controller.activeTool,
    canvas: controller.canvas,
    drawSession: controller.drawSession,
  });
}

export function switchToSelectToolForController(controller: EditorControllerInstance): void {
  controller.toolModeEnabled = true;
  switchEditorControllerToSelectTool({
    setActiveTool: (tool) => {
      controller.activeTool = tool;
    },
    applyToolMode: () => controller.applyToolMode(),
  });
}

export function scheduleZoomToFitForController(controller: EditorControllerInstance): void {
  scheduleEditorControllerZoomToFit(() => {
    setZoomCenteredForController(controller, 1);
  });
}
