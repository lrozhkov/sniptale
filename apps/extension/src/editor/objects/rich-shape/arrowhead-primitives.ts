import { Ellipse, Path, Polygon, type FabricObject } from 'fabric';
import type { EditorRichShapeArrowhead } from '../../../features/editor/document/rich-shape';
import { getArrowheadPoints, getDiamondArrowheadPoints } from './arrowhead-geometry';
import { createRichShapePrimitiveOptions, type RichShapePoint as Point } from './render-primitives';
import type { RichShapeRenderableStyle } from './style/renderable';

export function createArrowheadObject(
  arrowhead: EditorRichShapeArrowhead,
  tip: Point,
  from: Point,
  style: RichShapeRenderableStyle
): FabricObject | null {
  if (arrowhead === 'none') {
    return null;
  }

  const points = getArrowheadPoints(tip, from, style.strokeWidth);
  const options = createRichShapePrimitiveOptions(
    style,
    arrowhead === 'open' ? null : style.stroke
  );
  if (arrowhead === 'open') {
    return new Path(
      `M ${points.baseA.x} ${points.baseA.y} L ${points.tip.x} ${points.tip.y} L ${points.baseB.x} ${points.baseB.y}`,
      options
    );
  }
  if (arrowhead === 'diamond') {
    return new Polygon(getDiamondArrowheadPoints(points), options);
  }
  if (arrowhead === 'oval') {
    const radius = Math.max(4, style.strokeWidth * 1.6);
    return new Ellipse({
      ...options,
      left: tip.x - radius,
      rx: radius,
      ry: radius,
      top: tip.y - radius,
    });
  }

  return new Polygon([points.tip, points.baseA, points.baseB], options);
}
