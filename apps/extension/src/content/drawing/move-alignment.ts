import {
  getDrawingObjectSelectionBounds,
  getDrawingSelectionBounds,
  type DrawingBounds,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';

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
  domBounds: readonly DrawingBounds[]
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
    ...shapes.map(({ bounds: target }) => ({ bounds: target })),
    ...domBounds.map((target) => ({ bounds: target })),
  ].filter((target) => distance(bounds, target.bounds) <= NEIGHBOR_DISTANCE);
}

function matchAxis(bounds: DrawingBounds, targets: Target[], axis: 'x' | 'y'): Match | null {
  const size = axis === 'x' ? 'width' : 'height';
  const anchors = [bounds[axis], bounds[axis] + bounds[size] / 2, bounds[axis] + bounds[size]];
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
  return { delta, guides };
}
