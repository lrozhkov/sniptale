import {
  assertRasterSize,
  assertSelectionMask,
  type RasterSize,
  type SelectionMask,
  type SourcePoint,
} from './contracts';
import { floodFillBits } from './vendor/flood-fill';

/** Region search shared by wand, fill, and remove-color operations. */
export interface RegionOptions extends RasterSize {
  readonly rgba: Uint8ClampedArray;
  /** Integer source pixel index, inside the image and any explicit selection. */
  readonly seed: SourcePoint;
  /** Per-channel RGBA tolerance in bytes, inclusive, relative to the seed. */
  readonly tolerance: number;
  /** Nonnegative integer expansion in source pixels, clipped to image and selection. */
  readonly grow: number;
  /** True uses four-connected search; false matches across the whole selection. */
  readonly contiguous: boolean;
  readonly selection?: SelectionMask;
}

/**
 * Return a new binary region mask. Inputs remain unchanged, including on failure.
 * Zero-alpha pixels compare as transparent black, regardless of hidden RGB.
 * A seed outside an explicit selection is rejected, including an empty selection.
 */
export function findRegion(options: RegionOptions): Uint8Array {
  const count = assertRasterSize(options);
  const { rgba, width, height, seed, tolerance, grow, contiguous } = options;
  const selection = options.selection === undefined ? null : options.selection;
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== count * 4) {
    throw new TypeError('RGBA data must contain four bytes per source pixel');
  }
  assertSelectionMask(selection, count);
  if (
    !Number.isInteger(seed.x) ||
    !Number.isInteger(seed.y) ||
    seed.x < 0 ||
    seed.x >= width ||
    seed.y < 0 ||
    seed.y >= height
  ) {
    throw new RangeError('Region seed must be a source pixel inside the image');
  }
  if (selection !== null && !selection[seed.y * width + seed.x]) {
    throw new RangeError('Region seed must be inside the explicit selection');
  }
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) {
    throw new RangeError('Region tolerance must be an integer byte');
  }
  if (!Number.isSafeInteger(grow) || grow < 0)
    throw new RangeError('Region grow must be a nonnegative integer');
  if (typeof contiguous !== 'boolean') throw new TypeError('Region contiguous must be boolean');
  const source = new Uint8ClampedArray(rgba);
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] === 0) source.fill(0, i, i + 3);
  }
  const result = floodFillBits(
    source,
    selection ?? undefined,
    width,
    height,
    seed.x,
    seed.y,
    tolerance,
    Math.min(grow, Math.max(width, height)),
    contiguous
  ).data;
  if (selection !== null) {
    for (let i = 0; i < count; i++) if (!selection[i]) result[i] = 0;
  }
  return result;
}
