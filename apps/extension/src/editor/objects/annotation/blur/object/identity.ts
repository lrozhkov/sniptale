import { Rect, type FabricObject } from 'fabric';
import type { BlurRuntimeObject } from '../types';

export function isBlurObject(object: FabricObject): object is BlurRuntimeObject {
  return object instanceof Rect && object.sniptaleType === 'blur';
}
