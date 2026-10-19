import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ReviewBackgroundBlurPreview } from '../../../../apps/extension/src/gallery/video-review/background-blur-preview';
import { drawReviewBackgroundPaint } from '../../../../apps/extension/src/workflows/video-review/scene-background';
import { drawReviewSceneFrame } from '../../../../apps/extension/src/workflows/video-review/scene-frame';
import { computeQuickEditSceneLayout } from '../../../../apps/extension/src/features/video/review/advanced/scene';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import type { QuickEditBackgroundSettings } from '../../../../apps/extension/src/features/video/review/advanced/types';

/** Real SVG decode, shared live raster and export scene, including camera exposure passes. */
export async function probe() {
  const source = Object.assign(document.createElement('canvas'), { width: 320, height: 180 });
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><pattern ' +
    'id="p" width="4" height="4" patternUnits="userSpaceOnUse"><path fill="white" ' +
    'd="M0 0h2v4H0z"/><path fill="black" d="M2 0h2v4H2z"/></pattern></defs><path ' +
    'fill="url(#p)" d="M0 0h320v180H0z"/></svg>';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  image.src = url;
  await image.decode();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const background: QuickEditBackgroundSettings = {
    enabled: true,
    type: 'image',
    assetId: 'svg',
    imageFit: 'cover',
    layout: { padding: 45, cornerRadius: 12, blur: 12 },
  };
  try {
    flushSync(() =>
      root.render(
        <ReviewBackgroundBlurPreview
          background={background}
          imageUrl={url}
          width={320}
          height={180}
        />
      )
    );
    const live = host.querySelector('canvas')!;
    for (let i = 0; i < 100; i++) {
      await new Promise(requestAnimationFrame);
      if (live.getContext('2d')!.getImageData(160, 0, 1, 1).data[0]! > 0) break;
    }
    const context = source.getContext('2d')!;
    drawReviewBackgroundPaint(context, { background, image, width: 320, height: 180 });
    const exportPixels = context.getImageData(0, 0, 320, 180).data;
    const livePixels = live.getContext('2d')!.getImageData(0, 0, 320, 180).data;
    const mismatch = exportPixels.reduce(
      (max, value, i) => Math.max(max, Math.abs(value - livePixels[i]!)),
      0
    );
    const edge = [0, 179].map((y) => Array.from(context.getImageData(30, y, 260, 1).data));
    const scenes = [];
    for (const zoomBehavior of ['fixed', 'follow-video'] as const) {
      const paint = { ...background, zoomBehavior };
      const camera = { scale: 1.1, centerX: 0.5, centerY: 0.5 };
      const layout = computeQuickEditSceneLayout({
        source,
        output: source,
        canvas: source,
        background: paint,
        windowHeader: DEFAULT_WINDOW_HEADER,
        camera,
      });
      const header = Object.assign(document.createElement('canvas'), { width: 320, height: 40 });
      const headerContext = header.getContext('2d')!;
      headerContext.fillStyle = '#00ff00';
      headerContext.fillRect(0, 0, 320, 40);
      const sample = {
        draw(target: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
          target.fillStyle = '#ff0000';
          target.fillRect(x, y, w, h);
        },
      };
      drawReviewSceneFrame(context, {
        canvas: source,
        layout,
        background: paint,
        image,
        headerImage: header,
        sample,
        motionBlur: [
          { camera, alpha: 0.5 },
          { camera, alpha: 0.5 },
        ],
      });
      const center = Array.from(context.getImageData(160, 100, 1, 1).data);
      const outside = Array.from(context.getImageData(160, 1, 1, 1).data);
      scenes.push({ zoomBehavior, center, outside });
    }
    document.body.append(source);
    return { mismatch, edge, scenes };
  } finally {
    root.unmount();
    host.remove();
    URL.revokeObjectURL(url);
  }
}
