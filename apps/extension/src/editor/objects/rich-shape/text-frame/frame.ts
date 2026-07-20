import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import { resolveRichShapeGeometryBounds } from './bounds';
import { resolveRichShapeTextFrameGeometry } from './geometry';
import type { RichShapeTextFrame } from './types';

function mapX(
  shape: EditorRichShapeDocumentObject,
  geometry: EditorBuiltInShapeGeometryDefinition,
  x: number
) {
  return ((x - geometry.viewBox.minX) / geometry.viewBox.width) * shape.frame.width;
}

function mapY(
  shape: EditorRichShapeDocumentObject,
  geometry: EditorBuiltInShapeGeometryDefinition,
  y: number
) {
  return ((y - geometry.viewBox.minY) / geometry.viewBox.height) * shape.frame.height;
}

function resolveVisualFrame(shape: EditorRichShapeDocumentObject): RichShapeTextFrame {
  const geometry = resolveRichShapeTextFrameGeometry(shape);

  if (!geometry) {
    return {
      height: shape.frame.height,
      left: 0,
      top: 0,
      width: shape.frame.width,
    };
  }

  const bounds = resolveRichShapeGeometryBounds(geometry);
  const left = mapX(shape, geometry, bounds.minX);
  const top = mapY(shape, geometry, bounds.minY);
  return {
    height: Math.max(1, mapY(shape, geometry, bounds.maxY) - top),
    left,
    top,
    width: Math.max(1, mapX(shape, geometry, bounds.maxX) - left),
  };
}

export function resolveRichShapeTextFrame(
  shape: EditorRichShapeDocumentObject
): RichShapeTextFrame {
  const visualFrame = resolveVisualFrame(shape);
  const { bottom, left, right, top } = shape.text.insets;
  return {
    height: Math.max(1, visualFrame.height - top - bottom),
    left: visualFrame.left + left,
    top: visualFrame.top + top,
    width: Math.max(1, visualFrame.width - left - right),
  };
}
