import type { FabricObject } from 'fabric';
import type { RectangleLike } from './types';

export function isEditorRectangleTarget(object: FabricObject): object is RectangleLike {
  return object.sniptaleRole === 'annotation' && object.sniptaleType === 'rectangle';
}
