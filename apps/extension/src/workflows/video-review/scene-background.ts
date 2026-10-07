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

function drawPaint(
  context: CanvasRenderingContext2D,
  { background, image, width, height }: BackgroundPaint
) {
  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  if (!background.enabled) return;
  if (background.type === 'solid') {
    context.fillStyle = background.color;
    context.fillRect(0, 0, width, height);
  } else if (background.type === 'gradient') {
    drawSceneGradient(context, background.gradient, width, height);
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
