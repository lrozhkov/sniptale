/** Dimensions of the source raster, independent of display scale and transforms. */
export interface RasterSize {
  readonly width: number;
  readonly height: number;
}

/** Source pixel coordinates. Pixel (x,y) has its center at (x+0.5,y+0.5). */
export interface SourcePoint {
  readonly x: number;
  readonly y: number;
}

/** Image-bounded rectangle with exclusive right and bottom edges. */
export interface PixelBounds extends RasterSize {
  readonly x: number;
  readonly y: number;
}

/** Transferable affine matrix: x'=a*x+c*y+e and y'=b*x+d*y+f. */
export type RasterAffine = readonly [number, number, number, number, number, number];

/** Full source projection. Periodic gestures stay unwrapped until pixel sampling. */
export interface RasterSourceGeometry extends RasterSize {
  readonly crop: PixelBounds;
  readonly sourceToScene: RasterAffine;
  readonly periodic: boolean;
  readonly sceneClip?: PixelBounds;
  /** Native renderer bounds in continuous source coordinates, before periodic wrapping. */
  readonly sourceClip?: PixelBounds;
}

/** Null is unrestricted. A binary 0/255 array is explicit, including all-zero arrays. */
export type SelectionMask = Uint8Array | null;

/** Reject invalid dimensions before allocating or changing raster data. */
export function assertRasterSize(size: RasterSize): number {
  const { width, height } = size;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 32768 ||
    height > 32768 ||
    width * height > 100_000_000
  ) {
    throw new RangeError('Invalid raster dimensions');
  }
  return width * height;
}

/** Validate an explicit mask without changing it. */
export function assertSelectionMask(mask: SelectionMask, pixelCount: number): void {
  if (mask === null) return;
  if (!(mask instanceof Uint8Array) || mask.length !== pixelCount) {
    throw new TypeError('Selection mask must contain one byte per source pixel');
  }
  for (const value of mask) {
    if (value !== 0 && value !== 255) throw new RangeError('Selection mask must be binary');
  }
}

/** Reject non-finite geometry before producing a mask. */
export function assertSourcePoint(point: SourcePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('Source coordinates must be finite');
  }
}
