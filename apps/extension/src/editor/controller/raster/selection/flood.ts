import { putRasterImageData } from '../bitmap';
import { matchesRasterTolerance, pushRasterPixelNeighbors, readRasterPixel } from '../pixels';

export function replaceRasterMaskWithFloodSelection(args: {
  maskCanvas: HTMLCanvasElement;
  imageData: ImageData;
  startX: number;
  startY: number;
  tolerance: number;
}): void {
  const maskImage = createFloodMaskImageData(
    args.imageData,
    args.startX,
    args.startY,
    args.tolerance
  );
  putRasterImageData(args.maskCanvas, maskImage);
}

function createFloodMaskImageData(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): ImageData {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const maskImage = context.createImageData(imageData.width, imageData.height);
  const source = imageData.data;
  const target = maskImage.data;
  const visited = new Uint8Array(imageData.width * imageData.height);
  const queue: number[] = [startY * imageData.width + startX];
  const seed = readRasterPixel(source, startX, startY, imageData.width);

  while (queue.length > 0) {
    const pixel = queue.pop();
    if (pixel === undefined || visited[pixel] === 1) {
      continue;
    }

    visited[pixel] = 1;
    const x = pixel % imageData.width;
    const y = Math.floor(pixel / imageData.width);
    if (!matchesRasterTolerance(readRasterPixel(source, x, y, imageData.width), seed, tolerance)) {
      continue;
    }

    const targetOffset = pixel * 4;
    target[targetOffset] = 255;
    target[targetOffset + 1] = 255;
    target[targetOffset + 2] = 255;
    target[targetOffset + 3] = 255;

    pushRasterPixelNeighbors(queue, pixel, x, y, imageData.width, imageData.height);
  }

  return maskImage;
}
