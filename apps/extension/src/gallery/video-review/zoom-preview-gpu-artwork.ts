import type {
  RenderCanvasLease,
  RenderResources,
} from '../../features/video/composition/canvas/render-resources';
import type { GpuPreviewLayer } from '../../features/video/composition/canvas/gpu-preview';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import type { ZoomPreviewLayout } from './zoom-preview-paint';
import type { ZoomPreviewFrame } from './use-zoom-preview-source';
import type { createReviewBackgroundPainter } from '../../workflows/video-review/scene-background';
import {
  drawReviewSceneShadow,
  reviewSpatialSourceRect,
} from '../../workflows/video-review/scene-shadow';
import { hasSceneBackgroundMotion } from '../../features/video/project/scene/background-motion';
type ArtworkInput = {
  background: QuickEditBackgroundSettings;
  imageUrl: string | null | undefined;
  headerImage?: CanvasImageSource | null | undefined;
  layout: ZoomPreviewLayout;
  output: { width: number; height: number };
  cornerRadius: number;
  previewScale?: number | undefined;
  currentTime?: number | undefined;
};

/** Own retained mini artwork; the caller keeps the GPU device and per-frame resources. */
export function createZoomPreviewGpuArtwork(
  resources: RenderResources,
  painter: ReturnType<typeof createReviewBackgroundPainter>
) {
  let artwork: {
    key: string;
    headerSource: ArtworkInput['headerImage'];
    background: RenderCanvasLease;
    decoration: RenderCanvasLease;
    header: RenderCanvasLease | null;
    rect: { x: number; y: number; width: number; height: number };
    backgroundRevision: number;
  } | null = null;
  let sourceRaster: { image: CanvasImageSource; raster: RenderCanvasLease } | null = null;
  let loadedImage: { url: string; image: HTMLImageElement } | null = null;
  const clear = () => {
    artwork?.background.release();
    artwork?.decoration.release();
    artwork?.header?.release();
    artwork = null;
    sourceRaster?.raster.release();
    sourceRaster = null;
  };
  const backgroundImage = async (url: string | null | undefined, signal: AbortSignal) => {
    if (!url) return null;
    if (loadedImage?.url === url) return loadedImage.image;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const clean = () => {
        image.onload = null;
        image.onerror = null;
        signal.removeEventListener('abort', abort);
      };
      const abort = () => {
        clean();
        image.src = '';
        reject(signal.reason);
      };
      image.onload = () => {
        clean();
        resolve();
      };
      image.onerror = () => {
        clean();
        reject(new Error('Inspector background is unavailable.'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.src = url;
      if (signal.aborted) abort();
    });
    signal.throwIfAborted();
    if (loadedImage) loadedImage.image.src = '';
    loadedImage = { url, image };
    return image;
  };
  return {
    async prepare(input: ArtworkInput, signal: AbortSignal) {
      const image =
        input.background.enabled && input.background.type === 'image'
          ? await backgroundImage(input.imageUrl, signal)
          : null;
      signal.throwIfAborted();
      const rect = reviewSpatialSourceRect({
        output: input.output,
        window: input.layout.windowRect,
        background: input.background,
        sceneScale: input.previewScale ?? 1,
      });
      const key = JSON.stringify([
        input.output,
        input.background,
        input.imageUrl,
        input.layout.windowRect,
        input.layout.videoRect,
        input.layout.sourceCrop,
        input.cornerRadius,
        input.previewScale,
      ]);
      if (!artwork || artwork.key !== key || artwork.headerSource !== input.headerImage) {
        clear();
        const bg = resources.canvas('inspector-gpu-background', input.output);
        let decor: RenderCanvasLease | undefined;
        let header: RenderCanvasLease | null = null;
        try {
          decor = resources.canvas('inspector-gpu-decoration', rect);
          const context = decor.context;
          context.translate(-rect.x, -rect.y);
          drawReviewSceneShadow(
            context,
            input.background,
            input.layout.windowRect,
            input.cornerRadius,
            input.previewScale ?? 1
          );
          if (input.headerImage) {
            const window = input.layout.windowRect;
            const height = (input.layout.visibleVideoRect ?? input.layout.videoRect).y - window.y;
            if (height > 0) {
              header = resources.canvas('inspector-gpu-header', {
                width: Math.max(1, Math.ceil(window.width)),
                height: Math.max(1, Math.ceil(height)),
              });
              header.context.drawImage(
                input.headerImage,
                0,
                0,
                header.canvas.width,
                header.canvas.height
              );
            }
          }
          artwork = {
            key,
            headerSource: input.headerImage,
            background: bg,
            decoration: decor,
            header,
            rect,
            backgroundRevision: 0,
          };
        } catch (error) {
          bg.release();
          decor?.release();
          header?.release();
          throw error;
        }
      }
      const art = artwork;
      if (art.backgroundRevision === 0 || hasSceneBackgroundMotion(input.background.motion)) {
        const scale = input.previewScale ?? 1;
        const background = input.background.enabled
          ? {
              ...input.background,
              layout: {
                ...input.background.layout,
                blur: (input.background.layout.blur ?? 0) * scale,
              },
            }
          : input.background;
        painter.draw(art.background.context, {
          background,
          image,
          ...input.output,
          currentTime: input.currentTime ?? 0,
        });
        art.backgroundRevision++;
      }
      return art;
    },
    source(frame: ZoomPreviewFrame | null) {
      let source: GpuPreviewLayer['source'];
      const imageSource = frame?.image;
      if (
        (typeof VideoFrame !== 'undefined' && imageSource instanceof VideoFrame) ||
        (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== 'undefined' && imageSource instanceof OffscreenCanvas) ||
        (typeof ImageBitmap !== 'undefined' && imageSource instanceof ImageBitmap)
      )
        source = imageSource;
      else {
        if (!sourceRaster || sourceRaster.image !== imageSource) {
          sourceRaster?.raster.release();
          sourceRaster = null;
          const raster = resources.canvas(
            'inspector-gpu-source',
            frame
              ? {
                  width: Math.max(1, frame.width),
                  height: Math.max(1, frame.height),
                }
              : { width: 1, height: 1 }
          );
          if (imageSource)
            raster.context.drawImage(imageSource, 0, 0, raster.canvas.width, raster.canvas.height);
          else {
            raster.context.fillStyle = '#000000';
            raster.context.fillRect(0, 0, 1, 1);
          }
          sourceRaster = { image: imageSource ?? raster.canvas, raster };
        }
        source = sourceRaster.raster.canvas;
      }
      return source;
    },
    clear,
    dispose() {
      clear();
      if (loadedImage) loadedImage.image.src = '';
      loadedImage = null;
    },
  };
}
