import {
  assertRasterSize,
  assertSelectionMask,
  assertSourcePoint,
  type PixelBounds,
  type RasterSourceGeometry,
  type SelectionMask,
  type SourcePoint,
} from './contracts';
import { assertRasterPixelData, composeRasterRegion, type RasterPixelData } from './pixels';
import { BezierLine } from './vendor/bezier-line';

/** Disposable stroke projection. Pixels contain the packed dirty source window. */
export interface RasterBrushPreview {
  readonly planes: RasterPixelData;
  readonly coverage: Uint8Array;
  readonly dirtyBounds: PixelBounds | null;
  readonly pixels: Uint8ClampedArray | null;
}

/** Source-pixel diameter and independent hardness. Accepted input planes remain immutable. */
interface RasterBrushOptions {
  readonly planes: RasterPixelData;
  readonly geometry: RasterSourceGeometry;
  readonly diameter: number;
  readonly hardness: number;
  readonly mode: 'erase' | 'restore';
  readonly selection?: SelectionMask;
}

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

/** Adapted Klecks Bezier spacing/finalization with local soft coverage and visibility planes. */
export function createRasterBrushStroke(options: RasterBrushOptions): RasterBrushStroke {
  const { planes, geometry, diameter, hardness, mode } = options;
  assertRasterPixelData(planes);
  const count = assertRasterSize(geometry);
  if (geometry.width !== planes.width || geometry.height !== planes.height)
    throw new RangeError('Brush geometry must match the source');
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > 32768)
    throw new RangeError('Brush diameter must be positive and bounded');
  if (!Number.isFinite(hardness) || hardness < 0 || hardness > 1)
    throw new RangeError('Brush hardness must be between zero and one');
  if (mode !== 'erase' && mode !== 'restore') throw new TypeError('Invalid brush mode');
  const selection = options.selection ?? null;
  assertSelectionMask(selection, count);
  const coverage = new Uint8Array(count);
  const visibility = planes.visibility?.slice() ?? new Uint8Array(count).fill(255);
  const key = mode === 'restore' ? (planes.key?.slice() ?? null) : planes.key;
  const draft: RasterPixelData = { ...planes, visibility, key };
  const line = new BezierLine();
  const radius = diameter / 2;
  const spacing = Math.max(0.25, diameter * 0.1);
  let last: SourcePoint | null = null;
  let dirty: PixelBounds | null = null;
  let closed = false;

  function stamp(point: SourcePoint): void {
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
        const old = planes.visibility?.[index] ?? 255;
        visibility[index] = Math.round(
          mode === 'restore' ? old + (255 - old) * fraction : old * (1 - fraction)
        );
        if (mode === 'restore' && key !== null && planes.key !== null)
          key[index * 4 + 3] = Math.round(planes.key[index * 4 + 3]! * (1 - fraction));
        const left = Math.min(dirty?.x ?? px, px);
        const top = Math.min(dirty?.y ?? py, py);
        const right = Math.max(dirty ? dirty.x + dirty.width : px + 1, px + 1);
        const bottom = Math.max(dirty ? dirty.y + dirty.height : py + 1, py + 1);
        dirty = { x: left, y: top, width: right - left, height: bottom - top };
      }
    }
  }

  function preview(): RasterBrushPreview {
    return {
      planes: dirty ? draft : planes,
      coverage,
      dirtyBounds: dirty ? { ...dirty } : null,
      pixels: dirty ? composeRasterRegion(draft, dirty) : null,
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
