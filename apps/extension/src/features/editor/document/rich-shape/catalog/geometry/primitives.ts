import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathGeometry,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapeTextFrame,
  EditorBuiltInShapePolylineGeometry,
  EditorBuiltInShapeViewBox,
} from '../types';

const VIEW_BOX: EditorBuiltInShapeViewBox = { minX: 0, minY: 0, width: 100, height: 100 };

export type Point = readonly [number, number];

function normalizePoints(points: readonly Point[]): Point[] {
  if (points.length === 0) {
    return [];
  }

  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return points.map(([x, y]) => [((x - minX) / width) * 100, ((y - minY) / height) * 100]);
}

export function path(
  commands: readonly EditorBuiltInShapePathCommand[],
  textFrame?: EditorBuiltInShapeTextFrame
): EditorBuiltInShapePathGeometry {
  return {
    type: 'path',
    viewBox: VIEW_BOX,
    paths: [{ commands }],
    ...(textFrame ? { textFrame } : {}),
  };
}

export function paths(
  primitives: readonly EditorBuiltInShapePathPrimitive[],
  textFrame?: EditorBuiltInShapeTextFrame
): EditorBuiltInShapePathGeometry {
  return {
    type: 'path',
    viewBox: VIEW_BOX,
    paths: primitives,
    ...(textFrame ? { textFrame } : {}),
  };
}

export function polyline(
  points: readonly Point[],
  closed = false,
  textFrame?: EditorBuiltInShapeTextFrame
): EditorBuiltInShapePolylineGeometry {
  return {
    type: 'polyline',
    viewBox: VIEW_BOX,
    points,
    closed,
    ...(textFrame ? { textFrame } : {}),
  };
}

export function polygon(
  points: readonly Point[],
  textFrame?: EditorBuiltInShapeTextFrame
): EditorBuiltInShapePathGeometry {
  const [first, ...rest] = points;
  if (!first) {
    return path([]);
  }

  return path(
    [['M', first[0], first[1]], ...rest.map((point) => ['L', point[0], point[1]] as const), ['Z']],
    textFrame
  );
}

export function rectangle(inset = 0): EditorBuiltInShapePathGeometry {
  return polygon([
    [inset, inset],
    [100 - inset, inset],
    [100 - inset, 100 - inset],
    [inset, 100 - inset],
  ]);
}

export function roundRectangle(radius = 18): EditorBuiltInShapePathGeometry {
  const r = Math.max(0, Math.min(50, radius));
  return path([
    ['M', r, 0],
    ['L', 100 - r, 0],
    ['Q', 100, 0, 100, r],
    ['L', 100, 100 - r],
    ['Q', 100, 100, 100 - r, 100],
    ['L', r, 100],
    ['Q', 0, 100, 0, 100 - r],
    ['L', 0, r],
    ['Q', 0, 0, r, 0],
    ['Z'],
  ]);
}

export function ellipse(): EditorBuiltInShapePathGeometry {
  return path([
    ['M', 50, 0],
    ['C', 77.61, 0, 100, 22.39, 100, 50],
    ['C', 100, 77.61, 77.61, 100, 50, 100],
    ['C', 22.39, 100, 0, 77.61, 0, 50],
    ['C', 0, 22.39, 22.39, 0, 50, 0],
    ['Z'],
  ]);
}

export function regularPolygon(
  sides: number,
  startAngle = -90,
  radius = 42
): EditorBuiltInShapePathGeometry {
  const points = Array.from({ length: sides }, (_, index): Point => {
    const angle = ((startAngle + (360 / sides) * index) * Math.PI) / 180;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  });
  return polygon(normalizePoints(points));
}

export function star(
  points: number,
  innerRadius = 20,
  outerRadius = 43
): EditorBuiltInShapePathGeometry {
  const starPoints = Array.from({ length: points * 2 }, (_, index): Point => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = ((-90 + (180 / points) * index) * Math.PI) / 180;
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  });
  return polygon(normalizePoints(starPoints));
}

export function plus(thickness = 32): EditorBuiltInShapePathGeometry {
  const a = (100 - thickness) / 2;
  const b = a + thickness;
  return polygon([
    [a, 0],
    [b, 0],
    [b, a],
    [100, a],
    [100, b],
    [b, b],
    [b, 100],
    [a, 100],
    [a, b],
    [0, b],
    [0, a],
    [a, a],
  ]);
}

export function cross(thickness = 22): EditorBuiltInShapePathGeometry {
  const a = thickness / 2;
  const b = 50 - a;
  const c = 50 + a;
  const d = 100 - a;

  return polygon([
    [a, 0],
    [50, b],
    [d, 0],
    [100, a],
    [c, 50],
    [100, d],
    [d, 100],
    [50, c],
    [a, 100],
    [0, d],
    [b, 50],
    [0, a],
  ]);
}

export type GeometryMap = Record<string, EditorBuiltInShapeGeometryDefinition>;
