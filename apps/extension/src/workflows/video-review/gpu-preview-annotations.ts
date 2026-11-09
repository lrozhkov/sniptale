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

/** Shared attachment wrapper; callers own the coverage source and every entry source. */
export function reviewGpuAnnotationGroup(
  entries: readonly (Parameters<typeof reviewGpuAnnotationLayer>[0] & {
    source: GpuPreviewLayer['source'];
  })[],
  target: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  inverse: GpuPreviewLayer['inverse'],
  operationClip: NonNullable<GpuPreviewLayer['operationClip']>
): GpuPreviewLayer {
  return {
    source: {
      kind: 'group',
      output: size,
      logical: size,
      layers: entries.map((entry) => ({
        ...reviewGpuAnnotationLayer(entry, target, entry.source),
        operationClip,
      })),
    },
    rect: { x: 0, y: 0, ...size },
    inverse,
  };
}

/** Use the future camera geometry without capturing a future media frame. */
export function reviewGpuAnnotationDensity(
  source: { width: number; height: number },
  dimensions: {
    canonical: { width: number; height: number };
    backing: { width: number; height: number };
  },
  video: { width: number; height: number }
) {
  return {
    content: {
      width: ((video.width / source.width) * dimensions.backing.width) / dimensions.canonical.width,
      height:
        ((video.height / source.height) * dimensions.backing.height) / dimensions.canonical.height,
    },
    viewport: {
      width: dimensions.backing.width / dimensions.canonical.width,
      height: dimensions.backing.height / dimensions.canonical.height,
    },
  };
}
