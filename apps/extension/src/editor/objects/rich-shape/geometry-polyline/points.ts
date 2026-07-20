import type { EditorBuiltInShapePolylineGeometry } from '../../../../features/editor/document/rich-shape';
import { mapRichShapePoint, type RichShapePoint } from '../render-primitives';

export function getPolylinePoints(
  geometry: EditorBuiltInShapePolylineGeometry,
  width: number,
  height: number
): RichShapePoint[] {
  return geometry.points.map((point) => mapRichShapePoint(point, geometry.viewBox, width, height));
}
