import {
  getDrawingObjectBounds,
  collectDrawingGapCandidates,
  verifyDrawingGapCandidate,
  verifyDrawingDimensionCandidate,
  type DrawingSnapFeedback,
  type DrawingGapCandidate,
  type DrawingDimensionCandidate,
  type DrawingRelationBox,
  type DrawingSnapRelation,
  transformDrawingObjectPoint,
  transformDrawingObjectVector,
  untransformDrawingObjectVector,
  getDrawingObjectSelectionBounds,
  getDrawingSelectionBounds,
  type DrawingBounds,
  type DrawingObject,
  type DrawingPoint,
  type DrawingAlignmentGuide,
  type DrawingAlignmentTarget,
  type DrawingAlignmentAnchor,
} from '../../features/drawing/public';
import { resizeDrawingObject, type PointerDraft } from './interaction';
import {
  collectDrawingResizeDimensionChoices,
  measureDrawingRelationDimensions,
} from './alignment-relation-adapter';

export type { DrawingAlignmentGuide } from '../../features/drawing/public';

type Target = {
  target: DrawingAlignmentTarget;
  bounds: DrawingBounds;
  centerOnly?: boolean;
  inset?: number;
  points?: readonly DrawingPoint[];
};
type Candidate = {
  target: Target;
  sourceKind: DrawingAlignmentAnchor['kind'];
  targetKind: DrawingAlignmentAnchor['kind'];
  targetPoint?: DrawingPoint;
};
type Match = {
  key: string;
  delta: number;
  coordinate: number;
  center: boolean;
  candidates: Candidate[];
};
type AxisCandidate = Match & { candidate: Candidate };
type DomBounds = DrawingBounds & { alignmentTarget?: DrawingAlignmentTarget };
const SNAP_DISTANCE = 6;
const NEIGHBOR_DISTANCE = 96;

function distance(left: DrawingBounds, right: DrawingBounds): number {
  return Math.hypot(
    Math.max(0, left.x - right.x - right.width, right.x - left.x - left.width),
    Math.max(0, left.y - right.y - right.height, right.y - left.y - left.height)
  );
}

function getTargets(
  moving: readonly DrawingObject[],
  bounds: DrawingBounds,
  objects: readonly DrawingObject[],
  domBounds: readonly DomBounds[],
  includeDistantShapes = false
): Target[] {
  const ids = new Set(moving.map((object) => object.id));
  const shapes = objects
    .filter((object) => !ids.has(object.id))
    .map((object) => ({ object, bounds: getDrawingObjectSelectionBounds(object) }));
  if (moving.length === 1 && moving[0]?.kind === 'text') {
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const containing = shapes
      .filter(
        ({ object, bounds: target }) =>
          ['rectangle', 'ellipse', 'triangle', 'parallelogram'].includes(object.kind) &&
          center.x >= target.x &&
          center.x <= target.x + target.width &&
          center.y >= target.y &&
          center.y <= target.y + target.height &&
          bounds.width <= target.width &&
          bounds.height <= target.height
      )
      .sort(
        (left, right) =>
          left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height
      )[0];
    if (containing)
      return [
        {
          bounds: containing.bounds,
          target: { id: containing.object.id, kind: 'object', bounds: containing.bounds },
          centerOnly: containing.object.kind !== 'rectangle',
          inset: 8,
        },
      ];
  }
  return [
    ...shapes
      .filter(
        ({ bounds: target }) =>
          includeDistantShapes || distance(bounds, target) <= NEIGHBOR_DISTANCE
      )
      .map(({ object, bounds: target }) => ({
        bounds: target,
        target: { id: object.id, kind: 'object' as const, bounds: target },
        ...(object.kind === 'arrow' ? { points: [object.start, object.end] } : {}),
      })),
    ...domBounds
      .filter((target) => distance(bounds, target) <= NEIGHBOR_DISTANCE)
      .map((bounds) => ({
        bounds,
        target: bounds.alignmentTarget ?? {
          id: `dom:${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`,
          kind: 'dom' as const,
          bounds,
          showBounds: true,
        },
      })),
  ];
}

function isCenterCorrespondence(candidate: Candidate) {
  return candidate.sourceKind === 'center' && candidate.targetKind === 'center';
}

function compareAxisCandidates(
  a: AxisCandidate,
  b: AxisCandidate,
  previousIds: ReadonlySet<string>
) {
  const difference = Math.abs(a.delta) - Math.abs(b.delta);
  if (Math.abs(difference) >= 0.001) return difference;
  const center =
    Number(isCenterCorrespondence(b.candidate)) - Number(isCenterCorrespondence(a.candidate));
  if (Math.abs(a.delta - b.delta) < 0.001 && center) return center;
  return (
    Number(previousIds.has(b.candidate.target.target.id)) -
      Number(previousIds.has(a.candidate.target.target.id)) ||
    Number(b.center) - Number(a.center) ||
    a.candidate.target.target.id.localeCompare(b.candidate.target.target.id) ||
    a.coordinate - b.coordinate
  );
}

type AxisValue = { coordinate: number; kind: DrawingAlignmentAnchor['kind']; point?: DrawingPoint };
type AxisPreference = { guides?: readonly DrawingAlignmentGuide[]; key?: string };

function targetAxisValues(target: Target, axis: 'x' | 'y', explicit: boolean): AxisValue[] {
  if (explicit && target.points)
    return target.points.map((point) => ({ coordinate: point[axis], kind: 'point', point }));
  const size = axis === 'x' ? 'width' : 'height';
  const inset = Math.min(target.inset ?? 0, target.bounds[size] / 2);
  return [
    { coordinate: target.bounds[axis] + inset, kind: 'edge' },
    { coordinate: target.bounds[axis] + target.bounds[size] / 2, kind: 'center' },
    { coordinate: target.bounds[axis] + target.bounds[size] - inset, kind: 'edge' },
  ];
}

function axisCandidate(
  target: Target,
  axis: 'x' | 'y',
  source: { value: number; index: number; explicit: boolean },
  value: AxisValue
): AxisCandidate | null {
  const sourceKind = source.explicit ? 'point' : source.index === 1 ? 'center' : 'edge';
  if (!source.explicit && (source.index === 1) !== (value.kind === 'center')) return null;
  if (target.centerOnly && value.kind !== 'center') return null;
  const delta = value.coordinate - source.value;
  if (Math.abs(delta) > SNAP_DISTANCE) return null;
  return {
    key: JSON.stringify([
      'point',
      axis,
      target.target.id,
      sourceKind,
      source.index,
      value.kind,
      value.coordinate,
    ]),
    delta,
    coordinate: value.coordinate,
    center: value.kind === 'center',
    candidates: [],
    candidate: {
      target,
      sourceKind,
      targetKind: value.kind,
      ...(value.point ? { targetPoint: value.point } : {}),
    },
  };
}

function collectAxisCandidates(
  bounds: DrawingBounds,
  targets: Target[],
  axis: 'x' | 'y',
  sourceAnchors?: readonly number[]
) {
  const size = axis === 'x' ? 'width' : 'height';
  const anchors = sourceAnchors ?? [
    bounds[axis],
    bounds[axis] + bounds[size] / 2,
    bounds[axis] + bounds[size],
  ];
  const candidates: AxisCandidate[] = [];
  for (const target of targets) {
    const values = targetAxisValues(target, axis, !!sourceAnchors);
    for (const [index, anchor] of anchors.entries()) {
      for (const value of values) {
        const candidate = axisCandidate(
          target,
          axis,
          { value: anchor, index, explicit: !!sourceAnchors },
          value
        );
        if (candidate) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function comparePreferredAxis(
  a: AxisCandidate,
  b: AxisCandidate,
  previousIds: ReadonlySet<string>,
  key?: string
) {
  if (!key) return compareAxisCandidates(a, b, previousIds);
  const distance = Math.abs(a.delta) - Math.abs(b.delta);
  if (Math.abs(distance) >= 0.001) return distance;
  const center =
    Number(isCenterCorrespondence(b.candidate)) - Number(isCenterCorrespondence(a.candidate));
  if (Math.abs(a.delta - b.delta) < 0.001 && center) return center;
  return Number(b.key === key) - Number(a.key === key) || compareAxisCandidates(a, b, new Set());
}

function matchAxis(
  bounds: DrawingBounds,
  targets: Target[],
  axis: 'x' | 'y',
  sourceAnchors?: readonly number[],
  preference: AxisPreference = {}
): Match | null {
  const candidates = collectAxisCandidates(bounds, targets, axis, sourceAnchors);
  const previousIds = new Set(
    (preference.guides ?? [])
      .filter((guide) => guide.axis === axis)
      .flatMap((guide) => guide.matches?.map((match) => match.target.id) ?? [])
  );
  candidates.sort((a, b) => comparePreferredAxis(a, b, previousIds, preference.key));
  const best = candidates[0] ?? null;
  if (best)
    best.candidates = candidates
      .filter(
        (candidate) =>
          Math.abs(candidate.coordinate - best.coordinate) < 1e-6 &&
          Math.abs(candidate.delta - best.delta) < 1e-6
      )
      .map((candidate) => candidate.candidate);
  return best;
}

type SnapChoice = {
  key: string;
  delta: number;
  point?: Match;
  gap?: DrawingGapCandidate;
  dimension?: DrawingDimensionCandidate;
};

function emptyFeedback(): DrawingSnapFeedback {
  return { guides: [], relations: [], acceptedByAxis: {} };
}

function relationSource(
  moving: readonly DrawingObject[],
  bounds: DrawingBounds
): DrawingRelationBox {
  return { id: JSON.stringify(moving.map((object) => object.id).sort()), bounds };
}

function relationTargets(moving: readonly DrawingObject[], objects: readonly DrawingObject[]) {
  const ids = new Set(moving.map((object) => object.id));
  return objects
    .filter((object) => !ids.has(object.id))
    .map((object) => ({
      id: object.id,
      bounds: getDrawingObjectSelectionBounds(object),
    }));
}

function chooseCorrection(choices: SnapChoice[], previous?: string): SnapChoice | null {
  return (
    choices
      .filter((choice) => Math.abs(choice.delta) <= SNAP_DISTANCE)
      .sort((a, b) => {
        const distance = Math.abs(a.delta) - Math.abs(b.delta);
        if (Math.abs(distance) >= 0.001) return distance;
        const center = (choice: SnapChoice) =>
          choice.point?.candidates.some(isCenterCorrespondence) ?? false;
        const correspondence = Number(center(b)) - Number(center(a));
        if (Math.abs(a.delta - b.delta) < 0.001 && correspondence) return correspondence;
        return (
          Number(b.key === previous) - Number(a.key === previous) ||
          correspondence ||
          a.key.localeCompare(b.key)
        );
      })[0] ?? null
  );
}

function pointChoice(point: Match | null): SnapChoice[] {
  return point ? [{ key: point.key, delta: point.delta, point }] : [];
}

type MoveAlignmentInput = {
  moving: readonly DrawingObject[];
  axis?: 'x' | 'y';
  previousGuides?: readonly DrawingAlignmentGuide[];
  previousFeedback?: DrawingSnapFeedback;
  objects: readonly DrawingObject[];
  relationObjects?: readonly DrawingObject[];
  domBounds?: readonly DomBounds[];
};

function axisPreference(
  args: {
    previousGuides?: readonly DrawingAlignmentGuide[];
    previousFeedback?: DrawingSnapFeedback;
  },
  axis: 'x' | 'y'
): AxisPreference {
  const key = args.previousFeedback?.acceptedByAxis[axis];
  return {
    ...(args.previousGuides ? { guides: args.previousGuides } : {}),
    ...(key ? { key } : {}),
  };
}

function movePoint(
  args: MoveAlignmentInput,
  bounds: DrawingBounds,
  targets: Target[],
  axis: 'x' | 'y'
) {
  if (args.axis && args.axis !== axis) return null;
  return matchAxis(bounds, targets, axis, undefined, axisPreference(args, axis));
}

function moveChoice(
  args: MoveAlignmentInput,
  point: Match | null,
  gaps: readonly DrawingGapCandidate[],
  axis: 'x' | 'y'
) {
  if (args.axis && args.axis !== axis) return null;
  const candidates = gaps
    .filter((gap) => gap.axis === axis)
    .map((gap) => ({ key: gap.key, delta: gap.delta, gap }));
  return chooseCorrection(
    [...pointChoice(point), ...candidates],
    args.previousFeedback?.acceptedByAxis[axis]
  );
}

function verifyMoveRelations(
  gaps: readonly DrawingGapCandidate[],
  source: DrawingRelationBox,
  references: readonly DrawingRelationBox[],
  choices: { x: SnapChoice | null; y: SnapChoice | null }
) {
  const relations: DrawingSnapRelation[] = [];
  for (const gap of gaps) {
    const choice = choices[gap.axis];
    if (!choice || Math.abs(gap.delta - choice.delta) > 1e-6) continue;
    const relation = verifyDrawingGapCandidate({ candidate: gap, source, targets: references });
    if (!relation && gap.key === choice.key) return null;
    if (relation) relations.push(relation);
  }
  return relations;
}

function acceptedMoveGuides(
  bounds: DrawingBounds,
  targets: Target[],
  choices: { x: SnapChoice | null; y: SnapChoice | null },
  delta: DrawingPoint
) {
  const guides: DrawingAlignmentGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const choice = choices[axis];
    if (!choice) continue;
    const groups: Match[] = [];
    for (const candidate of collectAxisCandidates(bounds, targets, axis)) {
      if (Math.abs(candidate.delta - choice.delta) > 1e-6) continue;
      const group = groups.find(
        (match) => Math.abs(match.coordinate - candidate.coordinate) < 1e-6
      );
      if (group) group.candidates.push(candidate.candidate);
      else groups.push({ ...candidate, candidates: [candidate.candidate] });
    }
    const primary = choice.point?.coordinate ?? Infinity;
    groups.sort(
      (a, b) =>
        Number(Math.abs(b.coordinate - primary) < 1e-6) -
          Number(Math.abs(a.coordinate - primary) < 1e-6) || a.coordinate - b.coordinate
    );
    for (const group of groups) {
      const x = axis === 'x' ? group : null,
        y = axis === 'y' ? group : null;
      guides.push(...getAlignmentGuides(bounds, x, y, delta));
    }
  }
  return guides;
}

/** Resolves one disposable correction from the raw translated selection. */
export function resolveDrawingMoveAlignment(
  args: MoveAlignmentInput
): DrawingSnapFeedback & { delta: DrawingPoint } {
  const unchanged = { delta: { x: 0, y: 0 }, ...emptyFeedback() };
  const bounds = getDrawingSelectionBounds(args.moving);
  if (!bounds) return unchanged;
  const targets = getTargets(args.moving, bounds, args.objects, args.domBounds ?? []);
  const source = relationSource(args.moving, bounds);
  const references = relationTargets(args.moving, args.relationObjects ?? args.objects);
  const gaps = collectDrawingGapCandidates({ source, targets: references });
  const points = {
    x: movePoint(args, bounds, targets, 'x'),
    y: movePoint(args, bounds, targets, 'y'),
  };
  const x = moveChoice(args, points.x, gaps, 'x'),
    y = moveChoice(args, points.y, gaps, 'y');
  const delta = { x: x?.delta ?? 0, y: y?.delta ?? 0 };
  const finalSource = {
    ...source,
    bounds: { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y },
  };
  const relations = verifyMoveRelations(gaps, finalSource, references, { x, y });
  if (!relations) return unchanged;
  const acceptedByAxis = { ...(x ? { x: x.key } : {}), ...(y ? { y: y.key } : {}) };
  return {
    delta,
    relations,
    acceptedByAxis,
    guides: acceptedMoveGuides(bounds, targets, { x, y }, delta),
  };
}

function getAlignmentGuides(
  bounds: DrawingBounds,
  x: Match | null,
  y: Match | null,
  delta: DrawingPoint = { x: 0, y: 0 },
  sourcePoint?: DrawingPoint
): DrawingAlignmentGuide[] {
  const guides: DrawingAlignmentGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const match = axis === 'x' ? x : y;
    if (!match) continue;
    const perpendicular = axis === 'x' ? 'y' : 'x';
    const size = axis === 'x' ? 'height' : 'width';
    const source = sourcePoint ?? {
      x: bounds.x + delta.x + bounds.width / 2,
      y: bounds.y + delta.y + bounds.height / 2,
    };
    const matches = match.candidates.map((candidate) => {
      const target = candidate.target.bounds;
      const anchor = candidate.targetPoint ?? {
        x: axis === 'x' ? match.coordinate : target.x + target.width / 2,
        y: axis === 'y' ? match.coordinate : target.y + target.height / 2,
      };
      return {
        target: candidate.target.target,
        source: { kind: candidate.sourceKind, point: { ...source, [axis]: match.coordinate } },
        anchor: { kind: candidate.targetKind, point: anchor },
      };
    });
    guides.push({
      axis,
      coordinate: match.coordinate,
      matches,
      points: match.candidates.flatMap((candidate) => {
        const starts = [
          bounds[perpendicular] + delta[perpendicular],
          candidate.target.bounds[perpendicular],
        ];
        return starts.flatMap((start, index) => {
          const length = index === 0 ? bounds[size] : candidate.target.bounds[size];
          return (
            candidate.targetKind === 'center' ? [start + length / 2] : [start, start + length]
          ).map((value) =>
            axis === 'x' ? { x: match.coordinate, y: value } : { x: value, y: match.coordinate }
          );
        });
      }),
      from:
        Math.min(
          bounds[perpendicular] + delta[perpendicular],
          ...match.candidates.map((candidate) => candidate.target.bounds[perpendicular])
        ) - 8,
      to:
        Math.max(
          bounds[perpendicular] + delta[perpendicular] + bounds[size],
          ...match.candidates.map(
            (candidate) => candidate.target.bounds[perpendicular] + candidate.target.bounds[size]
          )
        ) + 8,
    });
  }
  return guides;
}

type ResizeDraft = Extract<PointerDraft, { kind: 'resize' }>;
function localHandle(bounds: DrawingBounds, x: number, y: number): DrawingPoint {
  return {
    x: bounds.x + (bounds.width * (x + 1)) / 2,
    y: bounds.y + (bounds.height * (y + 1)) / 2,
  };
}

export function getDrawingResizeHandleGeometry(
  draft: ResizeDraft,
  point: DrawingPoint,
  fromCenter: boolean
) {
  if (draft.original.kind === 'arrow' && draft.object.kind === 'arrow') {
    const handle = draft.handle === 'start' ? 'start' : 'end';
    return { x: 1, y: 1, original: draft.original[handle], current: draft.object[handle] };
  }
  const bounds = getDrawingObjectBounds(draft.original);
  let x = draft.handle.includes('w') ? -1 : draft.handle.includes('e') ? 1 : 0;
  let y = draft.handle.includes('n') ? -1 : draft.handle.includes('s') ? 1 : 0;
  const original = localHandle(bounds, x, y);
  const anchor = localHandle(bounds, fromCenter ? 0 : -x, fromCenter ? 0 : -y);
  const delta = untransformDrawingObjectVector(draft.original, {
    x: point.x - draft.start.x,
    y: point.y - draft.start.y,
  });
  // Normalized resize bounds can cross the fixed anchor without changing the grabbed handle.
  if (x && (original.x + delta.x - anchor.x) * x < 0) x = -x;
  if (y && (original.y + delta.y - anchor.y) * y < 0) y = -y;
  return {
    x,
    y,
    original: transformDrawingObjectPoint(draft.original, original),
    current: transformDrawingObjectPoint(
      draft.object,
      localHandle(getDrawingObjectBounds(draft.object), x, y)
    ),
  };
}

type ResizeAlignmentInput = {
  draft: ResizeDraft;
  previousGuides?: readonly DrawingAlignmentGuide[];
  previousFeedback?: DrawingSnapFeedback;
  relationObjects?: readonly DrawingObject[];
  point: DrawingPoint;
  modifiers: { ctrlKey: boolean; shiftKey: boolean };
  objects: readonly DrawingObject[];
  domBounds?: readonly DomBounds[];
};

type ResizeContext = {
  args: ResizeAlignmentInput;
  geometry: ReturnType<typeof getDrawingResizeHandleGeometry>;
  x: Match | null;
  y: Match | null;
  dimensions: ReturnType<typeof collectDrawingResizeDimensionChoices>;
};
type ResizeDecision = {
  delta: DrawingPoint;
  acceptedDimensions: DrawingDimensionCandidate[];
  acceptedByAxis: DrawingSnapFeedback['acceptedByAxis'];
};

function unsupportedResize({ draft, modifiers }: ResizeAlignmentInput) {
  if (draft.handle === 'start' || draft.handle === 'end') return draft.original.kind !== 'arrow';
  if (draft.original.kind === 'text') return draft.handle !== 'e' && draft.handle !== 'w';
  return (
    modifiers.ctrlKey &&
    ['rectangle', 'ellipse', 'triangle', 'parallelogram'].includes(draft.original.kind) &&
    (draft.handle === 'n' || draft.handle === 's')
  );
}

function independentResizeCorrection(context: ResizeContext): ResizeDecision {
  const { args, x, y, dimensions } = context;
  const localPoint = untransformDrawingObjectVector(args.draft.original, {
    x: x?.delta ?? 0,
    y: y?.delta ?? 0,
  });
  const local = { x: 0, y: 0 };
  const acceptedDimensions: DrawingDimensionCandidate[] = [];
  const acceptedByAxis: DrawingSnapFeedback['acceptedByAxis'] = {};
  for (const axis of ['x', 'y'] as const) {
    const point = axis === 'x' ? x : y;
    const pointChoices = point ? [{ key: point.key, delta: localPoint[axis], point }] : [];
    const dimension = axis === 'x' ? 'width' : 'height';
    const choices = dimensions.dimensions
      .filter((entry) => entry.candidate.dimension === dimension)
      .map((entry) => ({
        key: entry.candidate.key,
        delta: entry.local[axis],
        dimension: entry.candidate,
      }));
    const choice = chooseCorrection(
      [...pointChoices, ...choices],
      args.previousFeedback?.acceptedByAxis[axis]
    );
    local[axis] = choice?.delta ?? 0;
    if (choice) acceptedByAxis[axis] = choice.key;
    if (choice?.dimension) acceptedDimensions.push(choice.dimension);
  }
  return {
    delta: transformDrawingObjectVector(args.draft.original, local),
    acceptedDimensions,
    acceptedByAxis,
  };
}

function resizeDirection(draft: ResizeDraft, geometry: ResizeContext['geometry']) {
  const original = getDrawingObjectBounds(draft.original);
  const fixed =
    draft.original.kind === 'arrow'
      ? draft.original[draft.handle === 'start' ? 'end' : 'start']
      : null;
  const local =
    geometry.x && geometry.y
      ? { x: geometry.x * original.width, y: geometry.y * original.height }
      : { x: geometry.x ? 1 : 0, y: geometry.y ? 1 : 0 };
  const vector = fixed
    ? { x: geometry.current.x - fixed.x, y: geometry.current.y - fixed.y }
    : transformDrawingObjectVector(draft.original, local);
  const length = Math.hypot(vector.x, vector.y);
  return length < 1e-6 ? null : { x: vector.x / length, y: vector.y / length };
}

function scalarPointChoices(context: ResizeContext, direction: DrawingPoint): SnapChoice[] {
  return (['x', 'y'] as const).flatMap((axis) => {
    const point = context[axis];
    return point && Math.abs(direction[axis]) > 1e-6
      ? [{ key: point.key, delta: point.delta / direction[axis], point }]
      : [];
  });
}

function constrainedResizeCorrection(context: ResizeContext): ResizeDecision | null {
  const { args, geometry, dimensions } = context;
  const direction = resizeDirection(args.draft, geometry);
  if (!direction) return null;
  if (Math.abs(direction.x) <= 1e-6) context.x = null;
  if (Math.abs(direction.y) <= 1e-6) context.y = null;
  const choices: SnapChoice[] = [
    ...scalarPointChoices(context, direction),
    ...dimensions.dimensions.map((entry) => ({
      key: entry.candidate.key,
      delta: entry.correction.x * direction.x + entry.correction.y * direction.y,
      dimension: entry.candidate,
    })),
  ];
  const previous = args.previousFeedback?.acceptedByAxis;
  const choice = chooseCorrection(choices, previous?.x ?? previous?.y);
  if (!choice) return null;
  return {
    delta: { x: direction.x * choice.delta, y: direction.y * choice.delta },
    acceptedDimensions: choice.dimension ? [choice.dimension] : [],
    acceptedByAxis: {
      ...(Math.abs(direction.x) > 1e-6 ? { x: choice.key } : {}),
      ...(Math.abs(direction.y) > 1e-6 ? { y: choice.key } : {}),
    },
  };
}

function applyResizeCorrection(context: ResizeContext, delta: DrawingPoint) {
  const {
    args: { draft, modifiers },
    geometry,
    x,
    y,
  } = context;
  const adjusted = {
    x: draft.start.x + geometry.current.x + delta.x - geometry.original.x,
    y: draft.start.y + geometry.current.y + delta.y - geometry.original.y,
  };
  let object = resizeDrawingObject(draft, adjusted, modifiers);
  const actualHandle = () =>
    getDrawingResizeHandleGeometry({ ...draft, object }, adjusted, modifiers.ctrlKey).current;
  let actual = actualHandle();
  const freehand = draft.original.kind === 'pencil' || draft.original.kind === 'marker';
  // Preserve the established outline rebuild refinement only for freehand point snapping.
  for (let attempt = 0; freehand && attempt < 3; attempt += 1) {
    const correction = { x: x ? x.coordinate - actual.x : 0, y: y ? y.coordinate - actual.y : 0 };
    if (Math.abs(correction.x) <= 0.5 && Math.abs(correction.y) <= 0.5) break;
    adjusted.x += correction.x;
    adjusted.y += correction.y;
    object = resizeDrawingObject(draft, adjusted, modifiers);
    actual = actualHandle();
  }
  return { object, actual, tolerance: freehand ? 0.5 : 1e-6 };
}

function acceptedResizePoint(match: Match | null, coordinate: number, tolerance: number) {
  return match && Math.abs(coordinate - match.coordinate) <= tolerance ? match : null;
}

function verifyResizeDimensions(
  context: ResizeContext,
  candidates: readonly DrawingDimensionCandidate[],
  object: DrawingObject
) {
  const relations: DrawingSnapRelation[] = [];
  const source = measureDrawingRelationDimensions(object);
  for (const candidate of candidates) {
    const relation = verifyDrawingDimensionCandidate({
      candidate,
      source,
      targets: context.dimensions.targets,
    });
    if (!relation) return null;
    relations.push(relation);
  }
  return relations;
}

function primaryResizeKeysAccepted(
  decision: ResizeDecision,
  relations: readonly DrawingSnapRelation[],
  x: Match | null,
  y: Match | null
) {
  const keys = new Set([x?.key, y?.key, ...relations.map((relation) => relation.key)]);
  return Object.values(decision.acceptedByAxis).every((key) => keys.has(key));
}

function verifyResizeFeedback(
  context: ResizeContext,
  decision: ResizeDecision,
  applied: ReturnType<typeof applyResizeCorrection>
): DrawingSnapFeedback | null {
  const { object, actual, tolerance } = applied;
  const x = acceptedResizePoint(context.x, actual.x, tolerance);
  const y = acceptedResizePoint(context.y, actual.y, tolerance);
  const relations = verifyResizeDimensions(context, decision.acceptedDimensions, object);
  if (!relations || !primaryResizeKeysAccepted(decision, relations, x, y)) return null;
  if (!x && !y && !relations.length) return null;
  return {
    relations,
    acceptedByAxis: decision.acceptedByAxis,
    guides: getAlignmentGuides(
      getDrawingObjectSelectionBounds(object),
      x,
      y,
      { x: 0, y: 0 },
      actual
    ),
  };
}

/** Applies one native correction, then verifies every accepted witness against its final geometry. */
export function resolveDrawingResizeAlignment(
  args: ResizeAlignmentInput
): DrawingSnapFeedback & { object: DrawingObject } {
  const { draft, point, modifiers } = args;
  const unchanged = { object: draft.object, ...emptyFeedback() };
  if (unsupportedResize(args)) return unchanged;
  const geometry = getDrawingResizeHandleGeometry(draft, point, modifiers.ctrlKey);
  const bounds = getDrawingObjectSelectionBounds(draft.object);
  const targets = getTargets([draft.object], bounds, args.objects, args.domBounds ?? [], true);
  const context: ResizeContext = {
    args,
    geometry,
    x: matchAxis(bounds, targets, 'x', [geometry.current.x], axisPreference(args, 'x')),
    y: matchAxis(bounds, targets, 'y', [geometry.current.y], axisPreference(args, 'y')),
    dimensions: collectDrawingResizeDimensionChoices({
      original: draft.original,
      object: draft.object,
      geometry,
      modifiers,
      objects: args.relationObjects ?? args.objects,
    }),
  };
  const decision =
    geometry.x && geometry.y && !modifiers.shiftKey
      ? independentResizeCorrection(context)
      : constrainedResizeCorrection(context);
  if (!decision) return unchanged;
  const applied = applyResizeCorrection(context, decision.delta);
  const feedback = verifyResizeFeedback(context, decision, applied);
  return feedback ? { object: applied.object, ...feedback } : unchanged;
}
