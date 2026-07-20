import type { Canvas, FabricObject } from 'fabric';

import { findObjectById } from '../../document/layers';
import { isUserObject } from '../../../document/model';

export function toggleLayerVisibility(canvas: Canvas | null, id: string): FabricObject | null {
  const object = findObjectById(canvas, id);
  if (!object || !isUserObject(object) || object.sniptaleLocked) {
    return null;
  }

  object.visible = !object.visible;
  if (!object.visible && canvas?.getActiveObject() === object) {
    canvas.discardActiveObject();
  }

  canvas?.requestRenderAll();
  return object;
}
