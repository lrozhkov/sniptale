import type {
  TourImageSlide,
  TourPoint,
  TourRect,
} from '@sniptale/runtime-contracts/scenario/types/tour';

/** Proven old normalized bitmap → new normalized bitmap affine transform (x'=ax+cy+e, y'=bx+dy+f). */
export type TourImageTransform = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
];

function validTransform(matrix: TourImageTransform): boolean {
  const [a, b, c, d] = matrix;
  return (
    matrix.every(Number.isFinite) &&
    Math.abs(a * d - b * c) > 1e-12 &&
    ((b === 0 && c === 0) || (a === 0 && d === 0))
  );
}
function mapPoint(point: TourPoint, matrix: TourImageTransform): TourPoint | null {
  const [a, b, c, d, e, f] = matrix;
  const x = a * point.x + c * point.y + e;
  const y = b * point.x + d * point.y + f;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
function mapRect(rect: TourRect, matrix: TourImageTransform): TourRect | null {
  const corners = [
    mapPoint(rect, matrix),
    mapPoint({ x: rect.x + rect.width, y: rect.y }, matrix),
    mapPoint({ x: rect.x, y: rect.y + rect.height }, matrix),
    mapPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, matrix),
  ];
  if (corners.some((point) => point === null)) return null;
  const points = corners.filter((point) => point !== null);
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}
function hasPositions(slide: TourImageSlide): boolean {
  return (
    slide.hotspots.length > 0 ||
    slide.masks.length > 0 ||
    slide.annotations.some((annotation) => annotation.anchor !== null) ||
    slide.camera.mode === 'manual'
  );
}

/** All positions map together, or remain authored values with an explicit durable review requirement. */
export function remapTourImageGeometry(
  slide: TourImageSlide,
  transform: TourImageTransform | null
): {
  status: 'mapped' | 'requires-target-review';
  slide: TourImageSlide;
} {
  const copy = structuredClone(slide);
  const review = () => ({
    status: 'requires-target-review' as const,
    slide: { ...structuredClone(slide), requiresTargetReview: true },
  });
  if (slide.requiresTargetReview) return review();
  if (!hasPositions(slide)) return { status: 'mapped', slide: copy };
  if (!transform || !validTransform(transform)) return review();
  const identity = transform.every((value, index) => value === [1, 0, 0, 1, 0, 0][index]);
  if (slide.camera.mode === 'manual' && !identity) return review();
  for (const hotspot of copy.hotspots) {
    const point = mapPoint(hotspot.point, transform);
    const rect = hotspot.targetRect ? mapRect(hotspot.targetRect, transform) : null;
    if (!point || (hotspot.targetRect && !rect)) return review();
    hotspot.point = point;
    hotspot.targetRect = rect;
  }
  for (const annotation of copy.annotations) {
    if (!annotation.anchor) continue;
    const point = mapPoint(annotation.anchor, transform);
    if (!point) return review();
    annotation.anchor = point;
  }
  for (const mask of copy.masks) {
    const rect = mapRect(mask.rect, transform);
    if (!rect) return review();
    mask.rect = rect;
  }
  return { status: 'mapped', slide: copy };
}
