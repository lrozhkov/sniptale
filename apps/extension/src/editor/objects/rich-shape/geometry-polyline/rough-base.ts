import { Polygon, type FabricObject } from 'fabric';
import type {
  EditorBuiltInShapePolylineGeometry,
  EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import { positionRichShapeChild } from '../geometry-layout';
import {
  createRichShapeGradientBackfillOptions,
  shouldRenderRoughGradientBackfill,
  type RichShapePoint,
} from '../render-primitives';
import { tryCreateRoughPolyline } from '../rough-rendering';
import type { RichShapeRenderableStyle } from '../style/renderable';

export function createRoughPolylineBaseObjects(args: {
  geometry: EditorBuiltInShapePolylineGeometry;
  height: number;
  points: RichShapePoint[];
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
  width: number;
}): FabricObject[] | null {
  const roughObjects = tryCreateRoughPolyline(
    args.shape,
    args.style,
    args.points,
    args.geometry.closed
  );
  if (!roughObjects) {
    return null;
  }

  const positioned = roughObjects.map((object) =>
    positionRichShapeChild(object, args.width, args.height)
  );
  if (!args.geometry.closed || !shouldRenderRoughGradientBackfill(args.shape)) {
    return positioned;
  }
  return [
    positionRichShapeChild(
      new Polygon(args.points, createRichShapeGradientBackfillOptions(args.style.fill)),
      args.width,
      args.height
    ),
    ...positioned,
  ];
}
