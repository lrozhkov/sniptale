import type { FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';
import { createArrowheadObjects } from '../arrowheads';
import { positionRichShapeChild } from '../geometry-layout';
import type { RichShapePoint } from '../render-primitives';
import type { RichShapeRenderableStyle } from '../style/renderable';

export function createPolylineArrowheadObjects(args: {
  height: number;
  points: RichShapePoint[];
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
  width: number;
}): FabricObject[] {
  const [start, second] = args.points;
  const end = args.points.at(-1);
  const beforeEnd = args.points.at(-2);
  const begin =
    start && second
      ? createArrowheadObjects(
          args.shape.style.line.beginArrowhead,
          start,
          second,
          args.style,
          args.shape,
          401
        ).map((object) => positionRichShapeChild(object, args.width, args.height))
      : [];
  const finish =
    end && beforeEnd
      ? createArrowheadObjects(
          args.shape.style.line.endArrowhead,
          end,
          beforeEnd,
          args.style,
          args.shape,
          701
        ).map((object) => positionRichShapeChild(object, args.width, args.height))
      : [];
  return [...begin, ...finish];
}
