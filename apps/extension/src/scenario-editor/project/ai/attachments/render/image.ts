import { loadImageFromBlob } from '@sniptale/platform/browser/media/image-load';

function createCanvas(size: { height: number; width: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

export async function renderSvgBlob(args: {
  blobType: string;
  quality?: number;
  size: { height: number; width: number };
  svgMarkup: string;
}): Promise<Blob> {
  const canvas = createCanvas(args.size);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create scenario AI attachment canvas');
  }

  const svgBlob = new Blob([args.svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const image = await loadImageFromBlob(svgBlob, 'Failed to load image blob');

  context.clearRect(0, 0, args.size.width, args.size.height);
  context.drawImage(image, 0, 0, args.size.width, args.size.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Failed to render scenario AI attachment blob'));
          return;
        }

        resolve(nextBlob);
      },
      args.blobType,
      args.quality
    );
  });
}
