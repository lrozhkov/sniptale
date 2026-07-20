import type { Canvas, FabricObject } from 'fabric';

import { findObjectById } from '../../document/layers';
import { isUserObject } from '../../../document/model';

export function toggleLayerLock(
  canvas: Canvas | null,
  id: string,
  prepareObject: (object: FabricObject) => void
): FabricObject | null {
  const object = findObjectById(canvas, id);
  if (!object || !isUserObject(object)) {
    return null;
  }

  object.sniptaleLocked = !object.sniptaleLocked;
  prepareObject(object);
  canvas?.requestRenderAll();
  return object;
}
