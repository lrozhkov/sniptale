import type { Canvas, FabricObject } from 'fabric';

import { syncSourceStateFromObject } from '../../../document/source';

import type { SourceState } from '../../../../document/model/source-state';
import { getMutableEditorSelection } from './active-selection';

export function nudgeEditorSelection(options: {
  canvas: Canvas | null;
  deltaX: number;
  deltaY: number;
  source: SourceState | null;
  setSource: (source: SourceState | null) => void;
  ensureObjectReachable: (object: FabricObject) => boolean;
  syncRuntimeState: () => void;
}): boolean {
  const { canvas, deltaX, deltaY, source, setSource, ensureObjectReachable, syncRuntimeState } =
    options;
  const activeObjects = getMutableEditorSelection(canvas);
  if (!canvas || !activeObjects) {
    return false;
  }

  let nextSource = source;
  activeObjects.forEach((object) => {
    object.set({
      left: (object.left ?? 0) + deltaX,
      top: (object.top ?? 0) + deltaY,
    });
    ensureObjectReachable(object);
    object.setCoords();
    nextSource = syncSourceStateFromObject(nextSource, object);
  });

  setSource(nextSource);
  canvas.getActiveObject?.()?.setCoords?.();
  canvas.requestRenderAll();
  syncRuntimeState();
  return true;
}
