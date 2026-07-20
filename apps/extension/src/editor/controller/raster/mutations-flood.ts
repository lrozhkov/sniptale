import { getRasterImageData, parseRasterColor, putRasterImageData } from './bitmap';
import { matchesRasterTolerance, pushRasterPixelNeighbors, readRasterPixel } from './pixels';

export function floodFillRasterBitmap(args: {
  bitmap: HTMLCanvasElement;
  startX: number;
  startY: number;
  color: string;
  tolerance: number;
  maskCanvas?: HTMLCanvasElement | null;
}): void {
  const imageData = getRasterImageData(args.bitmap);
  const nextColor = parseRasterColor(args.color);
  const mask = args.maskCanvas ? getRasterImageData(args.maskCanvas).data : null;
  const queue: number[] = [args.startY * args.bitmap.width + args.startX];
  const visited = new Uint8Array(args.bitmap.width * args.bitmap.height);
  const seed = readRasterPixel(imageData.data, args.startX, args.startY, args.bitmap.width);

  while (queue.length > 0) {
    const pixel = queue.pop();
    if (pixel === undefined || visited[pixel] === 1) {
      continue;
    }

    visited[pixel] = 1;
    const x = pixel % args.bitmap.width;
    const y = Math.floor(pixel / args.bitmap.width);
    const offset = pixel * 4;
    if (mask && mask[offset + 3] === 0) {
      continue;
    }
    if (
      !matchesRasterTolerance(
        readRasterPixel(imageData.data, x, y, args.bitmap.width),
        seed,
        args.tolerance
      )
    ) {
      continue;
    }

    imageData.data[offset] = nextColor[0];
    imageData.data[offset + 1] = nextColor[1];
    imageData.data[offset + 2] = nextColor[2];
    imageData.data[offset + 3] = nextColor[3];
    pushRasterPixelNeighbors(queue, pixel, x, y, args.bitmap.width, args.bitmap.height);
  }

  putRasterImageData(args.bitmap, imageData);
}
