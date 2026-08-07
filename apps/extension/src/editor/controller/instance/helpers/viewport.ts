import { Rect, type FabricObject } from 'fabric';
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

export function snapExternalEditorRectForController(
  controller: EditorControllerInstance,
  input: {
    excludeId?: string;
    rect: { x: number; y: number; width: number; height: number };
  }
): { x: number; y: number; width: number; height: number } {
  const workspace = useEditorStore.getState().workspace;
  const snapped = controller.magnetManager?.snapRect(input) ?? input.rect;
  if (workspace.magnetEnabled && controller.magnetManager?.hasActiveGuides()) return snapped;
  const proxy = new Rect({
    left: snapped.x,
    top: snapped.y,
    width: snapped.width,
    height: snapped.height,
    originX: 'left',
    originY: 'top',
    strokeWidth: 0,
  });
  if (input.excludeId !== undefined) proxy.sniptaleId = input.excludeId;
  proxy.sniptaleType = 'rectangle';
  applyEditorGridSnap(proxy, workspace);
  return {
    x: Number(proxy.left ?? snapped.x),
    y: Number(proxy.top ?? snapped.y),
    width: snapped.width,
    height: snapped.height,
  };
}

export function snapExternalEditorResizeRectForController(
  controller: EditorControllerInstance,
  input: {
    direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
    excludeId?: string;
    minimumSize: number;
    rect: { x: number; y: number; width: number; height: number };
  }
): { x: number; y: number; width: number; height: number } {
  const workspace = useEditorStore.getState().workspace;
  const snapped = controller.magnetManager?.snapResizeRect?.(input) ?? input.rect;
  if (workspace.magnetEnabled && controller.magnetManager?.hasActiveGuides()) return snapped;
  if (!workspace.gridEnabled || !workspace.gridSnapEnabled) return snapped;
  const size = Math.max(1, workspace.gridSize);
  const right = snapped.x + snapped.width;
  const bottom = snapped.y + snapped.height;
  const nextLeft = input.direction.includes('w')
    ? Math.min(Math.round(snapped.x / size) * size, right - input.minimumSize)
    : snapped.x;
  const nextTop = input.direction.includes('n')
    ? Math.min(Math.round(snapped.y / size) * size, bottom - input.minimumSize)
    : snapped.y;
  const nextRight = input.direction.includes('e')
    ? Math.max(Math.round(right / size) * size, snapped.x + input.minimumSize)
    : right;
  const nextBottom = input.direction.includes('s')
    ? Math.max(Math.round(bottom / size) * size, snapped.y + input.minimumSize)
    : bottom;
  return {
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  };
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
