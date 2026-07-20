import type {
  EditorBuiltInShapeViewBox,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import type { RichShapeRenderableStyle } from './style/renderable';

export type RichShapePoint = { x: number; y: number };
type RichShapePointTuple = readonly [number, number];

export function mapRichShapeX(
  x: number,
  viewBox: EditorBuiltInShapeViewBox,
  width: number
): number {
  return ((x - viewBox.minX) / viewBox.width) * width;
}

export function mapRichShapeY(
  y: number,
  viewBox: EditorBuiltInShapeViewBox,
  height: number
): number {
  return ((y - viewBox.minY) / viewBox.height) * height;
}

export function mapRichShapePoint(
  point: RichShapePointTuple,
  viewBox: EditorBuiltInShapeViewBox,
  width: number,
  height: number
): RichShapePoint {
  return {
    x: mapRichShapeX(point[0], viewBox, width),
    y: mapRichShapeY(point[1], viewBox, height),
  };
}

export function createRichShapePrimitiveOptions(
  style: RichShapeRenderableStyle,
  fill: RichShapeRenderableStyle['fill'] | string | null
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    fill: fill ?? 'transparent',
    objectCaching: false,
    stroke: style.stroke,
    strokeLineCap: style.strokeLineCap,
    strokeLineJoin: style.strokeLineJoin,
    strokeUniform: true,
    strokeWidth: style.strokeWidth,
  };
  if (style.shadow) {
    options['shadow'] = style.shadow;
  }
  if (style.strokeDashArray) {
    options['strokeDashArray'] = style.strokeDashArray;
  }
  return options;
}

export function createRichShapeGradientBackfillOptions(
  fill: RichShapeRenderableStyle['fill']
): Record<string, unknown> {
  return {
    fill,
    objectCaching: false,
    stroke: 'transparent',
    strokeWidth: 0,
  };
}

export function shouldRenderRoughGradientBackfill(shape: EditorRichShapeDocumentObject): boolean {
  return (
    shape.rough.enabled && shape.style.fill.type === 'gradient' && shape.style.fillTransparency < 1
  );
}
