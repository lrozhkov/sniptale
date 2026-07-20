import type { FabricObject } from 'fabric';
import type { EditorTool } from '../../../features/editor/document/types';
import { isEditorRasterTargetActionableStatus } from '../../state/raster-tools';
import { useEditorStore } from '../../state/useEditorStore';

type RasterInteractionTool = Extract<EditorTool, 'selection' | 'brush' | 'eraser' | 'fill'>;

type RasterInteractionSnapshot = Pick<
  FabricObject,
  | 'hasControls'
  | 'hoverCursor'
  | 'lockMovementX'
  | 'lockMovementY'
  | 'lockScalingX'
  | 'lockScalingY'
  | 'moveCursor'
>;

const rasterInteractionSnapshots = new WeakMap<FabricObject, Partial<RasterInteractionSnapshot>>();

export function resolveRasterCursor(activeTool: RasterInteractionTool) {
  const rasterTarget = useEditorStore.getState().rasterTarget;
  if (!isEditorRasterTargetActionableStatus(rasterTarget.status)) {
    return 'not-allowed';
  }

  return activeTool === 'eraser' ? 'none' : 'crosshair';
}

function resolveRasterObjectCursor(
  activeTool: RasterInteractionTool,
  interactive: boolean
): string {
  if (!interactive) {
    return 'not-allowed';
  }

  return activeTool === 'eraser' ? 'none' : 'crosshair';
}

function readRasterInteractionSnapshot(object: FabricObject): Partial<RasterInteractionSnapshot> {
  const snapshot: Partial<RasterInteractionSnapshot> = {};
  if (typeof object.hasControls === 'boolean') {
    snapshot.hasControls = object.hasControls;
  }
  if (typeof object.hoverCursor === 'string' || object.hoverCursor === null) {
    snapshot.hoverCursor = object.hoverCursor;
  }
  if (typeof object.lockMovementX === 'boolean') {
    snapshot.lockMovementX = object.lockMovementX;
  }
  if (typeof object.lockMovementY === 'boolean') {
    snapshot.lockMovementY = object.lockMovementY;
  }
  if (typeof object.lockScalingX === 'boolean') {
    snapshot.lockScalingX = object.lockScalingX;
  }
  if (typeof object.lockScalingY === 'boolean') {
    snapshot.lockScalingY = object.lockScalingY;
  }
  if (typeof object.moveCursor === 'string' || object.moveCursor === null) {
    snapshot.moveCursor = object.moveCursor;
  }
  return snapshot;
}

export function restoreRasterInteractionPatch(object: FabricObject): void {
  const snapshot = rasterInteractionSnapshots.get(object);
  if (!snapshot) {
    return;
  }

  object.set(snapshot);
  rasterInteractionSnapshots.delete(object);
}

export function applyRasterInteractionPatch(
  object: FabricObject,
  activeTool: RasterInteractionTool,
  interactive: boolean
): void {
  if (!rasterInteractionSnapshots.has(object)) {
    rasterInteractionSnapshots.set(object, readRasterInteractionSnapshot(object));
  }

  const cursor = resolveRasterObjectCursor(activeTool, interactive);
  object.set({
    evented: interactive,
    hasControls: false,
    hoverCursor: cursor,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    moveCursor: cursor,
    selectable: false,
  });
}
