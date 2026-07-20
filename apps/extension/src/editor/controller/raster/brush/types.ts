import type { RasterPoint } from '../stroke';

export interface RasterBrushPointPaintArgs {
  bitmap: HTMLCanvasElement;
  color: [number, number, number, number];
  hardness: number;
  imageData: ImageData;
  mask: Uint8ClampedArray | null;
  opacity: number;
  point: RasterPoint;
  radius: number;
}
