import { Rect, type FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';

export function createBoundsObject(shape: EditorRichShapeDocumentObject): Rect {
  return new Rect({
    evented: false,
    fill: 'transparent',
    height: shape.frame.height,
    left: 0,
    opacity: 0,
    originX: 'center',
    originY: 'center',
    selectable: false,
    strokeWidth: 0,
    top: 0,
    width: shape.frame.width,
  });
}

export function positionRichShapeChild<T extends FabricObject>(
  object: T,
  width: number,
  height: number
): T {
  object.set({
    left: Number(object.left ?? 0) - width / 2,
    top: Number(object.top ?? 0) - height / 2,
  });
  return object;
}

export function positionTextChild<T extends FabricObject>(
  object: T,
  shape: EditorRichShapeDocumentObject
): T {
  return positionRichShapeChild(object, shape.frame.width, shape.frame.height);
}
