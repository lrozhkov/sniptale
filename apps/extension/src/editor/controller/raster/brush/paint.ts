import { getRasterImageData, parseRasterColor, putRasterImageData } from '../bitmap';
import { sampleRasterStrokePoints, type RasterPoint } from '../stroke';
import { paintRasterBrushPoint } from './point';

export function paintRasterBrushBitmap(args: {
  bitmap: HTMLCanvasElement;
  color: string;
  hardness: number;
  maskCanvas?: HTMLCanvasElement | null;
  opacity: number;
  points: ReadonlyArray<RasterPoint>;
  radius: number;
}): boolean {
  const imageData = getRasterImageData(args.bitmap);
  const mask = args.maskCanvas ? getRasterImageData(args.maskCanvas).data : null;
  const color = parseRasterColor(args.color);
  const radius = Math.max(0.5, args.radius);
  const hardness = Math.max(0, Math.min(1, args.hardness));
  const opacity = Math.max(0, Math.min(1, args.opacity));
  let changed = false;

  for (const point of sampleRasterStrokePoints(args.points)) {
    changed =
      paintRasterBrushPoint({
        bitmap: args.bitmap,
        color,
        hardness,
        imageData,
        mask,
        opacity,
        point,
        radius,
      }) || changed;
  }

  if (changed) {
    putRasterImageData(args.bitmap, imageData);
  }
  return changed;
}
