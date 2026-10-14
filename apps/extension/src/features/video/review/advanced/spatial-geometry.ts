import type { QuickEditSpatialFrame, SpatialQuaternion } from './spatial';
import type { QuickEditRect } from './types';

export type QuickEditHomography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Row-major rotation matrix, shared by geometry and the depth shader. */
export function quickEditRotationMatrix([x, y, z, w]: SpatialQuaternion) {
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

/** Base window to zoomed, rotated window. Bounded inverse focal length keeps every corner in front. */
export function quickEditPlaneProjection(
  base: QuickEditRect,
  target: QuickEditRect,
  spatial: QuickEditSpatialFrame
): QuickEditHomography {
  const r = quickEditRotationMatrix(spatial.rotation);
  const scale = target.width / base.width;
  const cx = base.x + base.width / 2,
    cy = base.y + base.height / 2;
  const tx = target.x + target.width / 2,
    ty = target.y + target.height / 2;
  const focal = (0.7 * spatial.perspective) / Math.hypot(base.width, base.height);
  const g = -focal * r[6]!,
    h = -focal * r[7]!,
    i = 1 - g * cx - h * cy;
  return [
    scale * r[0]! + tx * g,
    scale * r[1]! + tx * h,
    tx * i - scale * (r[0]! * cx + r[1]! * cy),
    scale * r[3]! + ty * g,
    scale * r[4]! + ty * h,
    ty * i - scale * (r[3]! * cx + r[4]! * cy),
    g,
    h,
    i,
  ];
}

/** Inverse pointer projection; null denotes a degenerate or behind-camera point. */
export function projectQuickEditPoint(
  matrix: QuickEditHomography,
  point: { x: number; y: number }
) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const w = g * point.x + h * point.y + i;
  if (!Number.isFinite(w) || w <= 1e-8) return null;
  return { x: (a * point.x + b * point.y + c) / w, y: (d * point.x + e * point.y + f) / w };
}

/** Inverts the planar projection without DOMMatrix or runtime dependencies. */
export function invertQuickEditProjection(m: QuickEditHomography): QuickEditHomography | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-9) return null;
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

/** CSS uses the same projective map for interactive sharp content overlays. */
export function quickEditProjectionCss(m: QuickEditHomography) {
  const [a, b, c, d, e, f, g, h, i] = m;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,${i})`;
}
