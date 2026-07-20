import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { createRichShapeReflectionObjects } from './reflection';
import { resolveRichShapeRenderableStyle } from './style/renderable';
import { createRichShapeTextObject } from './text';
import { createBoundsObject, positionTextChild } from './geometry-layout';
import { createPathObjects } from './geometry-path';
import { createPolylineObjects } from './geometry-polyline/objects';

export function createRichShapeGeometryObjects(
  shape: EditorRichShapeDocumentObject,
  geometry: EditorBuiltInShapeGeometryDefinition
) {
  const style = resolveRichShapeRenderableStyle(shape);
  const objects =
    geometry.type === 'path'
      ? createPathObjects(geometry, shape, shape.frame.width, shape.frame.height, style)
      : createPolylineObjects(geometry, shape, style);

  const text = createRichShapeTextObject(shape);
  const reflection = createRichShapeReflectionObjects(
    shape,
    geometry,
    createRichShapeGeometryObjects
  );

  return [
    createBoundsObject(shape),
    ...reflection,
    ...objects,
    ...(text ? [positionTextChild(text, shape)] : []),
  ].map((object) => {
    object.set({ evented: false, selectable: false });
    return object;
  });
}
