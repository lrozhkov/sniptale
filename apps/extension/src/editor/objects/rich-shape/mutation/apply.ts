import type { FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';
import { createRichShapeCalloutControls } from '../callout-controls/factory';
import { replaceRichShapeGroupObjects } from '../group-objects';
import { isRichShapeObject } from '../guards';
import { resolveRichShapeGeometry } from '../geometry-resolution';
import { cloneRichShape } from './clone';

export function applyRichShapeDocumentObjectToObject(
  object: FabricObject,
  shape: EditorRichShapeDocumentObject
): boolean {
  if (!isRichShapeObject(object)) {
    return false;
  }

  const geometry = resolveRichShapeGeometry(shape);
  if (!geometry) {
    return false;
  }

  const nextShape = cloneRichShape(shape);
  object.sniptaleRichShape = nextShape;
  replaceRichShapeGroupObjects(object, nextShape, geometry);
  object.controls = createRichShapeCalloutControls(object, applyRichShapeDocumentObjectToObject);
  object.set({
    angle: nextShape.rotation,
    height: nextShape.frame.height,
    left: nextShape.frame.left,
    opacity: nextShape.style.opacity,
    scaleX: nextShape.scaleX,
    scaleY: nextShape.scaleY,
    top: nextShape.frame.top,
    visible: nextShape.layer.visible,
    width: nextShape.frame.width,
  });
  object.sniptaleLocked = nextShape.layer.locked;
  if (nextShape.source?.itemId) {
    object.sniptaleRichShapeCatalogId = nextShape.source.itemId;
  }
  object.setCoords();
  return true;
}
