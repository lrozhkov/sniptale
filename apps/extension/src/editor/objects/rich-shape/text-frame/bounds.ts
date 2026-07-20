import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
} from '../../../../features/editor/document/rich-shape';
import type { GeometryBounds, RichShapeTextFrame } from './types';

function addPoint(bounds: GeometryBounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function addCommandPoints(bounds: GeometryBounds, command: EditorBuiltInShapePathCommand): void {
  switch (command[0]) {
    case 'M':
    case 'L':
      addPoint(bounds, command[1], command[2]);
      return;
    case 'Q':
      addPoint(bounds, command[1], command[2]);
      addPoint(bounds, command[3], command[4]);
      return;
    case 'C':
      addPoint(bounds, command[1], command[2]);
      addPoint(bounds, command[3], command[4]);
      addPoint(bounds, command[5], command[6]);
      return;
    case 'A':
      addPoint(bounds, command[6], command[7]);
      return;
    case 'Z':
      return;
  }
}

function createEmptyBounds(): GeometryBounds {
  return {
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
  };
}

function isResolvedBounds(bounds: GeometryBounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxY)
  );
}

function resolveViewBoxBounds(geometry: EditorBuiltInShapeGeometryDefinition): GeometryBounds {
  return {
    maxX: geometry.viewBox.minX + geometry.viewBox.width,
    maxY: geometry.viewBox.minY + geometry.viewBox.height,
    minX: geometry.viewBox.minX,
    minY: geometry.viewBox.minY,
  };
}

function textFrameToBounds(frame: RichShapeTextFrame): GeometryBounds {
  return {
    maxX: frame.left + frame.width,
    maxY: frame.top + frame.height,
    minX: frame.left,
    minY: frame.top,
  };
}

export function resolveRichShapeGeometryBounds(
  geometry: EditorBuiltInShapeGeometryDefinition
): GeometryBounds {
  if (geometry.textFrame) {
    return textFrameToBounds(geometry.textFrame);
  }

  const bounds = createEmptyBounds();

  if (geometry.type === 'polyline') {
    geometry.points.forEach(([x, y]) => addPoint(bounds, x, y));
  } else {
    geometry.paths.forEach((path) => {
      path.commands.forEach((command) => addCommandPoints(bounds, command));
    });
  }

  return isResolvedBounds(bounds) ? bounds : resolveViewBoxBounds(geometry);
}
