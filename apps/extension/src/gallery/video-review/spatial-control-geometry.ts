import type { QuickEditRect } from '../../features/video/review/advanced/scene';
import {
  parseCameraDepth as parseQuickEditDepth,
  type CameraDepthOfField as QuickEditDepthOfField,
  type SpatialQuaternion as SpatialQuaternion,
} from '../../features/video/project/motion/spatial';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
  quickEditRotationMatrix,
  type QuickEditHomography,
} from '../../features/video/composition/motion/spatial-geometry';

export interface ReviewSpatialControlPoint {
  x: number;
  y: number;
}

/** Capture these canonical plane/output values once per gesture; do not mutate the snapshot. */
export interface ReviewSpatialControlGeometryInput {
  readonly plane: QuickEditRect;
  readonly projection: QuickEditHomography;
  readonly rotation: SpatialQuaternion;
  readonly focus: QuickEditDepthOfField;
}

type ReviewSpatialFocusHandleKind = 'width' | 'softness';
type ReviewSpatialFocusSide = -1 | 1;
interface ReviewSpatialFocusGeometry {
  center: ReviewSpatialControlPoint;
  sharp: ReviewSpatialControlPoint[][];
  soft: ReviewSpatialControlPoint[][];
  flat: boolean;
  handles: {
    kind: ReviewSpatialFocusHandleKind;
    side: ReviewSpatialFocusSide;
    point: ReviewSpatialControlPoint;
  }[];
}

const EPSILON = 1e-7;
const FLAT_AXIS = 1e-6;
const TAU = 2 * Math.PI;
const finitePoint = (p: ReviewSpatialControlPoint) => Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
// Projection round-off must not turn an untouched handle into a history edit.
const stable = (value: number, authored: number) =>
  Math.abs(value - authored) < 1e-10 ? authored : value;

function project(matrix: QuickEditHomography, point: ReviewSpatialControlPoint) {
  if (!matrix.every(Number.isFinite) || !finitePoint(point)) return null;
  const result = projectQuickEditPoint(matrix, point);
  return result && finitePoint(result) ? result : null;
}

/** Strict output-to-plane mapping: never substitutes client or unprojected coordinates. */
export function unprojectReviewSpatialPoint(
  projection: QuickEditHomography,
  point: ReviewSpatialControlPoint
): ReviewSpatialControlPoint | null {
  if (!projection.every(Number.isFinite) || !finitePoint(point)) return null;
  const inverse = invertQuickEditProjection(projection);
  return inverse ? project(inverse, point) : null;
}

function inside(rect: QuickEditRect, p: ReviewSpatialControlPoint) {
  return (
    p.x >= rect.x - EPSILON &&
    p.x <= rect.x + rect.width + EPSILON &&
    p.y >= rect.y - EPSILON &&
    p.y <= rect.y + rect.height + EPSILON
  );
}

function resolveMetric(input: ReviewSpatialControlGeometryInput) {
  const { plane, projection, rotation, focus } = input;
  if (
    !Object.values(plane).every(Number.isFinite) ||
    plane.width <= 0 ||
    plane.height <= 0 ||
    !rotation.every(Number.isFinite) ||
    Math.abs(Math.hypot(...rotation) - 1) > 1e-6 ||
    !parseQuickEditDepth(focus) ||
    !projection.every(Number.isFinite)
  )
    return null;
  const corners = [
    { x: plane.x, y: plane.y },
    { x: plane.x + plane.width, y: plane.y },
    { x: plane.x, y: plane.y + plane.height },
    { x: plane.x + plane.width, y: plane.y + plane.height },
  ];
  if (
    corners.some((p) => !project(projection, p)) ||
    !unprojectReviewSpatialPoint(projection, project(projection, corners[0]!)!)
  )
    return null;
  const center = { x: plane.x + focus.x * plane.width, y: plane.y + focus.y * plane.height };
  const matrix = quickEditRotationMatrix(rotation);
  const axis = { x: matrix[6]!, y: matrix[7]! };
  const diagonal = Math.hypot(plane.width, plane.height);
  if (!finitePoint(center) || !Number.isFinite(diagonal)) return null;
  return {
    center,
    axis,
    diagonal,
    flat: focus.mode === 'depth' && Math.hypot(axis.x, axis.y) < FLAT_AXIS,
  };
}

/** Split circles at exact rectangle intersections, then sample only their visible arcs. */
function circleContours(rect: QuickEditRect, center: ReviewSpatialControlPoint, radius: number) {
  if (radius === 0) return [[center]];
  const angles = [0, TAU];
  const add = (angle: number) => angles.push((angle + TAU) % TAU);
  for (const x of [rect.x, rect.x + rect.width]) {
    const value = (x - center.x) / radius;
    if (Math.abs(value) <= 1) {
      const angle = Math.acos(value);
      add(angle);
      add(-angle);
    }
  }
  for (const y of [rect.y, rect.y + rect.height]) {
    const value = (y - center.y) / radius;
    if (Math.abs(value) <= 1) {
      const angle = Math.asin(value);
      add(angle);
      add(Math.PI - angle);
    }
  }
  angles.sort((a, b) => a - b);
  const at = (angle: number) => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  });
  const paths: ReviewSpatialControlPoint[][] = [];
  for (let i = 1; i < angles.length; i++) {
    const from = angles[i - 1]!,
      to = angles[i]!;
    if (to - from < 1e-10 || !inside(rect, at((from + to) / 2))) continue;
    const steps = Math.max(1, Math.ceil((to - from) / (TAU / 128)));
    paths.push(
      Array.from({ length: steps + 1 }, (_, step) => at(from + ((to - from) * step) / steps))
    );
  }
  return paths;
}

function depthContour(
  rect: QuickEditRect,
  center: ReviewSpatialControlPoint,
  axis: ReviewSpatialControlPoint,
  offset: number
) {
  const points: ReviewSpatialControlPoint[] = [];
  const add = (p: ReviewSpatialControlPoint) => {
    if (
      finitePoint(p) &&
      inside(rect, p) &&
      !points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < EPSILON)
    )
      points.push(p);
  };
  if (Math.abs(axis.y) > 1e-12) {
    for (const x of [rect.x, rect.x + rect.width])
      add({ x, y: center.y + (offset - axis.x * (x - center.x)) / axis.y });
  }
  if (Math.abs(axis.x) > 1e-12) {
    for (const y of [rect.y, rect.y + rect.height])
      add({ x: center.x + (offset - axis.y * (y - center.y)) / axis.x, y });
  }
  return points.length >= 2 ? [points[0]!, points[1]!] : [];
}

/** Curves are clipped to the decorated plane, in output coordinates; the view clips output separately. */
export function resolveReviewSpatialFocusGeometry(
  input: ReviewSpatialControlGeometryInput
): ReviewSpatialFocusGeometry | null {
  const metric = resolveMetric(input);
  if (!metric) return null;
  const center = project(input.projection, metric.center);
  if (!center) return null;
  const result: ReviewSpatialFocusGeometry = {
    center,
    sharp: [],
    soft: [],
    flat: metric.flat,
    handles: [],
  };
  if (metric.flat) return result;
  for (const kind of ['width', 'softness'] as const) {
    const threshold =
      input.focus.width / 2 + (kind === 'softness' ? Math.max(0.005, input.focus.softness) : 0);
    const radius = metric.diagonal * threshold;
    const contours =
      input.focus.mode === 'area'
        ? circleContours(input.plane, metric.center, radius)
        : ([-1, 1] as const)
            .map((side) => depthContour(input.plane, metric.center, metric.axis, radius * side))
            .filter((path) => path.length > 0);
    const projected: ReviewSpatialControlPoint[][] = [];
    for (const path of contours) {
      const points: ReviewSpatialControlPoint[] = [];
      for (const point of path) {
        const mapped = project(input.projection, point);
        if (!mapped) return null;
        points.push(mapped);
      }
      projected.push(points);
    }
    if (kind === 'width') result.sharp = projected;
    else result.soft = projected;
    for (const side of [-1, 1] as const) {
      // Choose an actual contour point, never clamp a handle away from its metric threshold.
      const candidates = contours
        .flat()
        .filter((point) =>
          input.focus.mode === 'area'
            ? side * (point.x - metric.center.x) >= -EPSILON
            : side *
                ((point.x - metric.center.x) * metric.axis.x +
                  (point.y - metric.center.y) * metric.axis.y) >=
              -EPSILON
        );
      const first = candidates[0],
        last = candidates[candidates.length - 1];
      const point =
        input.focus.mode === 'depth' && first && last
          ? { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }
          : candidates[Math.floor(candidates.length / 2)];
      if (point) {
        const mapped = project(input.projection, point);
        if (mapped) result.handles.push({ kind, side, point: mapped });
      }
    }
  }
  return result;
}

/** Point is canonical output-space; side is frozen at pointerdown for depth width/softness. */
export function reviewSpatialFocusPatch(
  input: ReviewSpatialControlGeometryInput,
  kind: 'center' | ReviewSpatialFocusHandleKind,
  point: ReviewSpatialControlPoint,
  side?: ReviewSpatialFocusSide
): Partial<QuickEditDepthOfField> | null {
  const metric = resolveMetric(input);
  const planePoint = metric && unprojectReviewSpatialPoint(input.projection, point);
  if (!metric || !planePoint) return null;
  if (kind === 'center')
    return {
      x: stable(clamp((planePoint.x - input.plane.x) / input.plane.width, 0, 1), input.focus.x),
      y: stable(clamp((planePoint.y - input.plane.y) / input.plane.height, 0, 1), input.focus.y),
    };
  if (metric.flat) return null;
  const dx = (planePoint.x - metric.center.x) / metric.diagonal;
  const dy = (planePoint.y - metric.center.y) / metric.diagonal;
  const signed = dx * metric.axis.x + dy * metric.axis.y;
  if (input.focus.mode === 'depth' && side !== undefined && signed * side < -EPSILON) return null;
  const distance = input.focus.mode === 'area' ? Math.hypot(dx, dy) : Math.abs(signed);
  if (!Number.isFinite(distance)) return null;
  return kind === 'width'
    ? { width: stable(clamp(distance * 2, 0, 1), input.focus.width) }
    : { softness: stable(clamp(distance - input.focus.width / 2, 0.01, 1), input.focus.softness) };
}
