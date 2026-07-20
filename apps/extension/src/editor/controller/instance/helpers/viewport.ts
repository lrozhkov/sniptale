import type { FabricObject } from 'fabric';
import type { EditorViewportState } from '../../../../features/editor/document/types';
import { useEditorStore } from '../../../state/useEditorStore';
import { applyEditorGridSnap } from '../../viewport/grid';
import { scheduleEditorViewportStateSyncFrame } from '../../viewport/interactions';
import { buildEditorViewportState, syncEditorViewportState } from '../../viewport';
import {
  ensureEditorObjectReachable,
  ensureEditorObjectsReachable,
} from '../../document/visibility/reachability';
import { focusEditorObjectInViewport } from '../../document/visibility/viewport-focus';
import { sendEditorFrameObjectsToBack } from '../../document/visibility/frame-stack';
import type { EditorControllerInstance } from '../types';

export function applyGridSnapForController(
  controller: EditorControllerInstance,
  object: FabricObject
): void {
  const workspace = useEditorStore.getState().workspace;
  if (workspace.magnetEnabled && controller.magnetManager?.hasActiveGuides()) {
    return;
  }

  applyEditorGridSnap(object, workspace);
}

export function buildViewportStateForController(
  controller: EditorControllerInstance
): EditorViewportState {
  return buildEditorViewportState({
    viewportElement: controller.viewportElement,
    stageElement: controller.stageElement,
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    source: controller.source,
    devicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
  });
}

export function syncViewportStateForController(controller: EditorControllerInstance): void {
  syncEditorViewportState({
    viewportElement: controller.viewportElement,
    stageElement: controller.stageElement,
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    source: controller.source,
    devicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
  });
}

export function scheduleViewportStateSyncForController(controller: EditorControllerInstance): void {
  scheduleEditorViewportStateSyncFrame({
    viewportSyncFrame: controller.viewportSyncFrame,
    syncViewportState: () => controller.syncViewportState(),
    setViewportSyncFrame: (nextFrame) => {
      controller.viewportSyncFrame = nextFrame;
    },
  });
}

export function focusObjectInViewportForController(
  controller: EditorControllerInstance,
  object: FabricObject
): void {
  focusEditorObjectInViewport({
    object,
    viewportElement: controller.viewportElement,
    stageElement: controller.stageElement,
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    devicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    onSynced: () => controller.syncViewportState(),
  });
}

export function ensureObjectReachableForController(
  controller: EditorControllerInstance,
  object: FabricObject
): boolean {
  return ensureEditorObjectReachable(controller.canvas, controller.canvasDocumentSize, object);
}

export function ensureReachableObjectsForController(controller: EditorControllerInstance): boolean {
  return ensureEditorObjectsReachable(controller.canvas, controller.canvasDocumentSize);
}

export function sendFrameObjectsToBackForController(controller: EditorControllerInstance): void {
  sendEditorFrameObjectsToBack(controller.canvas, () => controller.ensureBrowserFrameOnTop());
}
