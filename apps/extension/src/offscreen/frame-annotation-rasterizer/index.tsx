import { createRoot } from 'react-dom/client';
import { snapdom } from '@zumer/snapdom';
import { FrameAnnotationExportSurface } from '../../features/highlighter/frame-annotation/export-surface';
import type {
  FrameAnnotationRasterInput,
  FrameAnnotationRasterOutputMetadata,
} from '../../composition/persistence/frame-annotation-raster-jobs';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getFrameCalloutFontProbeText,
  loadFrameCalloutHandwrittenFont,
  requiresFrameCalloutHandwrittenFont,
} from '../../features/highlighter/frame-annotation/callout/font-readiness';

const MAX_PIXEL_AREA = 16_000_000;
const MAX_SIDE = 16_384;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const TARGET_RETRY_BYTES = 60 * 1024 * 1024;
const RASTER_TOTAL_TIMEOUT_MS = 50_000;
const logger = createLogger({ namespace: 'FrameAnnotationRasterizer' });

export class FrameAnnotationRasterizer {
  async rasterize(
    input: FrameAnnotationRasterInput
  ): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
    if (!(input.baseImage instanceof Blob) || input.baseImage.type !== 'image/png') {
      throw new Error('Frame annotation raster input must be a PNG Blob');
    }
    const { initialScale, requestedScale } = resolveFrameAnnotationInitialScale(input);
    const deadline = Date.now() + RASTER_TOTAL_TIMEOUT_MS;
    let first: Awaited<ReturnType<typeof rasterizeAtScale>>;
    try {
      first = await rasterizeAtScale(
        input,
        initialScale,
        initialScale < requestedScale,
        false,
        deadline
      );
    } catch (error) {
      if (!isRecoverableAllocationFailure(error)) throw error;
      const retryScale = resolveAllocationRetryScale(initialScale);
      logger.warn('Retrying frame annotation raster after allocation failure', {
        initialScale,
        retryScale,
        error: error instanceof Error ? error.message : String(error),
      });
      return rasterizeAtScale(input, retryScale, true, true, deadline);
    }
    if (first.blob.size <= MAX_OUTPUT_BYTES) return first;
    const retryScale = resolveOversizeRetryScale(initialScale, first.blob.size);
    logger.warn('Retrying oversized frame annotation raster', {
      initialBytes: first.blob.size,
      initialScale,
      retryScale,
    });
    return rasterizeAtScale(input, retryScale, true, true, deadline);
  }
}

async function rasterizeAtScale(
  input: FrameAnnotationRasterInput,
  scale: number,
  downscaled: boolean,
  enforceOutputLimit = true,
  deadline = Date.now() + RASTER_TOTAL_TIMEOUT_MS
): Promise<{ blob: Blob; metadata: FrameAnnotationRasterOutputMetadata }> {
  const width = Math.max(1, Math.floor(input.width * scale));
  const height = Math.max(1, Math.floor(input.height * scale));
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;overflow:hidden`;
  document.body.appendChild(host);
  const imageUrl = URL.createObjectURL(input.baseImage);
  const root = createRoot(host);
  try {
    root.render(
      <div style={{ width, height, transformOrigin: 'top left' }}>
        <div
          style={{
            width: input.width,
            height: input.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <FrameAnnotationExportSurface
            baseImageUrl={imageUrl}
            height={input.height}
            snapshots={input.snapshots}
            width={input.width}
          />
        </div>
      </div>
    );
    await waitForPaint(host, deadline);
    await loadRequiredFrameAnnotationFonts(input, deadline);
    const blob = await withRasterDeadline(
      snapdom.toBlob(host, {
        width,
        height,
        dpr: 1,
        scale: 1,
        type: 'png',
        embedFonts: true,
        useProxy: '',
        cache: 'soft',
        reconcile: true,
      }),
      deadline
    );
    if (!(blob instanceof Blob) || blob.type !== 'image/png') {
      throw new Error('SnapDOM did not return a PNG Blob');
    }
    if (enforceOutputLimit && blob.size > MAX_OUTPUT_BYTES) {
      throw new Error('Frame annotation raster output exceeds 64 MiB after retry');
    }
    return {
      blob,
      metadata: { downscaled, outputWidth: width, outputHeight: height, outputScale: scale },
    };
  } finally {
    root.unmount();
    URL.revokeObjectURL(imageUrl);
    host.remove();
  }
}

function isRecoverableAllocationFailure(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(?:allocat|out of memory|memory limit|canvas size|image-decode limit)/i.test(message);
}

function withRasterDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const remaining = Math.max(0, deadline - Date.now());
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Frame annotation rasterization timed out')),
      remaining
    );
  });
  return Promise.race([work, timeoutResult]).finally(() => clearTimeout(timeout));
}

export function resolveOutputScale(width: number, height: number): number {
  return Math.min(
    1,
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_PIXEL_AREA / (width * height))
  );
}

export function resolveFrameAnnotationInitialScale(
  input: Pick<FrameAnnotationRasterInput, 'width' | 'height' | 'requestedWidth' | 'requestedHeight'>
): { initialScale: number; requestedScale: number } {
  const requestedScale = Math.min(
    input.requestedWidth === undefined ? 1 : input.requestedWidth / input.width,
    input.requestedHeight === undefined ? 1 : input.requestedHeight / input.height
  );
  return {
    requestedScale,
    initialScale: Math.min(requestedScale, resolveMaximumOutputScale(input.width, input.height)),
  };
}

export function resolveAllocationRetryScale(scale: number): number {
  return scale * Math.SQRT1_2;
}

export function resolveOversizeRetryScale(scale: number, byteSize: number): number {
  return scale * Math.min(1, Math.sqrt(TARGET_RETRY_BYTES / byteSize));
}

function resolveMaximumOutputScale(width: number, height: number): number {
  return Math.min(
    MAX_SIDE / width,
    MAX_SIDE / height,
    Math.sqrt(MAX_PIXEL_AREA / (width * height))
  );
}

async function waitForPaint(host: HTMLElement, deadline: number): Promise<void> {
  await withRasterDeadline(
    new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    ),
    deadline
  );
  const image = host.querySelector('img');
  if (image && !image.complete) await withRasterDeadline(image.decode(), deadline);
}

async function loadRequiredFrameAnnotationFonts(
  input: Pick<FrameAnnotationRasterInput, 'snapshots'>,
  deadline: number
): Promise<void> {
  const callouts = input.snapshots
    .map((snapshot) => snapshot.callout)
    .filter(requiresFrameCalloutHandwrittenFont);
  if (callouts.length === 0) return;
  const text = callouts.map(getFrameCalloutFontProbeText).join(' ');
  const loaded = await withRasterDeadline(
    loadFrameCalloutHandwrittenFont(document, text),
    deadline
  );
  if (!loaded) throw new Error('Frame annotation handwritten font failed to load');
}
