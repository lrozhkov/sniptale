import { acquireVideoCompositionBuffer } from '../../features/video/composition/canvas/buffer-pool';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

import { windowHeaderGeometry } from '../../features/browser-frame/header';
import { composeWindowHeaderSvg } from '../../features/browser-frame/appearance';
import type { QuickEditWindowHeader } from '../../features/video/review/advanced/types';

/** Local artwork only: title and address are escaped by the shared compositor, with no remote resources. */
export function reviewWindowHeaderUrl(
  header: QuickEditWindowHeader,
  width: number,
  height: number,
  displayHeight?: number
): string {
  const source = { width, height };
  const rasterHeight =
    displayHeight ?? Math.max(2, Math.ceil(windowHeaderGeometry(header, source).height / 2) * 2);
  // Encoder rows extend the toolbar surface; glyphs keep the same scale on both axes.
  const svg = composeWindowHeaderSvg(header, source, rasterHeight);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Rasterize the complete SVG once; the caller owns the bitmap and must close it. */
export async function loadReviewWindowHeader(
  url: string,
  signal: AbortSignal
): Promise<ImageBitmap> {
  signal.throwIfAborted();
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
      reject(new Error('Window header is unavailable.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
  try {
    signal.throwIfAborted();
    // Re-rasterizing nested SVG viewports for each fractional zoom opens antialiased
    // slice edges. A fixed raster shares the video sampling path and keeps joins opaque.
    const bitmap = await createImageBitmap(image);
    if (signal.aborted) {
      bitmap.close();
      signal.throwIfAborted();
    }
    return bitmap;
  } finally {
    image.src = '';
  }
}

/** One source plane lets filtering cross the header/video join. Caller releases the scratch lease. */
export function createReviewWindowRaster(args: {
  header: CanvasImageSource;
  videoRect: QuickEditRect;
  windowRect: QuickEditRect;
  draw(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
  ): void;
}) {
  const width =
    'width' in args.header && typeof args.header.width === 'number' && args.header.width > 0
      ? args.header.width
      : args.windowRect.width;
  const scale = width / args.windowRect.width;
  const height = args.windowRect.height * scale;
  const lease = acquireVideoCompositionBuffer(width, height);
  const context = lease?.canvas.getContext('2d') as CanvasRenderingContext2D | null | undefined;
  if (!lease || !context) {
    lease?.release();
    throw new Error('Window composition canvas is unavailable.');
  }
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, lease.canvas.width, lease.canvas.height);
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const headerHeight = (args.videoRect.y - args.windowRect.y) * scale;
    context.drawImage(args.header, 0, 0, width, headerHeight);
    // Sum coverage at the shared edge without backing transparent source pixels.
    context.globalCompositeOperation = 'lighter';
    args.draw(
      context,
      (args.videoRect.x - args.windowRect.x) * scale,
      headerHeight,
      args.videoRect.width * scale,
      args.videoRect.height * scale
    );
  } catch (error) {
    lease.release();
    throw error;
  } finally {
    context.restore();
  }
  return { image: lease.canvas, width, height, release: lease.release };
}
