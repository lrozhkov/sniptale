import { Point, controlsUtils, type FabricObject, type Transform } from 'fabric';
import {
  collectDrawingDimensionCandidates,
  verifyDrawingDimensionCandidate,
  type DrawingDimensionCandidate,
  type DrawingDimensionGeometry,
  type DrawingSnapFeedback,
  type DrawingAlignmentGuide,
  type DrawingSnapRelation,
} from '../../../features/drawing/public';
import type { EditorMagnetTransformEvent } from './aligning-guidelines';
import {
  chooseEditorSnapCandidate,
  resolveEditorMoveSnap,
  type EditorSnapTarget,
} from './move-axis';

type ResizeTarget = { object: FabricObject; description: EditorSnapTarget };
type ResizeInput = {
  sourceId: string;
  targets: readonly ResizeTarget[];
  previous: DrawingSnapFeedback;
  threshold: number;
};

function emptyFeedback(): {
  guides: DrawingAlignmentGuide[];
  relations: DrawingSnapRelation[];
  acceptedByAxis: DrawingSnapFeedback['acceptedByAxis'];
} {
  return { guides: [], relations: [], acceptedByAxis: {} };
}

function resizePointMap(object: FabricObject): Record<string, Point> {
  const [tl, tr, br, bl] = object.getCoords();
  if (!tl || !tr || !br || !bl) return {};
  return {
    tl,
    tr,
    br,
    bl,
    mt: tl.add(tr).scalarDivide(2),
    mr: tr.add(br).scalarDivide(2),
    mb: bl.add(br).scalarDivide(2),
    ml: tl.add(bl).scalarDivide(2),
  };
}

function targetDimensions(targets: readonly ResizeTarget[]) {
  return targets.flatMap(({ object, description }) => {
    const geometry =
      description.target.kind === 'object'
        ? dimensionGeometry(object, description.target.id)
        : null;
    return geometry ? [geometry] : [];
  });
}

type NativeResizeContext = ResizeInput & {
  event: EditorMagnetTransformEvent;
  target: FabricObject;
  source: DrawingDimensionGeometry;
  dimensions: DrawingDimensionGeometry[];
  descriptions: EditorSnapTarget[];
  point: Point;
  fixed: Point;
  transform: Transform;
  uniform: boolean;
};

function nativeResizeContext(
  input: ResizeInput & { event: EditorMagnetTransformEvent }
): NativeResizeContext | null {
  const { event } = input;
  const target = event.target;
  const corner = event.transform.corner;
  if (
    !event.transform.action?.startsWith('scale') ||
    !isDimensionBox(target) ||
    !['tl', 'tr', 'br', 'bl', 'mt', 'mr', 'mb', 'ml'].includes(corner)
  )
    return null;
  target.setCoords();
  const source = dimensionGeometry(target, input.sourceId);
  const point = resizePointMap(target)[corner];
  if (!source || !point) return null;
  const transform = {
    ...event.transform,
    target,
    originX: event.transform.originX ?? event.transform.original.originX,
    originY: event.transform.originY ?? event.transform.original.originY,
  };
  const relativeFixed = target.getPositionByOrigin(transform.originX, transform.originY);
  const fixed = target.group
    ? relativeFixed.transform(target.group.calcTransformMatrix())
    : relativeFixed;
  const uniformKey = target.canvas?.uniScaleKey ?? 'shiftKey';
  const uniform =
    /^[tb][lr]$/.test(corner) &&
    Boolean(target.canvas?.uniformScaling) !== Boolean(event.e?.[uniformKey]);
  return {
    ...input,
    target,
    source,
    point,
    fixed,
    transform,
    uniform,
    descriptions: input.targets.map(({ description }) => description),
    dimensions: targetDimensions(input.targets),
  };
}

function selectNativeResizeProposals(context: NativeResizeContext, proposals: ResizeProposal[]) {
  if (context.uniform) {
    const best = chooseEditorSnapCandidate(
      proposals,
      context.previous.acceptedByAxis.x ?? context.previous.acceptedByAxis.y,
      context.threshold
    );
    return best ? [best] : [];
  }
  return (['x', 'y'] as const).flatMap((axis) => {
    const best = chooseEditorSnapCandidate(
      proposals.filter((proposal) => proposal.axis === axis),
      context.previous.acceptedByAxis[axis],
      context.threshold
    );
    return best ? [best] : [];
  });
}

type AcceptedResizeProposal = {
  key: string;
  axis: 'x' | 'y';
  dimension?: DrawingDimensionCandidate;
  guide?: DrawingAlignmentGuide;
};

function verifyResizeFeedback(input: {
  selected: readonly AcceptedResizeProposal[];
  proposals: readonly AcceptedResizeProposal[];
  source: DrawingDimensionGeometry | null;
  dimensions: DrawingDimensionGeometry[];
  point: Point | undefined;
}) {
  const feedback = emptyFeedback();
  for (const proposal of input.selected) {
    const relation =
      proposal.dimension && input.source
        ? verifyDrawingDimensionCandidate({
            candidate: proposal.dimension,
            source: input.source,
            targets: input.dimensions,
          })
        : null;
    const reached = proposal.dimension
      ? relation !== null
      : proposal.guide &&
        input.point &&
        Math.abs(input.point[proposal.axis] - proposal.guide.coordinate) < 1e-6;
    if (!reached) return null;
    feedback.acceptedByAxis[proposal.axis] = proposal.key;
    if (relation) feedback.relations.push(relation);
  }
  const point = input.point;
  if (!point) return feedback;
  for (const proposal of input.proposals)
    if (proposal.guide && Math.abs(point[proposal.axis] - proposal.guide.coordinate) < 1e-6)
      feedback.guides.push({
        ...proposal.guide,
        points: [point, ...proposal.guide.points.slice(1)],
        matches:
          proposal.guide.matches?.map((match) => ({
            ...match,
            source: { kind: 'point', point },
          })) ?? [],
      });
  return feedback;
}

function applyNativeResizeProposals(
  context: NativeResizeContext,
  proposals: ResizeProposal[],
  selected: ResizeProposal[]
) {
  const { target, event, uniform, transform } = context;
  const raw = { left: target.left, top: target.top, scaleX: target.scaleX, scaleY: target.scaleY };
  let scaleX = raw.scaleX,
    scaleY = raw.scaleY;
  for (const proposal of selected) {
    if (proposal.localAxis === 'x' || uniform) scaleX = proposal.scaleX;
    if (proposal.localAxis === 'y' || uniform) scaleY = proposal.scaleY;
  }
  controlsUtils.wrapWithFixedAnchor((_event, { target }) => {
    target.set({ scaleX, scaleY });
    return true;
  })(event.e, transform, event.pointer?.x ?? 0, event.pointer?.y ?? 0);
  target.setCoords();
  const scalesAccepted =
    Math.abs(target.scaleX - scaleX) <= 1e-6 && Math.abs(target.scaleY - scaleY) <= 1e-6;
  const feedback = scalesAccepted
    ? verifyResizeFeedback({
        selected,
        proposals,
        source: dimensionGeometry(target, context.sourceId),
        dimensions: context.dimensions,
        point: resizePointMap(target)[transform.corner],
      })
    : null;
  if (feedback) return feedback;
  target.set(raw);
  target.setCoords();
  return emptyFeedback();
}

/** Apply one feasible native box correction to the already constrained Fabric proposal. */
export function applyEditorBoxResizeSnap(
  input: ResizeInput & { event: EditorMagnetTransformEvent }
): DrawingSnapFeedback | null {
  const context = nativeResizeContext(input);
  if (!context) return null;
  const proposals = resizeProposals(context);
  const selected = selectNativeResizeProposals(context, proposals);
  return selected.length
    ? applyNativeResizeProposals(context, proposals, selected)
    : emptyFeedback();
}

type ResizeProposal = {
  key: string;
  delta: number;
  center: boolean;
  axis: 'x' | 'y';
  localAxis: 'x' | 'y';
  scaleX: number;
  scaleY: number;
  dimension?: DrawingDimensionCandidate;
  coordinate?: number;
  guide?: DrawingAlignmentGuide;
};

function isDimensionBox(object: FabricObject): boolean {
  if (
    !object.sniptaleType ||
    ['text', 'arrow'].includes(object.sniptaleType) ||
    object.controls['start'] ||
    object.controls['end'] ||
    object.flipX ||
    object.flipY ||
    object.scaleX <= 0 ||
    object.scaleY <= 0 ||
    object.skewX ||
    object.skewY
  )
    return false;
  if (!['tl', 'tr', 'br', 'bl', 'mt', 'mr', 'mb', 'ml'].every((key) => object.controls[key]))
    return false;
  const [a, b, c, d] = object.calcTransformMatrix();
  return (Math.abs(b) < 1e-8 && Math.abs(c) < 1e-8) || (Math.abs(a) < 1e-8 && Math.abs(d) < 1e-8);
}

function dimensionGeometry(object: FabricObject, id: string): DrawingDimensionGeometry | null {
  if (!isDimensionBox(object)) return null;
  const rect = object.getBoundingRect();
  if (
    ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  return {
    id,
    width: {
      value: rect.width,
      from: { x: rect.left, y: rect.top },
      to: { x: rect.left + rect.width, y: rect.top },
    },
    height: {
      value: rect.height,
      from: { x: rect.left, y: rect.top },
      to: { x: rect.left, y: rect.top + rect.height },
    },
  };
}

type NativeAxisGeometry = {
  axis: 'x' | 'y';
  localAxis: 'x' | 'y';
  dimension: 'width' | 'height';
  value: number;
  lever: number;
  scale: number;
  constant: number;
  derivative: number;
};
type SizeCandidate = {
  key: string;
  value: number;
  dimension?: DrawingDimensionCandidate;
  guide?: DrawingAlignmentGuide;
  coordinate?: number;
};

function nativeAxisGeometry(
  context: NativeResizeContext,
  axis: 'x' | 'y'
): NativeAxisGeometry | null {
  const { target, source, point, fixed, transform } = context;
  const matrix = target.calcTransformMatrix();
  const horizontalX = Math.abs(matrix[1]) < 1e-8;
  const localAxis = (axis === 'x') === horizontalX ? 'x' : 'y';
  const locked = localAxis === 'x' ? target.lockScalingX : target.lockScalingY;
  const cornerChangesAxis = (localAxis === 'x' ? /[lr]/ : /[tb]/).test(transform.corner);
  if (locked || !cornerChangesAxis) return null;
  const dimension = axis === 'x' ? 'width' : 'height';
  const measurement = source[dimension];
  if (!measurement) return null;
  const lever = (point[axis] - fixed[axis]) / measurement.value;
  if (Math.abs(lever) < 1e-8) return null;
  const scale = localAxis === 'x' ? target.scaleX : target.scaleY;
  const parentScale =
    (localAxis === 'x' ? Math.hypot(matrix[0], matrix[1]) : Math.hypot(matrix[2], matrix[3])) /
    scale;
  const nativeSize = localAxis === 'x' ? target.width : target.height;
  return {
    axis,
    localAxis,
    dimension,
    value: measurement.value,
    lever,
    scale,
    constant: target.strokeUniform ? target.strokeWidth * parentScale : 0,
    derivative: (nativeSize + (target.strokeUniform ? 0 : target.strokeWidth)) * parentScale,
  };
}

function nativeSizeCandidates(
  geometry: NativeAxisGeometry,
  sizes: readonly DrawingDimensionCandidate[],
  points: ReturnType<typeof resolveEditorMoveSnap>
): SizeCandidate[] {
  const candidates: SizeCandidate[] = sizes
    .filter((candidate) => candidate.dimension === geometry.dimension)
    .map((candidate) => ({ key: candidate.key, value: candidate.value, dimension: candidate }));
  const guide = points.guides.find((guide) => guide.axis === geometry.axis);
  const key = points.acceptedByAxis[geometry.axis];
  if (guide && key)
    candidates.push({
      key,
      value: geometry.value + points.delta[geometry.axis] / geometry.lever,
      guide,
      coordinate: guide.coordinate,
    });
  return candidates;
}

function nativeHandleDistance(
  context: NativeResizeContext,
  geometry: NativeAxisGeometry,
  value: number,
  factor: number
) {
  const distance = (value - geometry.value) * geometry.lever;
  if (!context.uniform) return distance;
  const other = nativeAxisGeometry(context, geometry.axis === 'x' ? 'y' : 'x');
  if (!other) return Infinity;
  const otherDelta =
    ((other.value - other.constant) * factor + other.constant - other.value) * other.lever;
  return Math.sign(distance || otherDelta) * Math.hypot(distance, otherDelta);
}

function projectNativeSizeCandidate(
  context: NativeResizeContext,
  geometry: NativeAxisGeometry,
  candidate: SizeCandidate
): ResizeProposal | null {
  const { target, uniform } = context;
  const factor = (candidate.value - geometry.constant) / geometry.derivative / geometry.scale;
  const scaleX = geometry.localAxis === 'x' || uniform ? target.scaleX * factor : target.scaleX;
  const scaleY = geometry.localAxis === 'y' || uniform ? target.scaleY * factor : target.scaleY;
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    scaleX < target.minScaleLimit ||
    scaleY < target.minScaleLimit
  )
    return null;
  const delta = nativeHandleDistance(context, geometry, candidate.value, factor);
  if (Math.abs(delta) > context.threshold) return null;
  return {
    ...candidate,
    axis: geometry.axis,
    localAxis: geometry.localAxis,
    scaleX,
    scaleY,
    delta,
    center: false,
  };
}

function resizeProposals(context: NativeResizeContext): ResizeProposal[] {
  const { target, source, point } = context;
  if (context.uniform && (target.lockScalingX || target.lockScalingY)) return [];
  const sizes = collectDrawingDimensionCandidates({ source, targets: context.dimensions });
  const points = resolveEditorMoveSnap({
    sourceId: source.id,
    source: [{ kind: 'point', point }],
    bounds: { x: point.x, y: point.y, width: 0, height: 0 },
    targets: context.descriptions,
    previous: context.previous,
    threshold: context.threshold,
  });
  return (['x', 'y'] as const).flatMap((axis) => {
    const geometry = nativeAxisGeometry(context, axis);
    if (!geometry) return [];
    return nativeSizeCandidates(geometry, sizes, points).flatMap((candidate) => {
      const proposal = projectNativeSizeCandidate(context, geometry, candidate);
      return proposal ? [proposal] : [];
    });
  });
}

type ResizeRect = { x: number; y: number; width: number; height: number };
type RectResizeInput = ResizeInput & {
  direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  minimumSize: number;
  rect: ResizeRect;
};
type RectResizeProposal = {
  key: string;
  delta: number;
  center: boolean;
  axis: 'x' | 'y';
  value: number;
  dimension?: DrawingDimensionCandidate;
  guide?: DrawingAlignmentGuide;
};

function rectDimensions(rect: ResizeRect, id: string): DrawingDimensionGeometry {
  return {
    id,
    width: {
      value: rect.width,
      from: { x: rect.x, y: rect.y },
      to: { x: rect.x + rect.width, y: rect.y },
    },
    height: {
      value: rect.height,
      from: { x: rect.x, y: rect.y },
      to: { x: rect.x, y: rect.y + rect.height },
    },
  };
}

function rectHandle(rect: ResizeRect, direction: RectResizeInput['direction']): Point {
  return new Point(
    direction.includes('w')
      ? rect.x
      : direction.includes('e')
        ? rect.x + rect.width
        : rect.x + rect.width / 2,
    direction.includes('n')
      ? rect.y
      : direction.includes('s')
        ? rect.y + rect.height
        : rect.y + rect.height / 2
  );
}

function rectResizeProposals(
  input: RectResizeInput,
  source: DrawingDimensionGeometry,
  dimensions: DrawingDimensionGeometry[]
): RectResizeProposal[] {
  const point = rectHandle(input.rect, input.direction);
  const points = resolveEditorMoveSnap({
    sourceId: source.id,
    source: [{ kind: 'point', point }],
    bounds: { x: point.x, y: point.y, width: 0, height: 0 },
    targets: input.targets.map(({ description }) => description),
    threshold: input.threshold,
    previous: input.previous,
  });
  const proposals: RectResizeProposal[] = [];
  const sizes = collectDrawingDimensionCandidates({ source, targets: dimensions });
  for (const axis of ['x', 'y'] as const) {
    if (!(axis === 'x' ? /[we]/ : /[ns]/).test(input.direction)) continue;
    const dimension = axis === 'x' ? 'width' : 'height';
    const direction = input.direction.includes(axis === 'x' ? 'w' : 'n') ? -1 : 1;
    for (const candidate of sizes.filter((candidate) => candidate.dimension === dimension)) {
      const delta = (candidate.value - input.rect[dimension]) * direction;
      if (candidate.value >= input.minimumSize && Math.abs(delta) <= input.threshold)
        proposals.push({
          key: candidate.key,
          delta,
          center: false,
          axis,
          value: candidate.value,
          dimension: candidate,
        });
    }
    const guide = points.guides.find((guide) => guide.axis === axis);
    const key = points.acceptedByAxis[axis];
    const value = input.rect[dimension] + points.delta[axis] * direction;
    if (guide && key && value >= input.minimumSize)
      proposals.push({ key, delta: points.delta[axis], center: false, axis, value, guide });
  }
  return proposals;
}

/** Resolve an external rectangular resize once, with its opposite edges and minimum size intact. */
export function resolveEditorRectResizeSnap(input: RectResizeInput): {
  rect: ResizeRect;
  feedback: DrawingSnapFeedback;
} {
  const baseline = clampSnappedResizeRect(input, input.rect);
  const source = rectDimensions(input.rect, input.sourceId);
  const dimensions = targetDimensions(input.targets);
  const proposals = rectResizeProposals(input, source, dimensions);
  const selected: RectResizeProposal[] = [];
  const proposed = { ...input.rect };
  for (const axis of ['x', 'y'] as const) {
    const best = chooseEditorSnapCandidate(
      proposals.filter((proposal) => proposal.axis === axis),
      input.previous.acceptedByAxis[axis],
      input.threshold
    );
    if (!best) continue;
    selected.push(best);
    if (axis === 'x') {
      proposed.width = best.value;
      if (input.direction.includes('w')) proposed.x = input.rect.x + input.rect.width - best.value;
    } else {
      proposed.height = best.value;
      if (input.direction.includes('n')) proposed.y = input.rect.y + input.rect.height - best.value;
    }
  }
  const rect = clampSnappedResizeRect(input, proposed);
  const final = rectDimensions(rect, input.sourceId);
  const point = rectHandle(rect, input.direction);
  const feedback = verifyResizeFeedback({ selected, proposals, source: final, dimensions, point });
  if (!feedback) return { rect: baseline, feedback: emptyFeedback() };
  return { rect, feedback };
}

function clampSnappedResizeRect(
  input: {
    direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
    minimumSize: number;
    rect: { x: number; y: number; width: number; height: number };
  },
  snapped: { x: number; y: number; width: number; height: number }
) {
  const fixedRight = input.rect.x + input.rect.width;
  const fixedBottom = input.rect.y + input.rect.height;
  const snappedRight = snapped.x + snapped.width;
  const snappedBottom = snapped.y + snapped.height;
  const x = input.direction.includes('w')
    ? Math.min(snapped.x, fixedRight - input.minimumSize)
    : input.rect.x;
  const y = input.direction.includes('n')
    ? Math.min(snapped.y, fixedBottom - input.minimumSize)
    : input.rect.y;
  const right = input.direction.includes('e')
    ? Math.max(snappedRight, input.rect.x + input.minimumSize)
    : fixedRight;
  const bottom = input.direction.includes('s')
    ? Math.max(snappedBottom, input.rect.y + input.minimumSize)
    : fixedBottom;
  return { x, y, width: right - x, height: bottom - y };
}
