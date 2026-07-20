import { getRasterImageData, parseRasterColor, putRasterImageData } from './bitmap';

export function fillRasterBitmap(args: {
  bitmap: HTMLCanvasElement;
  color: string;
  maskCanvas?: HTMLCanvasElement | null;
}): void {
  const imageData = getRasterImageData(args.bitmap);
  const [red, green, blue, alpha] = parseRasterColor(args.color);
  const mask = args.maskCanvas ? getRasterImageData(args.maskCanvas).data : null;

  for (let index = 0; index < imageData.data.length; index += 4) {
    if (mask && mask[index + 3] === 0) {
      continue;
    }

    imageData.data[index] = red;
    imageData.data[index + 1] = green;
    imageData.data[index + 2] = blue;
    imageData.data[index + 3] = alpha;
  }

  putRasterImageData(args.bitmap, imageData);
}

export function clearRasterBitmap(args: {
  bitmap: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
}): void {
  const imageData = getRasterImageData(args.bitmap);
  const mask = getRasterImageData(args.maskCanvas).data;

  for (let index = 0; index < imageData.data.length; index += 4) {
    if (mask[index + 3] === 0) {
      continue;
    }

    imageData.data[index + 3] = 0;
  }

  putRasterImageData(args.bitmap, imageData);
}
