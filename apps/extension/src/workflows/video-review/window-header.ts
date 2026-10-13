import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { acquireVideoCompositionBuffer } from '../../features/video/composition/canvas/buffer-pool';
import type { QuickEditRect } from '../../features/video/review/advanced/scene';

import { windowHeaderGeometry } from '../../features/browser-frame/header';
import { composeWindowHeaderSvg } from '../../features/browser-frame/appearance';
import type { QuickEditWindowHeader } from '../../features/video/review/advanced/types';

/** Magnify retains native source density before sampling the joined original. */
export function reviewWindowRasterBacking(args: {
  windowRect: QuickEditRect;
  sourceWidth: number;
  magnify: boolean;
}) {
  const width = Math.max(
    1,
    Math.ceil(args.windowRect.width),
    args.magnify ? Math.ceil(args.sourceWidth) : 0
  );
  return {
    width,
    height: Math.max(
      1,
      Math.ceil(
        args.magnify
          ? (args.windowRect.height * width) / args.windowRect.width
          : args.windowRect.height
      )
    ),
  };
}

/** The synchronous consumer borrows the original image, never its disposal authority. */
export type ReviewWindowRaster = Readonly<
  Pick<ReturnType<typeof createReviewWindowRaster>, 'image' | 'width' | 'height'>
>;

/** Base scene and sharp effects share one source lease, including exceptional exits. */
export function withReviewWindowRaster(
  args: Parameters<typeof createReviewWindowRaster>[0],
  consume: (raster: ReviewWindowRaster) => void
): void {
  const raster = createReviewWindowRaster(args);
  try {
    consume({ image: raster.image, width: raster.width, height: raster.height });
  } finally {
    raster.release();
  }
}

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
  signal: AbortSignal,
  options?: { backing: { width: number; height: number } }
): Promise<ImageBitmap> {
  signal.throwIfAborted();
  const backing = options?.backing;
  if (
    backing &&
    ![backing.width, backing.height].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    throw new Error('Invalid window header backing.');
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
    const bitmap = backing
      ? await createImageBitmap(image, {
          resizeWidth: backing.width,
          resizeHeight: backing.height,
          resizeQuality: 'high',
        })
      : await createImageBitmap(image);
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
  backing?: { width: number; height: number } | undefined;
  resources?: RenderResources | undefined;
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
  if (
    args.backing &&
    ![args.backing.width, args.backing.height].every(
      (value) => Number.isSafeInteger(value) && value > 0
    )
  )
    throw new Error('Invalid window raster backing.');
  const width =
    args.backing?.width ??
    ('width' in args.header && typeof args.header.width === 'number' && args.header.width > 0
      ? args.header.width
      : args.windowRect.width);
  const scale = width / args.windowRect.width;
  const height = args.backing?.height ?? args.windowRect.height * scale;
  const scaleY = args.backing ? height / args.windowRect.height : scale;
  const managed = args.resources?.canvas('decorated-window', {
    width: Math.ceil(width),
    height: Math.ceil(height),
  });
  const lease = managed ?? acquireVideoCompositionBuffer(width, height);
  const context = managed
    ? managed.context
    : (lease?.canvas.getContext('2d') as CanvasRenderingContext2D | null | undefined);
  if (!lease || !context) {
    lease?.release();
    throw new Error('Window composition canvas is unavailable.');
  }
  let saved = false;
  try {
    context.save();
    saved = true;
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, lease.canvas.width, lease.canvas.height);
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const headerHeight = (args.videoRect.y - args.windowRect.y) * scaleY;
      context.drawImage(args.header, 0, 0, width, headerHeight);
      // Sum coverage at the shared edge without backing transparent source pixels.
      context.globalCompositeOperation = 'lighter';
      args.draw(
        context,
        (args.videoRect.x - args.windowRect.x) * scale,
        headerHeight,
        args.videoRect.width * scale,
        args.videoRect.height * scaleY
      );
    } finally {
      if (saved) context.restore();
    }
  } catch (error) {
    lease.release();
    throw error;
  }
  return { image: lease.canvas, width, height, release: lease.release };
}
