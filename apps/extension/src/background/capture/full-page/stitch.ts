import { loadSettings } from '../../../composition/persistence/settings';
import {
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  type FullPageQualityPolicy,
} from '../../../contracts/full-page-capture';
import type {
  FullPageCaptureGeometry,
  FullPageCaptureMetadata,
  FullPageCaptureTileState,
} from '../../../contracts/full-page-capture';
import { blobToDataURL } from '../download';
import {
  assertFullPageGeometryBudget,
  BYTES_PER_PIXEL,
  FULL_PAGE_FILE_BUDGET_ERROR,
  FULL_PAGE_RASTER_BUDGET_ERROR,
  MAX_RASTER_SIDE_PX,
  MAX_WORKING_SET_BYTES,
  resolveFullPageRasterBudget,
} from './budgets';
import { resolveCaptureBlobOptions } from './helpers';
import type { FullPageTilePlan } from './planner';
import type { FullPageCaptureOptions } from './types';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundFullPageCaptureStitch' });

type OutputCanvas = {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  outputScale: number;
};

type NativeFrameSource = {
  frameHeight: number;
  frameWidth: number;
  scale: number;
};

export type StreamingStitchResult = {
  dataUrl: string;
  metadata: FullPageCaptureMetadata;
};

type StreamingFullPageStitcher = {
  dispose(): void;
  drawFrame(
    dataUrl: string,
    plan: FullPageTilePlan,
    state: FullPageCaptureTileState
  ): Promise<void>;
  finish(
    options: FullPageCaptureOptions,
    abortSignal?: AbortSignal | undefined
  ): Promise<StreamingStitchResult>;
};

function throwIfStitchFinalizationAborted(signal?: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('Full-page capture was cancelled');
  }
}

function resolveOutputScale(args: {
  geometry: FullPageCaptureGeometry;
  nativeScale: number;
  qualityPolicy?: FullPageQualityPolicy;
  tileWidth: number;
  tileHeight: number;
}): number {
  const { geometry } = args;
  const policy = args.qualityPolicy ?? DEFAULT_FULL_PAGE_QUALITY_POLICY;
  assertFullPageGeometryBudget(geometry, policy);
  const budget = resolveFullPageRasterBudget(policy);
  const dimensionScale = Math.min(
    MAX_RASTER_SIDE_PX / geometry.outputWidth,
    MAX_RASTER_SIDE_PX / geometry.outputHeight
  );
  const areaScale = Math.sqrt(
    budget.maxRasterAreaPx / Math.max(1, geometry.outputWidth * geometry.outputHeight)
  );
  const tileBytes = args.tileWidth * args.tileHeight * BYTES_PER_PIXEL;
  const availableCanvasBytes = MAX_WORKING_SET_BYTES - tileBytes;
  const workingScale = Math.sqrt(
    Math.max(0, availableCanvasBytes) /
      Math.max(1, geometry.outputWidth * geometry.outputHeight * BYTES_PER_PIXEL)
  );
  const scale = Math.min(args.nativeScale, dimensionScale, areaScale, workingScale);
  if (!Number.isFinite(scale) || scale < budget.minOutputScale) {
    logger.warn('Full-page raster scale rejected by quality policy', {
      areaScale,
      dimensionScale,
      geometry,
      minOutputScale: budget.minOutputScale,
      nativeScale: args.nativeScale,
      scale,
      tileHeight: args.tileHeight,
      tileWidth: args.tileWidth,
      workingScale,
    });
    throw new Error(FULL_PAGE_RASTER_BUDGET_ERROR);
  }
  return scale;
}

function createOutputCanvas(geometry: FullPageCaptureGeometry, outputScale: number): OutputCanvas {
  const width = Math.max(1, Math.floor(geometry.outputWidth * outputScale));
  const height = Math.max(1, Math.floor(geometry.outputHeight * outputScale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create full-page screenshot canvas');
  return { canvas, context, outputScale };
}

async function decodeFrame(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Unable to decode full-page screenshot tile');
  return createImageBitmap(await response.blob());
}

function assertScaleStable(
  bitmap: ImageBitmap,
  geometry: FullPageCaptureGeometry,
  expectedSource: NativeFrameSource
): void {
  const requiredWidth = geometry.viewportWidth * expectedSource.scale;
  const requiredHeight = geometry.viewportHeight * expectedSource.scale;
  if (
    Math.abs(bitmap.width - expectedSource.frameWidth) > 1 ||
    Math.abs(bitmap.height - expectedSource.frameHeight) > 1 ||
    bitmap.width + 1 < requiredWidth ||
    bitmap.height + 1 < requiredHeight
  ) {
    throw new Error('Full-page screenshot scale changed during capture');
  }
}

function drawDocumentTile(args: {
  bitmap: ImageBitmap;
  output: OutputCanvas;
  plan: FullPageTilePlan;
  state: FullPageCaptureTileState;
  nativeSource: NativeFrameSource;
}): void {
  const geometry = args.state.geometry;
  const insetX = args.plan.sourceInsetX;
  const insetY = args.plan.sourceInsetY;
  const cssWidth = Math.max(
    0,
    Math.min(
      geometry.rootViewport.width - insetX,
      geometry.extentWidth - args.state.actualX - insetX
    )
  );
  const cssHeight = Math.max(
    0,
    Math.min(
      geometry.rootViewport.height - insetY,
      geometry.extentHeight - args.state.actualY - insetY
    )
  );
  if (cssWidth <= 0 || cssHeight <= 0) return;
  args.output.context.drawImage(
    args.bitmap,
    insetX * args.nativeSource.scale,
    insetY * args.nativeSource.scale,
    cssWidth * args.nativeSource.scale,
    cssHeight * args.nativeSource.scale,
    (args.state.actualX + insetX) * args.output.outputScale,
    (args.state.actualY + insetY) * args.output.outputScale,
    cssWidth * args.output.outputScale,
    cssHeight * args.output.outputScale
  );
}

function drawInternalScrollerTile(args: {
  bitmap: ImageBitmap;
  firstFrame: boolean;
  output: OutputCanvas;
  plan: FullPageTilePlan;
  state: FullPageCaptureTileState;
  nativeSource: NativeFrameSource;
}): void {
  const geometry = args.state.geometry;
  if (args.firstFrame) {
    drawInternalScrollerShell(args.bitmap, args.output, geometry, args.nativeSource);
  }
  const viewport = geometry.rootViewport;
  const insetX = args.plan.sourceInsetX;
  const insetY = args.plan.sourceInsetY;
  const cssWidth = Math.max(
    0,
    Math.min(viewport.width - insetX, geometry.extentWidth - args.state.actualX - insetX)
  );
  const cssHeight = Math.max(
    0,
    Math.min(viewport.height - insetY, geometry.extentHeight - args.state.actualY - insetY)
  );
  if (cssWidth <= 0 || cssHeight <= 0) return;
  args.output.context.drawImage(
    args.bitmap,
    (viewport.x + insetX) * args.nativeSource.scale,
    (viewport.y + insetY) * args.nativeSource.scale,
    cssWidth * args.nativeSource.scale,
    cssHeight * args.nativeSource.scale,
    (viewport.x + args.state.actualX + insetX) * args.output.outputScale,
    (viewport.y + args.state.actualY + insetY) * args.output.outputScale,
    cssWidth * args.output.outputScale,
    cssHeight * args.output.outputScale
  );
}

function drawInternalScrollerShell(
  bitmap: ImageBitmap,
  output: OutputCanvas,
  geometry: FullPageCaptureGeometry,
  nativeSource: NativeFrameSource
): void {
  const viewport = geometry.rootViewport;
  const rightWidth = Math.max(0, geometry.viewportWidth - viewport.x - viewport.width);
  const bottomHeight = Math.max(0, geometry.viewportHeight - viewport.y - viewport.height);
  const drawSlice = (
    sourceX: number,
    sourceY: number,
    width: number,
    height: number,
    destinationX: number,
    destinationY: number
  ) => {
    if (width <= 0 || height <= 0) return;
    output.context.drawImage(
      bitmap,
      sourceX * nativeSource.scale,
      sourceY * nativeSource.scale,
      width * nativeSource.scale,
      height * nativeSource.scale,
      destinationX * output.outputScale,
      destinationY * output.outputScale,
      width * output.outputScale,
      height * output.outputScale
    );
  };
  drawSlice(0, 0, geometry.viewportWidth, viewport.y, 0, 0);
  drawSlice(
    0,
    viewport.y + viewport.height,
    geometry.viewportWidth,
    bottomHeight,
    0,
    viewport.y + geometry.extentHeight
  );
  drawSlice(0, viewport.y, viewport.x, viewport.height, 0, viewport.y);
  drawSlice(
    viewport.x + viewport.width,
    viewport.y,
    rightWidth,
    viewport.height,
    viewport.x + geometry.extentWidth,
    viewport.y
  );
}

async function encodeCanvas(
  output: OutputCanvas,
  options: FullPageCaptureOptions,
  abortSignal?: AbortSignal | undefined
): Promise<{ blob: Blob; format: 'png' | 'jpeg' | 'webp' }> {
  throwIfStitchFinalizationAborted(abortSignal);
  const settings = await loadSettings();
  throwIfStitchFinalizationAborted(abortSignal);
  const resolved = resolveCaptureBlobOptions({
    imageFormat: settings.imageFormat,
    imageQuality: settings.imageQuality,
    options,
  });
  const blob = await output.canvas.convertToBlob({
    type: resolved.type,
    quality: resolved.quality,
  });
  throwIfStitchFinalizationAborted(abortSignal);
  return {
    blob,
    format: resolved.format,
  };
}

async function downscaleOversizedEncoding(args: {
  blob: Blob;
  format: 'png' | 'jpeg' | 'webp';
  output: OutputCanvas;
  options: FullPageCaptureOptions;
  abortSignal?: AbortSignal | undefined;
}): Promise<{ blob: Blob; output: OutputCanvas }> {
  throwIfStitchFinalizationAborted(args.abortSignal);
  const policy = args.options.qualityPolicy ?? DEFAULT_FULL_PAGE_QUALITY_POLICY;
  const budget = resolveFullPageRasterBudget(policy);
  if (args.blob.size <= budget.maxEncodedBytes) return { blob: args.blob, output: args.output };
  const retryTargetBytes = Math.floor(budget.maxEncodedBytes * 0.94);
  const requestedRatio = Math.min(0.9, Math.sqrt(retryTargetBytes / args.blob.size));
  const nextScale = Math.max(budget.minOutputScale, args.output.outputScale * requestedRatio);
  if (nextScale >= args.output.outputScale) {
    logger.warn('Full-page encoded image cannot be reduced within policy', {
      encodedBytes: args.blob.size,
      maxEncodedBytes: budget.maxEncodedBytes,
      minOutputScale: budget.minOutputScale,
      outputScale: args.output.outputScale,
    });
    throw new Error(FULL_PAGE_FILE_BUDGET_ERROR);
  }
  const ratio = nextScale / args.output.outputScale;
  const oldCanvasBytes = args.output.canvas.width * args.output.canvas.height * BYTES_PER_PIXEL;
  const nextCanvasBytes =
    Math.floor(args.output.canvas.width * ratio) *
    Math.floor(args.output.canvas.height * ratio) *
    BYTES_PER_PIXEL;
  if (oldCanvasBytes + nextCanvasBytes > MAX_WORKING_SET_BYTES) {
    logger.warn('Full-page encoded-image retry exceeds working-set budget', {
      maxWorkingSetBytes: MAX_WORKING_SET_BYTES,
      nextCanvasBytes,
      oldCanvasBytes,
    });
    throw new Error(FULL_PAGE_RASTER_BUDGET_ERROR);
  }
  const nextCanvas = new OffscreenCanvas(
    Math.max(1, Math.floor(args.output.canvas.width * ratio)),
    Math.max(1, Math.floor(args.output.canvas.height * ratio))
  );
  const nextContext = nextCanvas.getContext('2d');
  if (!nextContext) throw new Error('Unable to create downscaled screenshot canvas');
  nextContext.drawImage(
    args.output.canvas,
    0,
    0,
    args.output.canvas.width,
    args.output.canvas.height,
    0,
    0,
    nextCanvas.width,
    nextCanvas.height
  );
  const nextOutput = { canvas: nextCanvas, context: nextContext, outputScale: nextScale };
  const encoded = await encodeCanvas(nextOutput, args.options, args.abortSignal);
  throwIfStitchFinalizationAborted(args.abortSignal);
  if (encoded.blob.size > budget.maxEncodedBytes) {
    logger.warn('Full-page encoded-image retry remains above file budget', {
      encodedBytes: encoded.blob.size,
      maxEncodedBytes: budget.maxEncodedBytes,
      outputHeight: nextOutput.canvas.height,
      outputWidth: nextOutput.canvas.width,
    });
    throw new Error(FULL_PAGE_FILE_BUDGET_ERROR);
  }
  return { blob: encoded.blob, output: nextOutput };
}

export async function createStreamingFullPageStitcher(args: {
  firstFrameDataUrl: string;
  geometry: FullPageCaptureGeometry;
  qualityPolicy?: FullPageQualityPolicy;
  frozenExtentWarning: boolean;
  warnings: string[];
}): Promise<StreamingFullPageStitcher> {
  const firstBitmap = await decodeFrame(args.firstFrameDataUrl);
  const nativeScale = args.geometry.devicePixelRatio;
  const requiredFrameWidth = args.geometry.viewportWidth * nativeScale;
  const requiredFrameHeight = args.geometry.viewportHeight * nativeScale;
  if (
    !Number.isFinite(nativeScale) ||
    nativeScale <= 0 ||
    firstBitmap.width + 1 < requiredFrameWidth ||
    firstBitmap.height + 1 < requiredFrameHeight
  ) {
    firstBitmap.close();
    throw new Error('Full-page screenshot tile does not cover the prepared viewport');
  }
  const nativeSource: NativeFrameSource = {
    frameHeight: firstBitmap.height,
    frameWidth: firstBitmap.width,
    scale: nativeScale,
  };
  let output: OutputCanvas;
  try {
    output = createOutputCanvas(
      args.geometry,
      resolveOutputScale({
        geometry: args.geometry,
        nativeScale,
        ...(args.qualityPolicy === undefined ? {} : { qualityPolicy: args.qualityPolicy }),
        tileHeight: firstBitmap.height,
        tileWidth: firstBitmap.width,
      })
    );
  } catch (error) {
    firstBitmap.close();
    throw error;
  }
  let frameCount = 0;
  let firstPending: ImageBitmap | null = firstBitmap;
  let frozenExtentWarning = args.frozenExtentWarning;

  return {
    dispose() {
      firstPending?.close();
      firstPending = null;
    },
    async drawFrame(dataUrl, plan, state) {
      const bitmap = firstPending ?? (await decodeFrame(dataUrl));
      firstPending = null;
      try {
        assertScaleStable(bitmap, state.geometry, nativeSource);
        frozenExtentWarning ||= state.frozenExtentWarning;
        const drawArgs = { bitmap, nativeSource, output, plan, state };
        if (state.geometry.rootKind === 'element') {
          drawInternalScrollerTile({ ...drawArgs, firstFrame: frameCount === 0 });
        } else {
          drawDocumentTile(drawArgs);
        }
        frameCount += 1;
      } finally {
        bitmap.close();
      }
    },
    async finish(options, abortSignal) {
      if (firstPending) {
        firstPending.close();
        throw new Error('Full-page screenshot produced no tiles');
      }
      throwIfStitchFinalizationAborted(abortSignal);
      const encoded = await encodeCanvas(output, options, abortSignal);
      const finalized = await downscaleOversizedEncoding({
        ...encoded,
        abortSignal,
        options,
        output,
      });
      throwIfStitchFinalizationAborted(abortSignal);
      const metadata: FullPageCaptureMetadata = {
        captureGeometry: args.geometry,
        cssHeight: args.geometry.outputHeight,
        cssWidth: args.geometry.outputWidth,
        downscaled: finalized.output.outputScale < nativeScale,
        frozenExtentWarning,
        outputHeight: finalized.output.canvas.height,
        outputScale: finalized.output.outputScale,
        outputWidth: finalized.output.canvas.width,
        warnings: [
          ...args.warnings,
          ...(frozenExtentWarning ? ['Page extent grew after capture was frozen'] : []),
        ],
      };
      const dataUrl = await blobToDataURL(finalized.blob);
      throwIfStitchFinalizationAborted(abortSignal);
      return { dataUrl, metadata };
    },
  };
}
