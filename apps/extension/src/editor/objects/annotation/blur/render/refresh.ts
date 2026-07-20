import type { BlurRuntimeObject } from '../types';

export function refreshBlurRendering(object: BlurRuntimeObject): void {
  object.dirty = true;
  object.canvas?.requestRenderAll();
}
