import { Line, Polygon, Polyline, type FabricObject } from 'fabric';
import type {
  EditorBuiltInShapePolylineGeometry,
  EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import { positionRichShapeChild } from '../geometry-layout';
import { createRichShapePrimitiveOptions } from '../render-primitives';
import type { RichShapeRenderableStyle } from '../style/renderable';
import { getPolylinePoints } from './points';
import { createRoughPolylineBaseObjects } from './rough-base';

export function createPolylineBaseObject(
  geometry: EditorBuiltInShapePolylineGeometry,
  shape: EditorRichShapeDocumentObject,
  width: number,
  height: number,
  style: RichShapeRenderableStyle
): FabricObject[] {
  const points = getPolylinePoints(geometry, width, height);
  const roughObjects = createRoughPolylineBaseObjects({
    geometry,
    height,
    points,
    shape,
    style,
    width,
  });
  if (roughObjects) {
    return roughObjects;
  }

  if (geometry.closed) {
    return [
      positionRichShapeChild(
        new Polygon(points, createRichShapePrimitiveOptions(style, style.fill)),
        width,
        height
      ),
    ];
  }

  const [start, end] = points;
  if (points.length === 2 && start && end) {
    return [
      positionRichShapeChild(
        new Line([start.x, start.y, end.x, end.y], createRichShapePrimitiveOptions(style, null)),
        width,
        height
      ),
    ];
  }

  return [
    positionRichShapeChild(
      new Polyline(points, createRichShapePrimitiveOptions(style, null)),
      width,
      height
    ),
  ];
}
