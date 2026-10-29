import { readImageDataUrlDimensions } from '@sniptale/runtime-contracts/validation/data-url';
import { FULL_PAGE_QUALITY_ABSOLUTE_LIMITS } from '../../contracts/full-page-capture';
import { blobToDataUrl, dataUrlToBlob } from './data-url';
import { optimizePngBlob } from './png-optimization';

interface ScreenshotEncodingOptions {
  format: 'png' | 'jpeg' | 'webp';
  /** User setting in percent (1–100), including the lowest value 1. */
  quality: number;
  signal?: AbortSignal;
}

/** Optimize final screenshot bytes without changing their format or quality. */
export async function optimizeScreenshotBlob(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  try {
    if (blob.type === 'image/png') return await optimizePngBlob(blob, signal);
  } catch {
    signal?.throwIfAborted();
  }
  return blob;
}

/** Preserve the original data URL when optional compression does not reduce its bytes. */
export async function optimizeScreenshotDataUrl(
  dataUrl: string,
  signal?: AbortSignal
): Promise<string> {
  signal?.throwIfAborted();
  if (!/^data:image\/png;base64,/.test(dataUrl)) return dataUrl;
  try {
    const source = await dataUrlToBlob(dataUrl, signal);
    const optimized = await optimizeScreenshotBlob(source, signal);
    signal?.throwIfAborted();
    const result = optimized === source ? dataUrl : await blobToDataUrl(optimized);
    signal?.throwIfAborted();
    return result;
  } catch {
    signal?.throwIfAborted();
    return dataUrl;
  }
}

/** Encode the selected output format once, after all screenshot composition and cropping. */
export async function finalizeScreenshotDataUrl(
  dataUrl: string,
  options: ScreenshotEncodingOptions
): Promise<string> {
  options.signal?.throwIfAborted();
  const mime = `image/${options.format}`;
  if (dataUrl.startsWith(`data:${mime};base64,`)) {
    return optimizeScreenshotDataUrl(dataUrl, options.signal);
  }
  const dimensions = readImageDataUrlDimensions(
    dataUrl,
    FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxFileSizeMiB * 1024 * 1024
  );
  if (
    !dimensions ||
    dimensions.width * dimensions.height * 8 > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.maxWorkingSetBytes
  ) {
    throw new Error('Screenshot conversion exceeds the raster budget');
  }
  const image = await createImageBitmap(await dataUrlToBlob(dataUrl, options.signal));
  let canvas: OffscreenCanvas | null = null;
  try {
    if (image.width !== dimensions.width || image.height !== dimensions.height)
      throw new Error('Screenshot raster dimensions do not match');
    canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Screenshot canvas context is unavailable');
    context.drawImage(image, 0, 0);
    options.signal?.throwIfAborted();
    const quality = options.quality / 100;
    const encoded = await canvas.convertToBlob({
      type: mime,
      quality: Math.max(0, Math.min(1, quality)),
    });
    if (encoded.type !== mime) throw new Error('Requested screenshot encoding is unavailable');
    const output = await optimizeScreenshotBlob(encoded, options.signal);
    options.signal?.throwIfAborted();
    const result = await blobToDataUrl(output);
    options.signal?.throwIfAborted();
    return result;
  } finally {
    image.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
