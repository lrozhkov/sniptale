import {
  getDrawingObjectBounds,
  transformDrawingObjectPoint,
  transformDrawingObjectVector,
  untransformDrawingObjectVector,
  getDrawingObjectSelectionBounds,
  getDrawingSelectionBounds,
  type DrawingBounds,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import { resizeDrawingObject, type PointerDraft } from './interaction';

export interface DrawingAlignmentGuide {
  axis: 'x' | 'y';
  coordinate: number;
  from: number;
  to: number;
}

type Target = { bounds: DrawingBounds; centerOnly?: boolean; inset?: number };
type Match = { delta: number; coordinate: number; bounds: DrawingBounds; center: boolean };
const SNAP_DISTANCE = 6;
const NEIGHBOR_DISTANCE = 96;

export function isDrawingAlignmentObject(object: DrawingObject): boolean {
  return ['rectangle', 'ellipse', 'triangle', 'parallelogram', 'text'].includes(object.kind);
}

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
  domBounds: readonly DrawingBounds[],
  includeDistantShapes = false
): Target[] {
  const ids = new Set(moving.map((object) => object.id));
  const shapes = objects
    .filter(
      (object) => object.kind !== 'text' && isDrawingAlignmentObject(object) && !ids.has(object.id)
    )
    .map((object) => ({ object, bounds: getDrawingObjectSelectionBounds(object) }));
  if (moving.length === 1 && moving[0]?.kind === 'text') {
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const containing = shapes
      .filter(
        ({ bounds: target }) =>
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
      .map(({ bounds: target }) => ({ bounds: target })),
    ...domBounds
      .filter((target) => distance(bounds, target) <= NEIGHBOR_DISTANCE)
      .map((target) => ({ bounds: target })),
  ];
}

function matchAxis(
  bounds: DrawingBounds,
  targets: Target[],
  axis: 'x' | 'y',
  sourceAnchors?: readonly number[]
): Match | null {
  const size = axis === 'x' ? 'width' : 'height';
  const anchors = sourceAnchors ?? [
    bounds[axis],
    bounds[axis] + bounds[size] / 2,
    bounds[axis] + bounds[size],
  ];
  let best: Match | null = null;
  for (const target of targets) {
    const inset = Math.min(target.inset ?? 0, target.bounds[size] / 2);
    const values = [
      target.bounds[axis] + inset,
      target.bounds[axis] + target.bounds[size] / 2,
      target.bounds[axis] + target.bounds[size] - inset,
    ];
    for (const [sourceIndex, anchor] of anchors.entries()) {
      for (const [targetIndex, coordinate] of values.entries()) {
        if ((sourceIndex === 1) !== (targetIndex === 1)) continue;
        if (target.centerOnly && sourceIndex !== 1) continue;
        const delta = coordinate - anchor;
        if (Math.abs(delta) > SNAP_DISTANCE) continue;
        const center = sourceIndex === 1;
        if (
          !best ||
          Math.abs(delta) < Math.abs(best.delta) - 0.001 ||
          (Math.abs(Math.abs(delta) - Math.abs(best.delta)) < 0.001 && center && !best.center)
        ) {
          best = { delta, coordinate, bounds: target.bounds, center };
        }
      }
    }
  }
  return best;
}

/** Resolves disposable alignment feedback for an already translated selection. */
export function resolveDrawingMoveAlignment(args: {
  moving: readonly DrawingObject[];
  objects: readonly DrawingObject[];
  domBounds?: readonly DrawingBounds[];
}): { delta: DrawingPoint; guides: DrawingAlignmentGuide[] } {
  const bounds = getDrawingSelectionBounds(args.moving);
  if (!bounds || !args.moving.every(isDrawingAlignmentObject))
    return { delta: { x: 0, y: 0 }, guides: [] };
  const targets = getTargets(args.moving, bounds, args.objects, args.domBounds ?? []);
  const x = matchAxis(bounds, targets, 'x');
  const y = matchAxis(bounds, targets, 'y');
  const delta = { x: x?.delta ?? 0, y: y?.delta ?? 0 };
  return { delta, guides: getAlignmentGuides(bounds, x, y, delta) };
}

function getAlignmentGuides(
  bounds: DrawingBounds,
  x: Match | null,
  y: Match | null,
  delta: DrawingPoint = { x: 0, y: 0 }
): DrawingAlignmentGuide[] {
  const guides: DrawingAlignmentGuide[] = [];
  for (const axis of ['x', 'y'] as const) {
    const match = axis === 'x' ? x : y;
    if (!match) continue;
    const perpendicular = axis === 'x' ? 'y' : 'x';
    const size = axis === 'x' ? 'height' : 'width';
    guides.push({
      axis,
      coordinate: match.coordinate,
      from: Math.min(bounds[perpendicular] + delta[perpendicular], match.bounds[perpendicular]) - 8,
      to:
        Math.max(
          bounds[perpendicular] + delta[perpendicular] + bounds[size],
          match.bounds[perpendicular] + match.bounds[size]
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

/** Aligns the grabbed handle through the canonical resizer, without translating its fixed anchor. */
export function resolveDrawingResizeAlignment(args: {
  draft: ResizeDraft;
  point: DrawingPoint;
  modifiers: { ctrlKey: boolean; shiftKey: boolean };
  objects: readonly DrawingObject[];
  domBounds?: readonly DrawingBounds[];
}): { object: DrawingObject; guides: DrawingAlignmentGuide[] } {
  const { draft, point, modifiers } = args;
  const unchanged = { object: draft.object, guides: [] };
  if (
    !['rectangle', 'ellipse', 'triangle', 'parallelogram'].includes(draft.original.kind) ||
    draft.handle === 'start' ||
    draft.handle === 'end' ||
    (modifiers.ctrlKey && (draft.handle === 'n' || draft.handle === 's'))
  )
    return unchanged;
  const geometry = getDrawingResizeHandleGeometry(draft, point, modifiers.ctrlKey);
  const bounds = getDrawingObjectSelectionBounds(draft.object);
  const targets = getTargets([draft.object], bounds, args.objects, args.domBounds ?? [], true);
  let x = matchAxis(bounds, targets, 'x', [geometry.current.x]);
  let y = matchAxis(bounds, targets, 'y', [geometry.current.y]);
  let delta: DrawingPoint;
  if (geometry.x && geometry.y && !modifiers.shiftKey) {
    delta = { x: x?.delta ?? 0, y: y?.delta ?? 0 };
  } else {
    const original = getDrawingObjectBounds(draft.original);
    const vector = transformDrawingObjectVector(
      draft.original,
      geometry.x && geometry.y
        ? { x: geometry.x * original.width, y: geometry.y * original.height }
        : { x: geometry.x ? 1 : 0, y: geometry.y ? 1 : 0 }
    );
    const length = Math.hypot(vector.x, vector.y);
    if (length < 1e-6) return unchanged;
    const direction = { x: vector.x / length, y: vector.y / length };
    if (Math.abs(direction.x) <= 1e-6) x = null;
    if (Math.abs(direction.y) <= 1e-6) y = null;
    const corrections = [
      x && Math.abs(direction.x) > 1e-6 ? x.delta / direction.x : null,
      y && Math.abs(direction.y) > 1e-6 ? y.delta / direction.y : null,
    ]
      .filter((value): value is number => value !== null && Math.abs(value) <= SNAP_DISTANCE)
      .sort((a, b) => Math.abs(a) - Math.abs(b));
    const amount = corrections[0];
    if (amount === undefined) return unchanged;
    delta = { x: direction.x * amount, y: direction.y * amount };
  }
  if (!x && !y) return unchanged;
  const adjusted = {
    x: draft.start.x + geometry.current.x + delta.x - geometry.original.x,
    y: draft.start.y + geometry.current.y + delta.y - geometry.original.y,
  };
  const object = resizeDrawingObject(draft, adjusted, modifiers);
  const actual = getDrawingResizeHandleGeometry(
    { ...draft, object },
    adjusted,
    modifiers.ctrlKey
  ).current;
  const acceptedX = x && Math.abs(actual.x - x.coordinate) <= 1e-6 ? x : null;
  const acceptedY = y && Math.abs(actual.y - y.coordinate) <= 1e-6 ? y : null;
  if (!acceptedX && !acceptedY) return unchanged;
  return {
    object,
    guides: getAlignmentGuides(getDrawingObjectSelectionBounds(object), acceptedX, acceptedY),
  };
}
