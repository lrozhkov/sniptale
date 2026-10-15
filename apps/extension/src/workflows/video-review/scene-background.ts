import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import { drawSceneGradient } from '../../features/video/project/scene/background-gradient-canvas';
import { drawReviewBlurredScene } from './spotlight-blur';

type BackgroundPaint = {
  background: QuickEditBackgroundSettings;
  image: (CanvasImageSource & { width: number; height: number }) | null;
  width: number;
  height: number;
};
const rasters = new WeakMap<
  CanvasRenderingContext2D,
  {
    key: string;
    image: BackgroundPaint['image'];
    raster: HTMLCanvasElement;
  }
>();

/** Static paint only: edge-safe filtering is cached per render target, before camera transforms. */
export function drawReviewBackgroundPaint(
  context: CanvasRenderingContext2D,
  args: BackgroundPaint,
  cacheOwner = context
) {
  const { background, image, width, height } = args;
  const blur = background.enabled ? (background.layout.blur ?? 0) : 0;
  if (!background.enabled || background.type === 'solid' || blur <= 0) {
    rasters.delete(cacheOwner);
    drawPaint(context, args);
    return;
  }
  const key = JSON.stringify([width, height, background]);
  let cached = rasters.get(cacheOwner);
  if (!cached || cached.key !== key || cached.image !== image) {
    const documentRef = cacheOwner.canvas.ownerDocument ?? document;
    const scale = Math.min(1, 2048 / Math.max(width, height));
    const source = documentRef.createElement('canvas');
    source.width = Math.max(1, Math.round(width * scale));
    source.height = Math.max(1, Math.round(height * scale));
    const sourceContext = source.getContext('2d');
    const raster = documentRef.createElement('canvas');
    raster.width = source.width;
    raster.height = source.height;
    const target = raster.getContext('2d');
    if (!sourceContext || !target) throw new Error('Background compositor is unavailable.');
    drawPaint(sourceContext, { ...args, width: source.width, height: source.height });
    drawReviewBlurredScene(target, source, documentRef.createElement('canvas'), blur * scale);
    cached = { key, image, raster };
    rasters.set(cacheOwner, cached);
  }
  context.drawImage(cached.raster, 0, 0, width, height);
}

/** Owns the retained blurred background for one prepared preview session. */
export function createReviewBackgroundPainter(resources: RenderResources) {
  let cached: { key: string; image: BackgroundPaint['image']; lease: RenderCanvasLease } | null =
    null;
  let disposed = false;
  const clear = () => {
    cached?.lease.release();
    cached = null;
  };
  return {
    /** Geometry only; the painter retains exclusive ownership of its cache lease. */
    get retainedCacheSize() {
      return cached
        ? { width: cached.lease.canvas.width, height: cached.lease.canvas.height }
        : null;
    },
    draw(context: CanvasRenderingContext2D, args: BackgroundPaint) {
      if (disposed) throw new Error('Background painter is disposed.');
      const { background, image, width, height } = args;
      const blur = background.enabled ? (background.layout.blur ?? 0) : 0;
      if (!background.enabled || background.type === 'solid' || blur <= 0) {
        clear();
        drawPaint(context, args, resources);
        return;
      }
      const key = JSON.stringify([width, height, background]);
      if (!cached || cached.key !== key || cached.image !== image) {
        const scale = Math.min(1, 2048 / Math.max(width, height));
        const size = {
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
        };
        const source = resources.canvas('background-source', size);
        let replacement: RenderCanvasLease | undefined;
        try {
          replacement = resources.canvas('background-cache', size);
          drawPaint(source.context, { ...args, ...size }, resources);
          drawReviewBlurredScene(replacement.context, source.canvas, null, blur * scale, resources);
          clear();
          cached = { key, image, lease: replacement };
          replacement = undefined;
        } finally {
          replacement?.release();
          source.release();
        }
      }
      context.drawImage(cached.lease.canvas, 0, 0, width, height);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };
}

function drawPaint(
  context: CanvasRenderingContext2D,
  { background, image, width, height }: BackgroundPaint,
  resources?: RenderResources
) {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  if (!background.enabled) return;
  if (background.type === 'solid') {
    context.fillStyle = background.color;
    context.fillRect(0, 0, width, height);
  } else if (background.type === 'gradient') {
    drawSceneGradient(
      context,
      background.gradient,
      width,
      height,
      resources
        ? {
            backing: {
              width: Math.max(1, Math.ceil(width)),
              height: Math.max(1, Math.ceil(height)),
            },
            resources,
          }
        : undefined
    );
  } else if (image) {
    const scale =
      background.imageFit === 'cover'
        ? Math.max(width / image.width, height / image.height)
        : Math.min(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      (width - drawWidth) / 2,
      (height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }
}
