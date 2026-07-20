import {
  createEditorGradientColorStopColor,
  createEditorGradientFallbackStops,
  normalizeEditorGradientStops,
  type EditorGradientColorStop,
} from '../../../features/editor/document/gradient';
import { createRasterCanvas, getRasterImageData, putRasterImageData } from './bitmap/canvas';
import type { RasterPoint } from './stroke';

export function fillRasterBitmapWithLinearGradient(args: {
  bitmap: HTMLCanvasElement;
  start: RasterPoint;
  end: RasterPoint;
  from?: string;
  stops?: readonly EditorGradientColorStop[] | undefined;
  to?: string;
  maskCanvas?: HTMLCanvasElement | null;
}): void {
  const gradientCanvas = createRasterCanvas(args.bitmap.width, args.bitmap.height);
  const context = gradientCanvas.getContext('2d');
  if (!context) {
    return;
  }

  const gradient = context.createLinearGradient(args.start.x, args.start.y, args.end.x, args.end.y);
  for (const stop of normalizeEditorGradientStops(
    args.stops,
    createEditorGradientFallbackStops(args.from ?? '#000000', args.to ?? '#ffffff')
  )) {
    gradient.addColorStop(stop.offset, createEditorGradientColorStopColor(stop));
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, gradientCanvas.width, gradientCanvas.height);
  if (!args.maskCanvas) {
    args.bitmap.getContext('2d')?.drawImage(gradientCanvas, 0, 0);
    return;
  }

  const baseImage = getRasterImageData(args.bitmap);
  const gradientImage = getRasterImageData(gradientCanvas);
  const mask = getRasterImageData(args.maskCanvas).data;
  for (let index = 0; index < baseImage.data.length; index += 4) {
    if (mask[index + 3] === 0) {
      continue;
    }

    baseImage.data[index] = gradientImage.data[index] ?? 0;
    baseImage.data[index + 1] = gradientImage.data[index + 1] ?? 0;
    baseImage.data[index + 2] = gradientImage.data[index + 2] ?? 0;
    baseImage.data[index + 3] = gradientImage.data[index + 3] ?? 0;
  }
  putRasterImageData(args.bitmap, baseImage);
}
