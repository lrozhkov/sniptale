function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  return context;
}

export function createRasterCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export async function loadRasterCanvasFromDataUrl(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = await loadImageElement(dataUrl);
  const canvas = createRasterCanvas(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height
  );
  requireContext(canvas).drawImage(image, 0, 0);
  return canvas;
}

export function canvasToRasterDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function getRasterImageData(canvas: HTMLCanvasElement): ImageData {
  return requireContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

export function putRasterImageData(canvas: HTMLCanvasElement, imageData: ImageData): void {
  requireContext(canvas).putImageData(imageData, 0, 0);
}

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load raster bitmap.'));
    image.src = dataUrl;
  });
}
