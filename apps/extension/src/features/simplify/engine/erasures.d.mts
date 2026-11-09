import type { SimplifyPixelSource, SimplifyPaintContext } from '../raster';
export function attachEraseSupport(image: SimplifyPixelSource, box: object): object;

export function eraseOwned(context: SimplifyPaintContext, box: object): void;
