import type { TourMask } from '@sniptale/runtime-contracts/scenario/types/tour';
import { assertImportableProjectImage } from '../../../features/media-hub/project-assets';

export interface TourHtmlImageOptions {
  optimize: boolean;
  maxEdge: number;
  quality: number;
}

/** Rasterizes privacy masks before lossy encoding; retains at most one decoded source. */
export async function prepareTourRaster(
  source: Blob,
  masks: readonly TourMask[],
  options: TourHtmlImageOptions,
  signal: AbortSignal
) {
  await assertImportableProjectImage(source);
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(source);
  let canvas: OffscreenCanvas | undefined;
  let sanitized: OffscreenCanvas | undefined;
  try {
    signal.throwIfAborted();
    if (bitmap.width * bitmap.height > 64_000_000) throw new Error('Image pixel budget exceeded');
    const mustEncode = !['image/png', 'image/jpeg', 'image/webp'].includes(
      source.type.toLowerCase().split(';', 1)[0]!
    );
    const ratio = options.optimize
      ? Math.min(1, options.maxEdge / Math.max(bitmap.width, bitmap.height))
      : 1;
    const width = Math.max(1, Math.floor(bitmap.width * ratio));
    const height = Math.max(1, Math.floor(bitmap.height * ratio));
    let blob = source;
    if (masks.length || options.optimize || mustEncode) {
      canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Raster unavailable');
      let pixels: ImageBitmap | OffscreenCanvas = bitmap;
      if (masks.length) {
        sanitized = new OffscreenCanvas(bitmap.width, bitmap.height);
        const privacy = sanitized.getContext('2d');
        if (!privacy) throw new Error('Raster unavailable');
        privacy.drawImage(bitmap, 0, 0);
        for (const mask of masks) {
          // Opaque backing is mandatory even if the authored color contains alpha.
          const x = Math.floor(mask.rect.x * bitmap.width),
            y = Math.floor(mask.rect.y * bitmap.height);
          const right = Math.ceil((mask.rect.x + mask.rect.width) * bitmap.width);
          const bottom = Math.ceil((mask.rect.y + mask.rect.height) * bitmap.height);
          privacy.fillStyle = '#000000';
          privacy.fillRect(x, y, right - x, bottom - y);
          privacy.fillStyle = mask.color;
          privacy.fillRect(x, y, right - x, bottom - y);
        }
        pixels = sanitized;
      }
      ctx.drawImage(pixels, 0, 0, width, height);
      const encoded = await canvas.convertToBlob(
        options.optimize ? { type: 'image/webp', quality: options.quality } : { type: 'image/png' }
      );
      if (masks.length || mustEncode || ratio < 1 || encoded.size < source.size) blob = encoded;
    }
    signal.throwIfAborted();
    return { blob, width, height };
  } finally {
    bitmap.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    if (sanitized) {
      sanitized.width = 0;
      sanitized.height = 0;
    }
  }
}
