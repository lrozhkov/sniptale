import type {
  DrawingAlignmentAnchor,
  DrawingAlignmentGuide,
  DrawingAlignmentTarget,
  DrawingPoint,
} from '../../../features/drawing/public';

type GuidePoint = DrawingPoint & {
  alignment?: { target: DrawingAlignmentTarget; kind: DrawingAlignmentAnchor['kind'] };
};
type GuideLine = { origin: GuidePoint; target: GuidePoint };
export type MagnetGuideProjection = DrawingAlignmentGuide[];

/** Project vendor resize results only when the final source actually reaches the target. */
export function projectMagnetGuides(
  verticalLines: ReadonlySet<string>,
  horizontalLines: ReadonlySet<string>,
  source: {
    anchors: readonly DrawingAlignmentAnchor[];
    bounds: DrawingAlignmentTarget['bounds'];
    screenScale: number;
  }
): MagnetGuideProjection {
  const guides: DrawingAlignmentGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const perpendicular = axis === 'x' ? 'y' : 'x';
    const size = axis === 'x' ? 'height' : 'width';
    const entries = axis === 'x' ? verticalLines : horizontalLines;
    for (const value of entries) {
      const entry = parseGuide(value);
      if (!entry) continue;
      const actual = source.anchors
        .filter((anchor) => Math.abs(anchor.point[axis] - entry.target[axis]) < 1e-6)
        .sort(
          (a, b) =>
            Math.hypot(a.point.x - entry.origin.x, a.point.y - entry.origin.y) -
            Math.hypot(b.point.x - entry.origin.x, b.point.y - entry.origin.y)
        )[0];
      const metadata = entry.target.alignment;
      if (!actual || !metadata) continue;
      const target = metadata.target;
      const match = {
        source: actual,
        anchor: { kind: metadata.kind, point: { x: entry.target.x, y: entry.target.y } },
        target,
      };
      guides.push({
        axis,
        coordinate: entry.target[axis],
        matches: [match],
        points: [actual.point, match.anchor.point],
        from:
          Math.min(source.bounds[perpendicular], target.bounds[perpendicular]) -
          8 / source.screenScale,
        to:
          Math.max(
            source.bounds[perpendicular] + source.bounds[size],
            target.bounds[perpendicular] + target.bounds[size]
          ) +
          8 / source.screenScale,
      });
    }
  }
  return guides;
}

function readPoint(value: unknown): GuidePoint | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('x' in value) ||
    !('y' in value) ||
    typeof value.x !== 'number' ||
    !Number.isFinite(value.x) ||
    typeof value.y !== 'number' ||
    !Number.isFinite(value.y)
  )
    return null;
  const point: GuidePoint = { x: value.x, y: value.y };
  if (!('alignment' in value)) return point;
  const metadata = value.alignment;
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !('kind' in metadata) ||
    !('target' in metadata) ||
    (metadata.kind !== 'center' && metadata.kind !== 'edge' && metadata.kind !== 'point')
  )
    return null;
  const target = metadata.target;
  if (
    !target ||
    typeof target !== 'object' ||
    !('id' in target) ||
    typeof target.id !== 'string' ||
    !('kind' in target) ||
    (target.kind !== 'object' && target.kind !== 'workspace') ||
    !('bounds' in target)
  )
    return null;
  const bounds = target.bounds;
  if (
    !bounds ||
    typeof bounds !== 'object' ||
    !('x' in bounds) ||
    !('y' in bounds) ||
    !('width' in bounds) ||
    !('height' in bounds) ||
    typeof bounds.x !== 'number' ||
    typeof bounds.y !== 'number' ||
    typeof bounds.width !== 'number' ||
    typeof bounds.height !== 'number' ||
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width < 0 ||
    bounds.height < 0
  )
    return null;
  point.alignment = {
    kind: metadata.kind,
    target: {
      id: target.id,
      kind: target.kind,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    },
  };
  return point;
}

function parseGuide(value: string): GuideLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !('origin' in parsed) || !('target' in parsed))
    return null;
  const origin = readPoint(parsed.origin),
    target = readPoint(parsed.target);
  return origin && target ? { origin, target } : null;
}
