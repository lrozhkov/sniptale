import type { FabricObject } from 'fabric';
import { isRichShapeObject } from '../../../objects/rich-shape';

function isLineLikeRichShapeObject(object: FabricObject): boolean {
  if (!isRichShapeObject(object)) {
    return false;
  }

  return (
    object.sniptaleRichShape.shapeFamily === 'line' ||
    object.sniptaleRichShape.shapeFamily === 'arrow' ||
    object.sniptaleRichShape.shapeFamily === 'connector'
  );
}

export function applyLineLikeRichShapeControls(object: FabricObject): void {
  if (!isLineLikeRichShapeObject(object)) {
    return;
  }

  object.set({
    hasBorders: false,
    lockRotation: true,
  });
  object.setControlsVisibility({
    bl: true,
    br: false,
    mb: false,
    ml: false,
    mr: false,
    mt: false,
    mtr: false,
    tl: false,
    tr: true,
  });
}
