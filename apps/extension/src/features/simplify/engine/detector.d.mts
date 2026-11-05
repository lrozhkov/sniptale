import type { SimplifyPixelSource } from '../raster';
export function sampleBackground(
  image: SimplifyPixelSource,
  box: { x: number; y: number; w: number; h: number }
): number[];
