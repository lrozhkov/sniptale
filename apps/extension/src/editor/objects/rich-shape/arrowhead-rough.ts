import type { FabricObject } from 'fabric';
import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { getArrowheadPoints, getDiamondArrowheadPoints } from './arrowhead-geometry';
import type { RichShapePoint as Point } from './render-primitives';
import { createRoughEllipseObjects, createRoughPolylineObjects } from './rough-rendering';
import type { RichShapeRenderableStyle } from './style/renderable';

export function createRoughArrowheadObjects(
  arrowhead: EditorRichShapeArrowhead,
  tip: Point,
  from: Point,
  style: RichShapeRenderableStyle,
  shape: EditorRichShapeDocumentObject,
  seedOffset: number
): FabricObject[] {
  const points = getArrowheadPoints(tip, from, style.strokeWidth);
  if (arrowhead === 'oval') {
    return createRoughEllipseObjects({
      center: [tip.x, tip.y],
      radius: Math.max(4, style.strokeWidth * 1.6),
      seedOffset,
      shape,
      style,
    });
  }
  if (arrowhead === 'diamond') {
    const diamondPoints = getDiamondArrowheadPoints(points);
    return createRoughPolylineObjects({
      closed: true,
      fillOverride: style.stroke,
      points: diamondPoints.map((point) => [point.x, point.y]),
      seedOffset,
      shape,
      style,
    });
  }

  return createRoughPolylineObjects({
    closed: arrowhead !== 'open',
    ...(arrowhead === 'open' ? {} : { fillOverride: style.stroke }),
    points: [
      [points.baseA.x, points.baseA.y],
      [points.tip.x, points.tip.y],
      [points.baseB.x, points.baseB.y],
    ],
    seedOffset,
    shape,
    style,
  });
}
