import type { SimplifyPixelSource } from '../raster';

export function claimCompactGraphics(
  image: SimplifyPixelSource,
  input: readonly object[],
  measure: (image: SimplifyPixelSource, box: object, minimumGlyphs?: number) => object | null,
  options?: object
): object[];
