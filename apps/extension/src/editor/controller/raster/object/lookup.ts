import type { Canvas, FabricObject } from 'fabric';
import { findObjectById } from '../../document/layers';
import type { EditorRasterTargetReference } from '../types';

export function resolveRasterOverlayObject(
  canvas: Canvas | null,
  reference: EditorRasterTargetReference
): FabricObject | null {
  if (!canvas) {
    return null;
  }

  return findObjectById(canvas, reference.objectId) ?? null;
}
