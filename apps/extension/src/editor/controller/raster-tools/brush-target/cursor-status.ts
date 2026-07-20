import type { Canvas, FabricObject } from 'fabric';
import { EDITOR_RASTER_TARGET_STATUS } from '../../../state/raster-tools';
import { isLockedBaseImageTarget } from './locked-target';

export function resolveBrushCursorStatus(args: {
  canvas: Canvas;
  fallbackTarget?: FabricObject;
}):
  | typeof EDITOR_RASTER_TARGET_STATUS.LOCKED
  | typeof EDITOR_RASTER_TARGET_STATUS.MULTIPLE
  | 'ready' {
  const activeObjects = args.canvas.getActiveObjects();
  if (activeObjects.length > 1) {
    return EDITOR_RASTER_TARGET_STATUS.MULTIPLE;
  }

  const target = args.fallbackTarget ?? activeObjects[0] ?? null;
  return target?.sniptaleLocked && !isLockedBaseImageTarget(target)
    ? EDITOR_RASTER_TARGET_STATUS.LOCKED
    : 'ready';
}
