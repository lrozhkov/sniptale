import type { GpuPreviewLayer } from '../../features/video/composition/canvas/gpu-preview';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';

/** A raw EffectV1 frame retains its physical density and complete external logical bounds. */
export function reviewGpuAnnotationLayer(
  entry: {
    instance: Pick<ReviewAnnotationEffect, 'transform'>;
    bitmap?: ImageBitmap;
    bitmapBounds: { x: number; y: number; width: number; height: number };
  },
  target: { x: number; y: number; width: number; height: number },
  source?: GpuPreviewLayer['source']
): GpuPreviewLayer {
  const raster = source ?? entry.bitmap;
  if (!raster) throw new Error('Annotation GPU source is unavailable.');
  const { transform } = entry.instance;
  const width = transform.width * target.width;
  const height = transform.height * target.height;
  const x = target.x + transform.x * target.width + width / 2;
  const y = target.y + transform.y * target.height + height / 2;
  const cosine = Math.cos(transform.rotation),
    sine = Math.sin(transform.rotation);
  return {
    source: raster,
    rect: {
      x: (entry.bitmapBounds.x - 0.5) * width,
      y: (entry.bitmapBounds.y - 0.5) * height,
      width: entry.bitmapBounds.width * width,
      height: entry.bitmapBounds.height * height,
    },
    inverse: [cosine, sine, -cosine * x - sine * y, -sine, cosine, sine * x - cosine * y, 0, 0, 1],
  };
}
