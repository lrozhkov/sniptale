import type { FabricObject } from 'fabric';
import { isRichShapeObject } from '../../objects/rich-shape';

export function syncRichShapeSelectionSettings(object: FabricObject): void {
  if (!isRichShapeObject(object)) {
    return;
  }
}
