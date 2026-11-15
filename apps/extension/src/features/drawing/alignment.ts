import type { DrawingRelationSpan, DrawingSnapRelation } from './alignment-relations';
import type { DrawingBounds, DrawingPoint } from './model';

export type DrawingAlignmentAnchor = { kind: 'edge' | 'center' | 'point'; point: DrawingPoint };
export type DrawingAlignmentTarget = {
  id: string;
  kind: 'object' | 'dom' | 'workspace';
  bounds: DrawingBounds;
  /** Only an unpainted DOM box needs temporary boundary explanations. */
  showBounds?: boolean;
};
export type DrawingAlignmentMatch = {
  target: DrawingAlignmentTarget;
  source: DrawingAlignmentAnchor;
  anchor: DrawingAlignmentAnchor;
};
export type DrawingAlignmentGuide = {
  axis: 'x' | 'y';
  coordinate: number;
  from: number;
  to: number;
  points: readonly DrawingPoint[];
  matches?: readonly DrawingAlignmentMatch[];
};

export type DrawingSnapFeedback = {
  guides: readonly DrawingAlignmentGuide[];
  relations: readonly DrawingSnapRelation[];
  acceptedByAxis: { x?: string; y?: string };
};

type AlignmentAxis = DrawingAlignmentGuide['axis'];
type AlignmentLine = Omit<DrawingAlignmentGuide, 'points' | 'matches'>;
type AlignmentMarker = DrawingPoint & { filled: boolean };
type AxisMatch = DrawingAlignmentMatch & { axis: AlignmentAxis };
type AcceptedTarget = {
  target: DrawingAlignmentTarget;
  matches: AxisMatch[];
  axes: Set<AlignmentAxis>;
};
type TargetCorner = DrawingPoint & { dx: number; dy: number };

const pointKey = (point: DrawingPoint) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;
const samePoint = (a: DrawingPoint, b: DrawingPoint) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

function collectAcceptedTargets(guides: readonly DrawingAlignmentGuide[]) {
  const targets = new Map<string, AcceptedTarget>();
  for (const guide of guides) {
    for (const match of guide.matches ?? []) {
      let target = targets.get(match.target.id);
      if (!target) {
        target = { target: match.target, matches: [], axes: new Set() };
        targets.set(match.target.id, target);
      }
      target.matches.push({ ...match, axis: guide.axis });
      target.axes.add(guide.axis);
    }
  }
  return targets;
}

function collectCenterMarkers(guides: readonly DrawingAlignmentGuide[]) {
  const markers = new Map<string, AlignmentMarker>();
  for (const guide of guides) {
    for (const match of guide.matches ?? []) {
      if (match.anchor.kind !== 'center') continue;
      const key = pointKey(match.anchor.point);
      if (!markers.has(key)) markers.set(key, { ...match.anchor.point, filled: false });
    }
  }
  return markers;
}

function isCoincidentPointMatch(match: AxisMatch) {
  return (
    samePoint(match.source.point, match.anchor.point) &&
    match.source.kind !== 'edge' &&
    match.anchor.kind !== 'edge'
  );
}

function matchesOtherPointAxis(match: AxisMatch, other: AxisMatch) {
  return (
    other.axis !== match.axis &&
    other.source.kind !== 'edge' &&
    other.anchor.kind !== 'edge' &&
    samePoint(other.source.point, match.source.point) &&
    samePoint(other.anchor.point, match.anchor.point)
  );
}

function completeCoincidentMarkers(
  targets: ReadonlyMap<string, AcceptedTarget>,
  markers: Map<string, AlignmentMarker>
) {
  for (const { matches, axes } of targets.values()) {
    if (axes.size !== 2) continue;
    for (const match of matches) {
      if (!isCoincidentPointMatch(match)) continue;
      if (matches.some((other) => matchesOtherPointAxis(match, other)))
        markers.set(pointKey(match.anchor.point), { ...match.anchor.point, filled: true });
    }
  }
}

function mergeAcceptedLines(guides: readonly DrawingAlignmentGuide[]) {
  const merged = new Map<string, AlignmentLine>();
  for (const guide of guides) {
    const key = `${guide.axis}:${guide.coordinate.toFixed(6)}`;
    const previous = merged.get(key);
    merged.set(key, {
      axis: guide.axis,
      coordinate: guide.coordinate,
      from: Math.min(previous?.from ?? guide.from, guide.from),
      to: Math.max(previous?.to ?? guide.to, guide.to),
    });
  }
  return merged;
}

function splitLineAroundMarkers(guide: AlignmentLine, stops: readonly number[], gap: number) {
  const lines: AlignmentLine[] = [];
  let from = guide.from;
  for (const stop of stops) {
    if (stop + gap <= from || stop - gap >= guide.to) continue;
    if (stop - gap > from) lines.push({ ...guide, from, to: stop - gap });
    from = Math.max(from, stop + gap);
  }
  if (from < guide.to) lines.push({ ...guide, from });
  return lines;
}

function projectGappedLines(
  merged: ReadonlyMap<string, AlignmentLine>,
  markers: readonly AlignmentMarker[],
  scale: number
) {
  const lines: AlignmentLine[] = [];
  for (const guide of merged.values()) {
    const perpendicular = guide.axis === 'x' ? 'y' : 'x';
    const stops = markers
      .filter((marker) => Math.abs(marker[guide.axis] - guide.coordinate) < 1e-6)
      .map((marker) => marker[perpendicular])
      .sort((a, b) => a - b);
    lines.push(...splitLineAroundMarkers(guide, stops, 6 / scale));
  }
  return lines;
}

function targetCorners(bounds: DrawingBounds): TargetCorner[] {
  return [
    { x: bounds.x, y: bounds.y, dx: 1, dy: 1 },
    { x: bounds.x + bounds.width, y: bounds.y, dx: -1, dy: 1 },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height, dx: -1, dy: -1 },
    { x: bounds.x, y: bounds.y + bounds.height, dx: 1, dy: -1 },
  ];
}

function participatesInDomCorner(corner: TargetCorner, accepted: AcceptedTarget, centers: boolean) {
  const { target, axes, matches } = accepted;
  if (axes.size === 2) return true;
  if (centers) return axes.has('x') ? corner.y === target.bounds.y : corner.x === target.bounds.x;
  return matches.some(
    (match) =>
      (axes.has('x') && Math.abs(match.anchor.point.x - corner.x) < 1e-6) ||
      (axes.has('y') && Math.abs(match.anchor.point.y - corner.y) < 1e-6)
  );
}

function projectDomBrackets(targets: ReadonlyMap<string, AcceptedTarget>, scale: number) {
  const brackets: DrawingPoint[][] = [];
  for (const accepted of targets.values()) {
    if (accepted.target.kind !== 'dom' || !accepted.target.showBounds) continue;
    const centers = accepted.matches.some((match) => match.anchor.kind === 'center');
    for (const corner of targetCorners(accepted.target.bounds)) {
      if (!participatesInDomCorner(corner, accepted, centers)) continue;
      brackets.push([
        { x: corner.x + (corner.dx * 6) / scale, y: corner.y },
        { x: corner.x, y: corner.y },
        { x: corner.x, y: corner.y + (corner.dy * 6) / scale },
      ]);
    }
  }
  return brackets;
}

type RelationMeasurement = {
  key: string;
  kind: DrawingSnapRelation['kind'];
  axis: AlignmentAxis;
  value: number;
  segments: DrawingPoint[][];
  label: { point: DrawingPoint; anchor: 'start' | 'middle' | 'end'; text: string } | null;
};

function projectMeasurementSpan(
  relation: DrawingSnapRelation,
  span: DrawingRelationSpan,
  scale: number
): RelationMeasurement | null {
  const dx = span.to.x - span.from.x;
  const dy = span.to.y - span.from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  const axis = relation.kind === 'gap' ? relation.axis : relation.dimension === 'width' ? 'x' : 'y';
  const normal =
    axis === 'x' ? { x: -dy / length, y: dx / length } : { x: dy / length, y: -dx / length };
  const offset = relation.kind === 'dimension' ? -20 / scale : 0;
  const from = { x: span.from.x + normal.x * offset, y: span.from.y + normal.y * offset };
  const to = { x: span.to.x + normal.x * offset, y: span.to.y + normal.y * offset };
  const cap = (point: DrawingPoint) => [
    { x: point.x - (normal.x * 3) / scale, y: point.y - (normal.y * 3) / scale },
    { x: point.x + (normal.x * 3) / scale, y: point.y + (normal.y * 3) / scale },
  ];
  const text = String(Math.round(relation.value * 10) / 10);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const showLabel = length * scale >= (horizontal ? text.length * 6 + 4 : 14);
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const side = normal.x * (offset || 1) < 0 ? -1 : 1;
  return {
    key: JSON.stringify([relation.kind, axis, span.participantIds]),
    kind: relation.kind,
    axis,
    value: relation.value,
    segments: [[from, to], cap(from), cap(to)],
    label: showLabel
      ? {
          point: horizontal
            ? { x: middle.x, y: middle.y - 4 / scale }
            : { x: middle.x + (side * 4) / scale, y: middle.y + 3 / scale },
          anchor: horizontal ? 'middle' : side < 0 ? 'end' : 'start',
          text,
        }
      : null,
  };
}

function compareMeasurementGeometry(left: RelationMeasurement, right: RelationMeasurement) {
  const a = left.segments[0]!,
    b = right.segments[0]!;
  return (
    a[0]!.x - b[0]!.x ||
    a[0]!.y - b[0]!.y ||
    a[1]!.x - b[1]!.x ||
    a[1]!.y - b[1]!.y ||
    left.value - right.value
  );
}

function projectRelationMeasurements(relations: readonly DrawingSnapRelation[], scale: number) {
  const measurements = new Map<string, RelationMeasurement>();
  for (const relation of relations) {
    const spans =
      relation.kind === 'gap' ? relation.spans : [relation.sourceSpan, ...relation.targetSpans];
    for (const span of spans) {
      const measurement = projectMeasurementSpan(relation, span, scale);
      if (!measurement) continue;
      const previous = measurements.get(measurement.key);
      if (!previous || compareMeasurementGeometry(measurement, previous) < 0)
        measurements.set(measurement.key, measurement);
    }
  }
  return [...measurements.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Derive only feedback for accepted solver matches. All dimensions are in scene units. */
export function resolveDrawingAlignmentFeedback(
  guides: readonly DrawingAlignmentGuide[],
  screenScale = 1,
  relations: readonly DrawingSnapRelation[] = []
) {
  const scale = Number.isFinite(screenScale) && screenScale > 0 ? screenScale : 1;
  const targets = collectAcceptedTargets(guides);
  const markers = collectCenterMarkers(guides);
  completeCoincidentMarkers(targets, markers);
  const lines = projectGappedLines(mergeAcceptedLines(guides), [...markers.values()], scale);
  const brackets = projectDomBrackets(targets, scale);
  const measurements = projectRelationMeasurements(relations, scale);
  return { lines, markers: [...markers.values()], brackets, measurements };
}
