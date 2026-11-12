import type { DrawingBounds, DrawingPoint } from './model';

export type DrawingRelationBox = { readonly id: string; readonly bounds: DrawingBounds };
export type DrawingRelationSpan = {
  readonly from: DrawingPoint;
  readonly to: DrawingPoint;
  readonly participantIds: readonly string[];
};
export type DrawingDimensionMeasurement = {
  readonly value: number;
  readonly from: DrawingPoint;
  readonly to: DrawingPoint;
};
export type DrawingDimensionGeometry = {
  readonly id: string;
  readonly width?: DrawingDimensionMeasurement;
  readonly height?: DrawingDimensionMeasurement;
};
export type DrawingGapCandidate = {
  readonly kind: 'gap';
  readonly mode: 'center' | 'repeat';
  readonly axis: 'x' | 'y';
  readonly key: string;
  readonly sourceId: string;
  readonly referenceIds: readonly [string, string];
  readonly placement: 'between' | 'before' | 'after';
  readonly delta: number;
  readonly value: number;
};
export type DrawingDimensionCandidate = {
  readonly kind: 'dimension';
  readonly dimension: 'width' | 'height';
  readonly key: string;
  readonly sourceId: string;
  readonly referenceId: string;
  readonly value: number;
};
export type DrawingGapRelation = {
  readonly kind: 'gap';
  readonly mode: 'center' | 'repeat';
  readonly axis: 'x' | 'y';
  readonly key: string;
  readonly value: number;
  readonly spans: readonly DrawingRelationSpan[];
};
export type DrawingDimensionRelation = {
  readonly kind: 'dimension';
  readonly dimension: 'width' | 'height';
  readonly key: string;
  readonly value: number;
  readonly sourceSpan: DrawingRelationSpan;
  readonly targetSpans: readonly DrawingRelationSpan[];
};
export type DrawingSnapRelation = DrawingGapRelation | DrawingDimensionRelation;

type Axis = DrawingGapCandidate['axis'];
type Dimension = DrawingDimensionCandidate['dimension'];
type Band = { from: number; to: number };
type AxisIndex = { axis: Axis; boxes: DrawingRelationBox[]; maxEnds: number[] };
type NeighborPair = { a: DrawingRelationBox; b: DrawingRelationBox; band: Band };
const EPSILON = 1e-6;
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const start = (box: DrawingRelationBox, axis: Axis) => box.bounds[axis];
const size = (box: DrawingRelationBox, axis: Axis) =>
  axis === 'x' ? box.bounds.width : box.bounds.height;
const end = (box: DrawingRelationBox, axis: Axis) => start(box, axis) + size(box, axis);
const perpendicular = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x');
const bandOf = (box: DrawingRelationBox, axis: Axis): Band => ({
  from: start(box, perpendicular(axis)),
  to: end(box, perpendicular(axis)),
});
const overlaps = (a: Band, b: Band) => Math.min(a.to, b.to) - Math.max(a.from, b.from) > EPSILON;
const intersection = (a: Band, b: Band): Band | null =>
  overlaps(a, b) ? { from: Math.max(a.from, b.from), to: Math.min(a.to, b.to) } : null;
const equal = (a: number, b: number, epsilon: number) => Math.abs(a - b) <= epsilon;

function validBox(box: DrawingRelationBox) {
  const { x, y, width, height } = box.bounds;
  return (
    box.id.length > 0 &&
    [x, y, width, height, x + width, y + height].every(Number.isFinite) &&
    width > EPSILON &&
    height > EPSILON
  );
}

function commonBand(boxes: readonly DrawingRelationBox[], axis: Axis): Band | null {
  let from = -Infinity;
  let to = Infinity;
  for (const box of boxes) {
    const band = bandOf(box, axis);
    from = Math.max(from, band.from);
    to = Math.min(to, band.to);
  }
  return to - from > EPSILON ? { from, to } : null;
}

function createIndex(boxes: readonly DrawingRelationBox[], axis: Axis): AxisIndex {
  const ordered = boxes
    .filter(validBox)
    .sort(
      (a, b) =>
        start(a, axis) - start(b, axis) ||
        end(a, axis) - end(b, axis) ||
        start(a, perpendicular(axis)) - start(b, perpendicular(axis)) ||
        compareIds(a.id, b.id)
    );
  const unique = new Map<string, DrawingRelationBox>();
  for (const box of ordered) if (!unique.has(box.id)) unique.set(box.id, box);
  const result = [...unique.values()];
  let maximum = -Infinity;
  const maxEnds = result.map((box) => {
    maximum = Math.max(maximum, end(box, axis));
    return maximum;
  });
  return { axis, boxes: result, maxEnds };
}

function eligibleIndex(
  source: DrawingRelationBox,
  targets: readonly DrawingRelationBox[],
  axis: Axis
) {
  return createIndex(
    targets.filter(
      (target) => target.id !== source.id && overlaps(bandOf(source, axis), bandOf(target, axis))
    ),
    axis
  );
}

/** Prefix maxima prune intervals that cannot occupy the proposed gap or destination. */
function hasOccupant(index: AxisIndex, from: number, to: number, band: Band): boolean {
  let low = 0,
    high = index.boxes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (start(index.boxes[middle]!, index.axis) < to - EPSILON) low = middle + 1;
    else high = middle;
  }
  for (
    let position = low - 1;
    position >= 0 && index.maxEnds[position]! > from + EPSILON;
    position--
  ) {
    const box = index.boxes[position]!;
    if (end(box, index.axis) > from + EPSILON && overlaps(bandOf(box, index.axis), band))
      return true;
  }
  return false;
}

function addBlockedBand(bands: readonly Band[], addition: Band): Band[] {
  const result: Band[] = [];
  let combined = { ...addition };
  for (const band of bands) {
    if (band.to < combined.from - EPSILON) result.push(band);
    else if (combined.to < band.from - EPSILON) {
      result.push(combined);
      combined = band;
    } else
      combined = { from: Math.min(band.from, combined.from), to: Math.max(band.to, combined.to) };
  }
  result.push(combined);
  return result;
}

function firstIntervalPast(index: AxisIndex, coordinate: number): number {
  let low = 0,
    high = index.boxes.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (index.maxEnds[middle]! <= coordinate + EPSILON) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Only neighbors visible through the source's perpendicular band can define a gap. */
function adjacentPairs(index: AxisIndex, sourceBand: Band): NeighborPair[] {
  const pairs: NeighborPair[] = [];
  for (const a of index.boxes) {
    const aBand = intersection(bandOf(a, index.axis), sourceBand);
    if (!aBand) continue;
    let blocked: Band[] = [];
    for (let first = firstIntervalPast(index, end(a, index.axis)); first < index.boxes.length;) {
      const groupStart = start(index.boxes[first]!, index.axis);
      let next = first + 1;
      while (
        next < index.boxes.length &&
        equal(start(index.boxes[next]!, index.axis), groupStart, EPSILON)
      )
        next++;
      for (let position = first; position < next; position++) {
        const b = index.boxes[position]!;
        const band = intersection(aBand, bandOf(b, index.axis));
        if (
          groupStart > end(a, index.axis) + EPSILON &&
          band &&
          !blocked.some((item) => overlaps(item, band))
        )
          pairs.push({ a, b, band });
      }
      for (let position = first; position < next; position++) {
        const b = index.boxes[position]!;
        if (b.id === a.id || end(b, index.axis) <= end(a, index.axis) + EPSILON) continue;
        const band = intersection(aBand, bandOf(b, index.axis));
        if (band) blocked = addBlockedBand(blocked, band);
      }
      if (
        blocked.length === 1 &&
        blocked[0]!.from <= aBand.from + EPSILON &&
        blocked[0]!.to >= aBand.to - EPSILON
      )
        break;
      first = next;
    }
  }
  return pairs;
}

function gapCandidate(
  source: DrawingRelationBox,
  pair: NeighborPair,
  axis: Axis,
  mode: DrawingGapCandidate['mode'],
  placement: DrawingGapCandidate['placement'],
  value: number,
  position: number
): DrawingGapCandidate {
  return {
    kind: 'gap',
    mode,
    axis,
    sourceId: source.id,
    referenceIds: [pair.a.id, pair.b.id],
    placement,
    key: JSON.stringify(['gap', axis, mode, placement, source.id, pair.a.id, pair.b.id]),
    delta: position - start(source, axis),
    value,
  };
}

function candidatesOnAxis(
  source: DrawingRelationBox,
  targets: readonly DrawingRelationBox[],
  axis: Axis
) {
  const index = eligibleIndex(source, targets, axis);
  const result: DrawingGapCandidate[] = [];
  for (const pair of adjacentPairs(index, bandOf(source, axis))) {
    const gap = start(pair.b, axis) - end(pair.a, axis);
    const centeredGap = (gap - size(source, axis)) / 2;
    if (centeredGap > EPSILON)
      result.push(
        gapCandidate(
          source,
          pair,
          axis,
          'center',
          'between',
          centeredGap,
          end(pair.a, axis) + centeredGap
        )
      );
    const after = end(pair.b, axis) + gap;
    if (!hasOccupant(index, end(pair.b, axis), after + size(source, axis), pair.band))
      result.push(gapCandidate(source, pair, axis, 'repeat', 'after', gap, after));
    const before = start(pair.a, axis) - gap - size(source, axis);
    if (!hasOccupant(index, before, start(pair.a, axis), pair.band))
      result.push(gapCandidate(source, pair, axis, 'repeat', 'before', gap, before));
  }
  return result;
}

/** Propose scene-axis translations. Runtime adapters own distance admission and mutation. */
export function collectDrawingGapCandidates(input: {
  source: DrawingRelationBox;
  targets: readonly DrawingRelationBox[];
}): readonly DrawingGapCandidate[] {
  if (!validBox(input.source)) return [];
  return [
    ...candidatesOnAxis(input.source, input.targets, 'x'),
    ...candidatesOnAxis(input.source, input.targets, 'y'),
  ].sort((a, b) => compareIds(a.key, b.key));
}

function nominatedGaps(
  candidate: DrawingGapCandidate,
  source: DrawingRelationBox,
  a: DrawingRelationBox,
  b: DrawingRelationBox
): readonly [DrawingRelationBox, DrawingRelationBox][] {
  if (candidate.mode === 'center' && candidate.placement === 'between')
    return [
      [a, source],
      [source, b],
    ];
  if (candidate.mode !== 'repeat') return [];
  if (candidate.placement === 'before')
    return [
      [source, a],
      [a, b],
    ];
  return candidate.placement === 'after'
    ? [
        [a, b],
        [b, source],
      ]
    : [];
}

function connectedParticipants(
  sourceId: string,
  edges: readonly NeighborPair[]
): ReadonlySet<string> {
  const neighbors = new Map<string, string[]>();
  for (const { a, b } of edges) {
    neighbors.set(a.id, [...(neighbors.get(a.id) ?? []), b.id]);
    neighbors.set(b.id, [...(neighbors.get(b.id) ?? []), a.id]);
  }
  const participants = new Set([sourceId]);
  const pending = [sourceId];
  while (pending.length) {
    for (const id of neighbors.get(pending.pop()!) ?? []) {
      if (participants.has(id)) continue;
      participants.add(id);
      pending.push(id);
    }
  }
  return participants;
}

function connectedSpans(
  source: DrawingRelationBox,
  targets: readonly DrawingRelationBox[],
  axis: Axis,
  value: number,
  band: Band,
  epsilon: number
): DrawingRelationSpan[] {
  const midpoint = (band.from + band.to) / 2;
  const original = eligibleIndex(source, targets, axis);
  const boxes = [
    source,
    ...original.boxes.filter((box) => {
      const candidate = bandOf(box, axis);
      return candidate.from < midpoint && candidate.to > midpoint;
    }),
  ];
  const index = createIndex(boxes, axis);
  const edges = adjacentPairs(index, band).filter(
    (pair) =>
      equal(start(pair.b, axis) - end(pair.a, axis), value, epsilon) &&
      !hasOccupant(original, end(pair.a, axis), start(pair.b, axis), pair.band)
  );
  const participants = connectedParticipants(source.id, edges);
  const shared = commonBand(
    boxes.filter((box) => participants.has(box.id)),
    axis
  );
  if (!shared) return [];
  const coordinate = (shared.from + shared.to) / 2;
  return edges
    .filter((pair) => participants.has(pair.a.id) && participants.has(pair.b.id))
    .map((pair) => ({
      from: axisPoint(axis, end(pair.a, axis), coordinate),
      to: axisPoint(axis, start(pair.b, axis), coordinate),
      participantIds: [pair.a.id, pair.b.id],
    }))
    .sort((a, b) => compareIds(JSON.stringify(a.participantIds), JSON.stringify(b.participantIds)));
}

function axisPoint(axis: Axis, coordinate: number, perpendicularCoordinate: number): DrawingPoint {
  return axis === 'x'
    ? { x: coordinate, y: perpendicularCoordinate }
    : { x: perpendicularCoordinate, y: coordinate };
}

/** Verify fresh final geometry; no witness survives a rejected native correction. */
export function verifyDrawingGapCandidate(input: {
  candidate: DrawingGapCandidate;
  source: DrawingRelationBox;
  targets: readonly DrawingRelationBox[];
  epsilon?: number;
}): DrawingGapRelation | null {
  const { candidate, source } = input;
  if (
    source.id !== candidate.sourceId ||
    !validBox(source) ||
    !Number.isFinite(candidate.value) ||
    candidate.value <= EPSILON
  )
    return null;
  const epsilon = input.epsilon ?? EPSILON;
  if (!Number.isFinite(epsilon) || epsilon < 0) return null;
  const index = eligibleIndex(source, input.targets, candidate.axis);
  const a = index.boxes.find((box) => box.id === candidate.referenceIds[0]);
  const b = index.boxes.find((box) => box.id === candidate.referenceIds[1]);
  if (!a || !b || start(b, candidate.axis) - end(a, candidate.axis) <= EPSILON) return null;
  const band = commonBand([source, a, b], candidate.axis);
  const gaps = nominatedGaps(candidate, source, a, b);
  if (
    !band ||
    gaps.length !== 2 ||
    hasOccupant(index, start(source, candidate.axis), end(source, candidate.axis), band)
  )
    return null;
  if (
    gaps.some(
      ([left, right]) =>
        !equal(
          start(right, candidate.axis) - end(left, candidate.axis),
          candidate.value,
          epsilon
        ) || hasOccupant(index, end(left, candidate.axis), start(right, candidate.axis), band)
    )
  )
    return null;
  const spans = connectedSpans(
    source,
    input.targets,
    candidate.axis,
    candidate.value,
    band,
    epsilon
  );
  if (
    !spans.some((span) => span.participantIds.includes(a.id)) ||
    !spans.some((span) => span.participantIds.includes(b.id))
  )
    return null;
  return {
    kind: 'gap',
    key: candidate.key,
    mode: candidate.mode,
    axis: candidate.axis,
    value: candidate.value,
    spans,
  };
}

function validMeasurement(
  measurement: DrawingDimensionMeasurement | undefined
): measurement is DrawingDimensionMeasurement {
  return (
    measurement !== undefined &&
    Number.isFinite(measurement.value) &&
    measurement.value > EPSILON &&
    [measurement.from.x, measurement.from.y, measurement.to.x, measurement.to.y].every(
      Number.isFinite
    ) &&
    Math.hypot(measurement.to.x - measurement.from.x, measurement.to.y - measurement.from.y) >
      EPSILON
  );
}

function dimensionTargets(targets: readonly DrawingDimensionGeometry[], dimension: Dimension) {
  const unique = new Map<string, { id: string; measurement: DrawingDimensionMeasurement }>();
  const ordered = targets
    .flatMap((target) => {
      const measurement = target[dimension];
      return target.id && validMeasurement(measurement) ? [{ id: target.id, measurement }] : [];
    })
    .sort(
      (a, b) =>
        compareIds(a.id, b.id) ||
        a.measurement.value - b.measurement.value ||
        a.measurement.from.x - b.measurement.from.x ||
        a.measurement.from.y - b.measurement.from.y ||
        a.measurement.to.x - b.measurement.to.x ||
        a.measurement.to.y - b.measurement.to.y
    );
  for (const target of ordered) if (!unique.has(target.id)) unique.set(target.id, target);
  return [...unique.values()];
}

/** Target size is not handle displacement. Do not prefilter by a scene-size delta. */
export function collectDrawingDimensionCandidates(input: {
  source: DrawingDimensionGeometry;
  targets: readonly DrawingDimensionGeometry[];
}): readonly DrawingDimensionCandidate[] {
  const candidates: DrawingDimensionCandidate[] = [];
  if (!input.source.id) return candidates;
  for (const dimension of ['width', 'height'] as const) {
    if (!validMeasurement(input.source[dimension])) continue;
    for (const target of dimensionTargets(input.targets, dimension)) {
      if (target.id === input.source.id) continue;
      candidates.push({
        kind: 'dimension',
        dimension,
        sourceId: input.source.id,
        referenceId: target.id,
        value: target.measurement.value,
        key: JSON.stringify(['dimension', dimension, input.source.id, target.id]),
      });
    }
  }
  return candidates.sort((a, b) => compareIds(a.key, b.key));
}

function dimensionSpan(id: string, measurement: DrawingDimensionMeasurement): DrawingRelationSpan {
  return { from: { ...measurement.from }, to: { ...measurement.to }, participantIds: [id] };
}

/** Compare authoritative final sizes and retain every actual matching measurement span. */
export function verifyDrawingDimensionCandidate(input: {
  candidate: DrawingDimensionCandidate;
  source: DrawingDimensionGeometry;
  targets: readonly DrawingDimensionGeometry[];
  epsilon?: number;
}): DrawingDimensionRelation | null {
  const { source, candidate } = input;
  const measurement = source[candidate.dimension];
  const epsilon = input.epsilon ?? EPSILON;
  if (
    !source.id ||
    source.id !== candidate.sourceId ||
    !Number.isFinite(epsilon) ||
    epsilon < 0 ||
    !Number.isFinite(candidate.value) ||
    candidate.value <= EPSILON ||
    !validMeasurement(measurement) ||
    !equal(measurement.value, candidate.value, epsilon)
  )
    return null;
  const matches = dimensionTargets(input.targets, candidate.dimension).filter(
    (target) => target.id !== source.id && equal(target.measurement.value, candidate.value, epsilon)
  );
  if (!matches.some((target) => target.id === candidate.referenceId)) return null;
  return {
    kind: 'dimension',
    dimension: candidate.dimension,
    key: candidate.key,
    value: candidate.value,
    sourceSpan: dimensionSpan(source.id, measurement),
    targetSpans: matches.map((target) => dimensionSpan(target.id, target.measurement)),
  };
}
