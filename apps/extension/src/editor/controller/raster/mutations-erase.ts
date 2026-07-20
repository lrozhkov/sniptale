import { getRasterImageData, putRasterImageData } from './bitmap';
import { resolveRasterCircleBounds } from './pixels';
import { sampleRasterStrokePoints, type RasterPoint } from './stroke';

export function eraseRasterBitmap(args: {
  bitmap: HTMLCanvasElement;
  points: ReadonlyArray<RasterPoint>;
  radius: number;
  maskCanvas?: HTMLCanvasElement | null;
}): void {
  const imageData = getRasterImageData(args.bitmap);
  const mask = args.maskCanvas ? getRasterImageData(args.maskCanvas).data : null;
  const radiusSquared = Math.max(1, args.radius) * Math.max(1, args.radius);

  for (const point of sampleRasterStrokePoints(args.points)) {
    eraseRasterBrushPoint({
      bitmap: args.bitmap,
      imageData,
      mask,
      point,
      radius: args.radius,
      radiusSquared,
    });
  }

  putRasterImageData(args.bitmap, imageData);
}

function eraseRasterBrushPoint(args: {
  bitmap: HTMLCanvasElement;
  imageData: ImageData;
  mask: Uint8ClampedArray | null;
  point: RasterPoint;
  radius: number;
  radiusSquared: number;
}): void {
  const { maxX, maxY, minX, minY } = resolveRasterCircleBounds({
    height: args.bitmap.height,
    point: args.point,
    radius: args.radius,
    width: args.bitmap.width,
  });

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - args.point.x) ** 2 + (y - args.point.y) ** 2 > args.radiusSquared) {
        continue;
      }

      const offset = (y * args.bitmap.width + x) * 4;
      if (args.mask && args.mask[offset + 3] === 0) {
        continue;
      }
      args.imageData.data[offset + 3] = 0;
    }
  }
}
