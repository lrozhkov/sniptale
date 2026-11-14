import {
  assertRasterSize,
  assertSelectionMask,
  assertSourcePoint,
  type PixelBounds,
  type RasterSourceGeometry,
  type SelectionMask,
  type SourcePoint,
} from './contracts';
import {
  assertRasterPixelData,
  composeRasterRegion,
  paintRasterColorPixel,
  type RasterPixelData,
} from './pixels';
import { BezierLine } from './vendor/bezier-line';

/** Disposable stroke projection. Pixels contain the packed dirty source window. */
export interface RasterBrushPreview {
  readonly planes: RasterPixelData;
  readonly coverage: Uint8Array;
  /** Bounds of all changed pixels in this stroke, including earlier updates. */
  readonly strokeBounds: PixelBounds | null;
  /** Bounds of pixels changed since the preceding add or finish call. */
  readonly dirtyBounds: PixelBounds | null;
  readonly pixels: Uint8ClampedArray | null;
}

/** Source-pixel diameter and independent hardness. Accepted input planes remain immutable. */
type RasterBrushOptions = {
  readonly planes: RasterPixelData;
  readonly geometry: RasterSourceGeometry;
  readonly diameter: number;
  readonly hardness: number;
  readonly selection?: SelectionMask;
} & (
  | { readonly mode: 'erase' | 'restore' }
  | {
      readonly mode: 'paint';
      readonly color: readonly [number, number, number, number];
      readonly opacity: number;
    }
);

/** One synchronous gesture. Finish seals the final segment before its caller can commit. */
export interface RasterBrushStroke {
  add(point: SourcePoint): RasterBrushPreview;
  finish(point?: SourcePoint): RasterBrushPreview;
  cancel(): void;
}

function contains(bounds: PixelBounds, x: number, y: number): boolean {
  return (
    x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height
  );
}

function validateBrushOptions(options: RasterBrushOptions): number {
  const { planes, geometry, diameter, hardness, mode } = options;
  assertRasterPixelData(planes);
  const count = assertRasterSize(geometry);
  if (geometry.width !== planes.width || geometry.height !== planes.height)
    throw new RangeError('Brush geometry must match the source');
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > 32768)
    throw new RangeError('Brush diameter must be positive and bounded');
  if (!Number.isFinite(hardness) || hardness < 0 || hardness > 1)
    throw new RangeError('Brush hardness must be between zero and one');
  if (mode !== 'erase' && mode !== 'restore' && mode !== 'paint')
    throw new TypeError('Invalid brush mode');
  const paint = options.mode === 'paint' ? options.color : null;
  const opacity = options.mode === 'paint' ? options.opacity : 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new RangeError('Brush opacity must be between zero and one');
  if (
    paint &&
    (paint.length !== 4 ||
      paint.some((value) => !Number.isInteger(value) || value < 0 || value > 255))
  )
    throw new RangeError('Brush color must contain integer byte channels');
  const selection = options.selection ?? null;
  assertSelectionMask(selection, count);
  return count;
}

/** Adapted Klecks Bezier spacing/finalization with local soft coverage and visibility planes. */
export function createRasterBrushStroke(options: RasterBrushOptions): RasterBrushStroke {
  const count = validateBrushOptions(options);
  const { planes, geometry, diameter, hardness, mode } = options;
  const paint = options.mode === 'paint' ? options.color : null;
  const opacity = options.mode === 'paint' ? options.opacity : 1;
  const selection = options.selection ?? null;
  const coverage = new Uint8Array(count);
  const visibility = planes.visibility?.slice() ?? new Uint8Array(count).fill(255);
  const key = mode === 'restore' || mode === 'paint' ? (planes.key?.slice() ?? null) : planes.key;
  const color = mode === 'paint' ? planes.color.slice() : planes.color;
  const draft: RasterPixelData = { ...planes, color, visibility, key };
  const line = new BezierLine();
  const radius = diameter / 2;
  const spacing = Math.max(0.25, diameter * 0.1);
  let last: SourcePoint | null = null;
  let strokeBounds: PixelBounds | null = null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  let closed = false;

  function stamp(point: SourcePoint): void {
    if (opacity === 0 || paint?.[3] === 0) return;
    const [a, b, c, d, e, f] = geometry.sourceToScene;
    for (let y = Math.floor(point.y - radius - 0.5); y <= Math.ceil(point.y + radius + 0.5); y++) {
      for (
        let x = Math.floor(point.x - radius - 0.5);
        x <= Math.ceil(point.x + radius + 0.5);
        x++
      ) {
        const distance = Math.hypot(x + 0.5 - point.x, y + 0.5 - point.y);
        const edge = Math.min(1, Math.max(0, radius + 0.5 - distance));
        if (edge === 0) continue;
        const softness = radius * (1 - hardness);
        const t = softness > 0 ? Math.min(1, Math.max(0, (radius - distance) / softness)) : 1;
        const strength = Math.round(255 * edge * t * t * (3 - 2 * t));
        if (strength === 0) continue;
        if (geometry.sourceClip && !contains(geometry.sourceClip, x + 0.5, y + 0.5)) continue;
        if (
          geometry.sceneClip &&
          !contains(
            geometry.sceneClip,
            a * (x + 0.5) + c * (y + 0.5) + e,
            b * (x + 0.5) + d * (y + 0.5) + f
          )
        )
          continue;
        const px = geometry.periodic
          ? geometry.crop.x +
            ((((x - geometry.crop.x) % geometry.crop.width) + geometry.crop.width) %
              geometry.crop.width)
          : x;
        const py = geometry.periodic
          ? geometry.crop.y +
            ((((y - geometry.crop.y) % geometry.crop.height) + geometry.crop.height) %
              geometry.crop.height)
          : y;
        if (
          px < 0 ||
          py < 0 ||
          px >= planes.width ||
          py >= planes.height ||
          !contains(geometry.crop, px + 0.5, py + 0.5)
        )
          continue;
        const index = py * planes.width + px;
        if ((selection !== null && !selection[index]) || strength <= coverage[index]!) continue;
        // Each pixel derives from accepted planes and cumulative coverage, never from a prior preview.
        coverage[index] = strength;
        const fraction = strength / 255;
        if (paint) {
          paintRasterColorPixel(planes, index, color, paint, fraction * opacity);
          visibility[index] = 255;
          if (key) key[index * 4 + 3] = 0;
        } else {
          const old = planes.visibility?.[index] ?? 255;
          visibility[index] = Math.round(
            mode === 'restore' ? old + (255 - old) * fraction : old * (1 - fraction)
          );
          if (mode === 'restore' && key !== null && planes.key !== null)
            key[index * 4 + 3] = Math.round(planes.key[index * 4 + 3]! * (1 - fraction));
        }
        left = Math.min(left, px);
        top = Math.min(top, py);
        right = Math.max(right, px + 1);
        bottom = Math.max(bottom, py + 1);
      }
    }
  }

  function preview(): RasterBrushPreview {
    const changed = Number.isFinite(left)
      ? { x: left, y: top, width: right - left, height: bottom - top }
      : null;
    if (changed) {
      const x = Math.min(strokeBounds?.x ?? left, left),
        y = Math.min(strokeBounds?.y ?? top, top);
      const r = Math.max(strokeBounds ? strokeBounds.x + strokeBounds.width : right, right);
      const b = Math.max(strokeBounds ? strokeBounds.y + strokeBounds.height : bottom, bottom);
      strokeBounds = { x, y, width: r - x, height: b - y };
    }
    left = top = Infinity;
    right = bottom = -Infinity;
    return {
      planes: strokeBounds ? draft : planes,
      coverage,
      strokeBounds: strokeBounds ? { ...strokeBounds } : null,
      dirtyBounds: changed,
      pixels: changed ? composeRasterRegion(draft, changed) : null,
    };
  }

  function append(point: SourcePoint): void {
    assertSourcePoint(point);
    if (!last) stamp(point);
    line.add(point.x, point.y, spacing, stamp);
    last = { ...point };
  }

  return {
    add(point) {
      if (closed) throw new Error('Brush stroke is closed');
      append(point);
      return preview();
    },
    finish(point) {
      if (closed) throw new Error('Brush stroke is closed');
      if (point) append(point);
      line.addFinal(spacing, stamp);
      if (last) stamp(last);
      closed = true;
      return preview();
    },
    cancel() {
      closed = true;
    },
  };
}
