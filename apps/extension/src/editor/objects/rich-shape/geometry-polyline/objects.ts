import type { FabricObject } from 'fabric';
import type {
  EditorBuiltInShapePolylineGeometry,
  EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import type { RichShapeRenderableStyle } from '../style/renderable';
import { createPolylineArrowheadObjects } from './arrowheads';
import { createPolylineBaseObject } from './base';
import { getPolylinePoints } from './points';

export function createPolylineObjects(
  geometry: EditorBuiltInShapePolylineGeometry,
  shape: EditorRichShapeDocumentObject,
  style: RichShapeRenderableStyle
): FabricObject[] {
  const { width, height } = shape.frame;
  const points = getPolylinePoints(geometry, width, height);
  const objects = createPolylineBaseObject(geometry, shape, width, height, style);
  if (geometry.closed || points.length < 2) {
    return objects;
  }

  return [
    ...objects,
    ...createPolylineArrowheadObjects({
      height,
      points,
      shape,
      style,
      width,
    }),
  ];
}
