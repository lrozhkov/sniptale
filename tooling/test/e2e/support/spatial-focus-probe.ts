import {
  projectQuickEditPoint,
  type QuickEditHomography,
} from '../../../../apps/extension/src/features/video/composition/motion/spatial-geometry';
import {
  unprojectReviewSpatialPoint,
  type resolveReviewSpatialFocusGeometry,
} from '../../../../apps/extension/src/gallery/video-review/spatial-control-geometry';
import type { QuickEditRect } from '../../../../apps/extension/src/features/video/review/advanced/scene';
import type { CameraDepthOfField as QuickEditDepthOfField } from '../../../../apps/extension/src/features/video/project/motion/spatial';

function errorAt(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  point: { x: number; y: number },
  width: number
) {
  let sum = 0,
    count = 0;
  for (let y = Math.round(point.y) - 1; y <= Math.round(point.y) + 1; y++)
    for (let x = Math.round(point.x) - 1; x <= Math.round(point.x) + 1; x++) {
      const index = (y * width + x) * 4;
      if (a[index + 3]! < 254 || b[index + 3]! < 254)
        throw new Error('Focus sample left opaque plane');
      sum += Math.abs(a[index]! - b[index]!);
      count++;
    }
  return sum / count;
}

/** Measure real opaque contours against independently saturated sharp/blurred references. */
export function measureSpatialFocusPixels(args: {
  geometry: NonNullable<ReturnType<typeof resolveReviewSpatialFocusGeometry>>;
  projection: QuickEditHomography;
  base: QuickEditRect;
  focus: QuickEditDepthOfField;
  width: number;
  height: number;
  offPlane?: boolean;
  actual: Uint8ClampedArray;
  sharp: Uint8ClampedArray;
  blurred: Uint8ClampedArray;
}) {
  const { geometry, projection, base, focus, width, height, offPlane, actual, sharp, blurred } =
    args;
  const samples: {
    kind: string;
    point: { x: number; y: number };
    error: number;
    referenceSeparation: number;
  }[] = [];
  if (geometry.flat || offPlane) {
    // Whole authored plane remains sharp; no fabricated circle or edge.
    let maximum = 0,
      count = 0;
    for (let i = 0; i < actual.length; i += 4) {
      if (sharp[i + 3]! < 254) continue;
      maximum = Math.max(maximum, Math.abs(actual[i]! - sharp[i]!));
      count++;
    }
    return {
      flat: geometry.flat,
      sharpPaths: geometry.sharp.length,
      softPaths: geometry.soft.length,
      maximum,
      count,
      samples,
    };
  } else {
    const center = { x: base.x + base.width * focus.x, y: base.y + base.height * focus.y };
    for (const kind of ['sharp', 'soft'] as const) {
      const points: { x: number; y: number }[] = geometry[kind].flatMap(
        (path: { x: number; y: number }[]) =>
          path.length === 2
            ? Array.from({ length: 17 }, (_, index) => ({
                x: path[0]!.x + ((path[1]!.x - path[0]!.x) * index) / 16,
                y: path[0]!.y + ((path[1]!.y - path[0]!.y) * index) / 16,
              }))
            : path
      );
      // Sample every contour segment, including both sides of a depth band.
      const stride = Math.max(1, Math.floor(points.length / 12));
      for (let i = 0; i < points.length; i += stride) {
        const point = points[i]!;
        const unprojected = unprojectReviewSpatialPoint(projection, point);
        if (!unprojected) throw new Error('Contour inverse failed');
        for (const [label, factor] of [
          [kind, 1],
          [kind === 'sharp' ? 'inside' : 'beyond', kind === 'sharp' ? 0.65 : 1.15],
        ] as const) {
          const source = {
            x: center.x + (unprojected.x - center.x) * factor,
            y: center.y + (unprojected.y - center.y) * factor,
          };
          if (
            source.x < base.x + 48 ||
            source.x > base.x + base.width - 48 ||
            source.y < base.y + 64 ||
            source.y > base.y + base.height - 48
          )
            continue;
          const projected = projectQuickEditPoint(projection, source);
          if (
            !projected ||
            projected.x < 8 ||
            projected.y < 8 ||
            projected.x > width - 8 ||
            projected.y > height - 8
          )
            continue;
          samples.push({
            kind: label,
            point: projected,
            error: errorAt(actual, kind === 'sharp' ? sharp : blurred, projected, width),
            referenceSeparation: errorAt(sharp, blurred, projected, width),
          });
        }
      }
    }
    return {
      flat: false,
      sharpPaths: geometry.sharp.length,
      softPaths: geometry.soft.length,
      maximum: 0,
      count: 0,
      samples,
    };
  }
}
