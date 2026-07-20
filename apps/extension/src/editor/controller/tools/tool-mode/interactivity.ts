import type { Canvas } from 'fabric';

import { isEditableObject } from '../../../document/model';
import {
  applyRasterInteractionPatch,
  restoreRasterInteractionPatch,
} from '../../raster-tools/tool-mode';
import type { RasterInteractionTool } from './types';

type CanvasInteractivityMode = 'all' | 'selection' | 'target-only' | 'none';

export function setCanvasObjectInteractivity(
  canvas: Canvas,
  mode: CanvasInteractivityMode,
  activeTool?: RasterInteractionTool
): void {
  const activeObjects = canvas.getActiveObjects();
  const activeObjectIds = new Set(
    activeObjects
      .map((object) => object.sniptaleId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  canvas.getObjects().forEach((object) => {
    if (!isEditableObject(object)) {
      return;
    }

    const selectableBase = true;
    const mutableBase = !object.sniptaleLocked;
    const isSelected =
      activeObjects.some((activeObject) => activeObject === object) ||
      (typeof object.sniptaleId === 'string' && activeObjectIds.has(object.sniptaleId));

    if (mode !== 'target-only') {
      restoreRasterInteractionPatch(object);
    }

    const interactive =
      mode === 'all'
        ? selectableBase
        : mode === 'selection'
          ? selectableBase && isSelected
          : mode === 'target-only'
            ? mutableBase
            : false;

    if (mode === 'target-only' && activeTool) {
      applyRasterInteractionPatch(object, activeTool, interactive);
      return;
    }

    object.set({
      evented: interactive,
      selectable: mode === 'target-only' ? false : interactive,
    });
  });
}
