import type { FabricObject } from 'fabric';
import {
  collectDrawingGapCandidates,
  verifyDrawingGapCandidate,
  type DrawingGapCandidate,
  type DrawingSnapFeedback,
  type DrawingAlignmentAnchor,
  type DrawingAlignmentGuide,
  type DrawingAlignmentTarget,
  type DrawingBounds,
} from '../../../features/drawing/public';

/** The Fabric drag inputs shared by magnet and grid movement handling. */
export interface EditorMoveEvent {
  target?: FabricObject;
  e?: { shiftKey?: boolean };
  pointer?: { x: number; y: number };
  transform?: {
    action?: string;
    ex: number;
    ey: number;
    original: { left: number; top: number };
  };
}

/** Derive the drag position in Fabric's containing plane before any snapping. */
export function getEditorMovePosition(event: EditorMoveEvent) {
  const { pointer, transform } = event;
  if (!pointer || !transform || transform.action !== 'drag') return null;
  const dx = pointer.x - transform.ex;
  const dy = pointer.y - transform.ey;
  const { left, top } = transform.original;
  if (![dx, dy, left, top].every(Number.isFinite)) return null;
  const lockedAxis: 'left' | 'top' | null = event.e?.shiftKey
    ? Math.abs(dx) >= Math.abs(dy)
      ? 'top'
      : 'left'
    : null;
  return {
    left: left + (lockedAxis === 'left' ? 0 : dx),
    top: top + (lockedAxis === 'top' ? 0 : dy),
    lockedAxis,
  };
}

export type EditorSnapAnchor = DrawingAlignmentAnchor;
export type EditorSnapTarget = {
  target: DrawingAlignmentTarget;
  anchors: readonly EditorSnapAnchor[];
};

type MoveAxis = 'x' | 'y';
type AxisCandidate = {
  key: string;
  delta: number;
  source: EditorSnapAnchor;
  anchor: EditorSnapAnchor;
  target: EditorSnapTarget['target'];
};
type MoveSnapInput = {
  source: readonly EditorSnapAnchor[];
  bounds: DrawingBounds;
  targets: readonly EditorSnapTarget[];
  threshold: number;
  previous: DrawingSnapFeedback;
  sourceId?: string;
  lockedAxis?: MoveAxis;
  lockedAxes?: readonly MoveAxis[];
};

function collectAxisCandidates(args: MoveSnapInput, axis: MoveAxis) {
  const candidates: AxisCandidate[] = [];
  for (const source of args.source)
    for (const target of args.targets)
      for (const anchor of target.anchors) {
        const amount = anchor.point[axis] - source.point[axis];
        if (Math.abs(amount) <= args.threshold)
          candidates.push({
            key: JSON.stringify([
              'point',
              axis,
              args.sourceId ?? 'selection',
              anchorIdentity(source, args.source),
              target.target.id,
              anchorIdentity(anchor, target.anchors),
            ]),
            delta: amount,
            source,
            anchor,
            target: target.target,
          });
      }
  return candidates;
}

function anchorIdentity(anchor: EditorSnapAnchor, anchors: readonly EditorSnapAnchor[]) {
  const features = anchors
    .filter((feature) => feature.kind === anchor.kind)
    .sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);
  return [anchor.kind, features.indexOf(anchor)];
}

export type EditorSnapCandidate = { key: string; delta: number; center: boolean };

/** Choose one nearest correction; retain its exact primary identity only inside numerical ties. */
export function chooseEditorSnapCandidate<T extends EditorSnapCandidate>(
  candidates: readonly T[],
  previous: string | undefined,
  threshold: number
): T | undefined {
  const band = (threshold / 6) * 0.001;
  return [...candidates].sort((a, b) => {
    const distance = Math.abs(a.delta) - Math.abs(b.delta);
    if (Math.abs(distance) >= band && distance !== 0) return distance;
    const center = Number(b.center) - Number(a.center);
    const history = Number(b.key === previous) - Number(a.key === previous);
    return Math.abs(a.delta - b.delta) < band || a.delta === b.delta
      ? center || history || a.key.localeCompare(b.key)
      : history || center || a.key.localeCompare(b.key);
  })[0];
}

function projectAppliedMatches(
  candidates: readonly AxisCandidate[],
  delta: { x: number; y: number }
) {
  return candidates.map((candidate) => ({
    target: candidate.target,
    anchor: candidate.anchor,
    source: {
      kind: candidate.source.kind,
      point: { x: candidate.source.point.x + delta.x, y: candidate.source.point.y + delta.y },
    },
  }));
}

function appliedMatchIdentity(match: ReturnType<typeof projectAppliedMatches>[number]) {
  return [
    match.target.id,
    match.anchor.kind,
    match.anchor.point.x,
    match.anchor.point.y,
    match.source.point.x,
    match.source.point.y,
  ].join(':');
}

function projectAppliedGuide(
  axis: MoveAxis,
  candidates: readonly AxisCandidate[],
  bounds: DrawingBounds,
  delta: { x: number; y: number },
  threshold: number
): DrawingAlignmentGuide {
  const perpendicular = axis === 'x' ? 'y' : 'x';
  const size = axis === 'x' ? 'height' : 'width';
  const matches = projectAppliedMatches(candidates, delta);
  const coordinate = matches[0]!.anchor.point[axis];
  const unique = new Map(matches.map((match) => [appliedMatchIdentity(match), match]));
  return {
    axis,
    coordinate,
    matches: [...unique.values()],
    points: matches.flatMap((match) => [match.source.point, match.anchor.point]),
    from:
      Math.min(
        bounds[perpendicular] + delta[perpendicular],
        ...matches.map((match) => match.target.bounds[perpendicular])
      ) -
      (threshold * 4) / 3,
    to:
      Math.max(
        bounds[perpendicular] + delta[perpendicular] + bounds[size],
        ...matches.map((match) => match.target.bounds[perpendicular] + match.target.bounds[size])
      ) +
      (threshold * 4) / 3,
  };
}

function groupAxisCoordinates(
  axis: MoveAxis,
  candidates: readonly AxisCandidate[],
  primary: number | undefined
) {
  const groups: AxisCandidate[][] = [];
  const sorted = [...candidates].sort(
    (a, b) => a.anchor.point[axis] - b.anchor.point[axis] || a.key.localeCompare(b.key)
  );
  for (const candidate of sorted) {
    const group = groups.at(-1);
    if (group && Math.abs(group[0]!.anchor.point[axis] - candidate.anchor.point[axis]) < 1e-6)
      group.push(candidate);
    else groups.push([candidate]);
  }
  return groups.sort(
    (a, b) =>
      Number(primary !== undefined && Math.abs(b[0]!.anchor.point[axis] - primary) < 1e-6) -
        Number(primary !== undefined && Math.abs(a[0]!.anchor.point[axis] - primary) < 1e-6) ||
      a[0]!.anchor.point[axis] - b[0]!.anchor.point[axis]
  );
}

/** Select point or equal-gap corrections from the same raw movement proposal. */
export function resolveEditorMoveSnap(args: MoveSnapInput) {
  const accepted = new Map<MoveAxis, AxisCandidate[]>();
  const primaryCoordinates = new Map<MoveAxis, number>();
  const selectedGaps: DrawingGapCandidate[] = [];
  const delta = { x: 0, y: 0 };
  const acceptedByAxis: DrawingSnapFeedback['acceptedByAxis'] = {};
  const sourceBox = { id: args.sourceId ?? 'selection', bounds: args.bounds };
  const boxes = args.targets
    .filter(({ target }) => target.kind === 'object')
    .map(({ target }) => ({ id: target.id, bounds: target.bounds }));
  const gaps = collectDrawingGapCandidates({ source: sourceBox, targets: boxes });
  for (const axis of ['x', 'y'] as const) {
    if (args.lockedAxis === axis || args.lockedAxes?.includes(axis)) continue;
    const points = collectAxisCandidates(args, axis);
    const candidates = [
      ...points.map((point) => ({
        ...point,
        center: point.source.kind === 'center' && point.anchor.kind === 'center',
        kind: 'point' as const,
      })),
      ...gaps
        .filter((gap) => gap.axis === axis && Math.abs(gap.delta) <= args.threshold)
        .map((gap) => ({ ...gap, center: false })),
    ];
    const best = chooseEditorSnapCandidate(
      candidates,
      args.previous.acceptedByAxis[axis],
      args.threshold
    );
    if (!best) continue;
    delta[axis] = best.delta;
    acceptedByAxis[axis] = best.key;
    if (best.kind === 'gap') selectedGaps.push(best);
    else primaryCoordinates.set(axis, best.anchor.point[axis]);
    accepted.set(
      axis,
      points.filter((candidate) => Math.abs(candidate.delta - best.delta) < 1e-6)
    );
  }

  const finalSource = () => ({
    ...sourceBox,
    bounds: { ...args.bounds, x: args.bounds.x + delta.x, y: args.bounds.y + delta.y },
  });
  const retained = new Set(selectedGaps);
  for (let pass = 0; pass < 2; pass++)
    for (const candidate of retained) {
      if (!verifyDrawingGapCandidate({ candidate, source: finalSource(), targets: boxes })) {
        retained.delete(candidate);
        delta[candidate.axis] = 0;
        delete acceptedByAxis[candidate.axis];
        accepted.delete(candidate.axis);
      }
    }
  const relations = [...retained].flatMap((candidate) => {
    const relation = verifyDrawingGapCandidate({
      candidate,
      source: finalSource(),
      targets: boxes,
    });
    return relation ? [relation] : [];
  });
  const guides = [...accepted].flatMap(([axis, candidates]) =>
    groupAxisCoordinates(axis, candidates, primaryCoordinates.get(axis)).map((matches) =>
      projectAppliedGuide(axis, matches, args.bounds, delta, args.threshold)
    )
  );
  return { delta, guides, relations, acceptedByAxis };
}
