import type { SimplifyPixelSource, SimplifyRegion } from '../raster';

/** Returns bounded cleanup-only media regions; callers clip painting to the selected area. */
export function findCleanupMedia(image: SimplifyPixelSource, region: SimplifyRegion): Array<{
  x: number;
  y: number;
  w: number;
  h: number;
  bg: number[];
}>;
