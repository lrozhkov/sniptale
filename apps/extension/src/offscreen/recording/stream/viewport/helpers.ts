import { resolveRecordingSafeDimension, resolveRecordingSafeSize } from '../../dimensions';

type ViewportPresetCropGeometry = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
};

type CanvasCropGeometry = {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
};

export type ViewportPresetRuntimeState = {
  targetWidth: number;
  targetHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  drawFrozen: boolean;
  navigationEpoch: number;
};

type ViewportPresetContext = Pick<CanvasRenderingContext2D, 'clearRect' | 'drawImage'>;
type ViewportPresetCanvas = Pick<HTMLCanvasElement, 'width' | 'height'>;
type ViewportPresetVideo = CanvasImageSource & Pick<HTMLVideoElement, 'videoWidth' | 'videoHeight'>;
type FramePacer = {
  shouldRender: (nowMs: number) => boolean;
};

export function createViewportPresetRuntimeState(args: {
  targetResolution: { width: number; height: number };
  sourceSize: { width: number; height: number };
  viewportSizeInPixels?: { width: number; height: number };
}): ViewportPresetRuntimeState {
  const targetSize = resolveRecordingSafeSize(args.targetResolution);
  const viewportSize =
    args.viewportSizeInPixels === undefined
      ? resolveRecordingSafeSize(args.sourceSize)
      : resolveRecordingSafeSize(args.viewportSizeInPixels);

  return {
    targetWidth: targetSize.width,
    targetHeight: targetSize.height,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    drawFrozen: false,
    navigationEpoch: 0,
  };
}

export function updateViewportPresetRuntimeCrop(
  state: ViewportPresetRuntimeState,
  args: {
    targetResolution?: { width: number; height: number };
    viewportSizeInPixels?: { width: number; height: number };
  }
): void {
  const targetSize =
    args.targetResolution === undefined
      ? { width: state.targetWidth, height: state.targetHeight }
      : resolveRecordingSafeSize(args.targetResolution);
  const viewportSize =
    args.viewportSizeInPixels === undefined
      ? { width: state.viewportWidth, height: state.viewportHeight }
      : resolveRecordingSafeSize(args.viewportSizeInPixels);

  state.targetWidth = targetSize.width;
  state.targetHeight = targetSize.height;
  state.viewportWidth = viewportSize.width;
  state.viewportHeight = viewportSize.height;
}

export function updateViewportPresetDrawState(
  state: ViewportPresetRuntimeState,
  args: {
    frozen: boolean;
    navigationEpoch: number;
  }
): boolean {
  if (args.navigationEpoch < state.navigationEpoch) {
    return false;
  }

  state.navigationEpoch = args.navigationEpoch;
  state.drawFrozen = args.frozen;
  return true;
}

export function createFramePacer(frameRate: number): FramePacer {
  const frameIntervalMs = 1000 / Math.max(1, frameRate);
  let nextFrameAtMs = 0;

  return {
    shouldRender(nowMs: number) {
      if (nextFrameAtMs === 0 || nowMs >= nextFrameAtMs) {
        nextFrameAtMs =
          nextFrameAtMs === 0
            ? nowMs + frameIntervalMs
            : Math.max(nowMs, nextFrameAtMs) + frameIntervalMs;
        return true;
      }

      return false;
    },
  };
}

function clampCropOffset(offset: number, sourceSize: number): number {
  return Math.min(Math.max(0, offset), Math.max(0, sourceSize - 1));
}

function clampCropLength(length: number, remainingSourceSize: number): number {
  return Math.max(1, Math.min(length, Math.max(1, remainingSourceSize)));
}

export function resolveCanvasCropGeometry(args: {
  sourceSize: { width: number; height: number };
  cropRegion: { x: number; y: number; width: number; height: number };
  viewportSizeInPixels?: { width: number; height: number };
}): CanvasCropGeometry {
  const sourceWidth = resolveRecordingSafeDimension(args.sourceSize.width);
  const sourceHeight = resolveRecordingSafeDimension(args.sourceSize.height);
  const viewportWidth = Math.max(1, Math.round(args.viewportSizeInPixels?.width ?? sourceWidth));
  const viewportHeight = Math.max(1, Math.round(args.viewportSizeInPixels?.height ?? sourceHeight));
  const scaleX = sourceWidth / viewportWidth;
  const scaleY = sourceHeight / viewportHeight;
  const sourceX = clampCropOffset(Math.round(args.cropRegion.x * scaleX), sourceWidth);
  const sourceY = clampCropOffset(Math.round(args.cropRegion.y * scaleY), sourceHeight);
  const sourceWidthRemaining = sourceWidth - sourceX;
  const sourceHeightRemaining = sourceHeight - sourceY;
  const scaledCropWidth = Math.round(args.cropRegion.width * scaleX);
  const scaledCropHeight = Math.round(args.cropRegion.height * scaleY);
  const resolvedCropWidth = resolveRecordingSafeDimension(
    clampCropLength(scaledCropWidth, sourceWidthRemaining)
  );
  const resolvedCropHeight = resolveRecordingSafeDimension(
    clampCropLength(scaledCropHeight, sourceHeightRemaining)
  );

  return {
    sourceX,
    sourceY,
    sourceWidth: resolvedCropWidth,
    sourceHeight: resolvedCropHeight,
    targetWidth: resolvedCropWidth,
    targetHeight: resolvedCropHeight,
  };
}

/**
 * Resolves the source crop rectangle for viewport-emulation recordings.
 * The emulated viewport occupies the top-left portion of the captured tab stream,
 * while the output canvas must keep the requested preset resolution.
 */
export function resolveViewportPresetCropGeometry(args: {
  sourceSize: { width: number; height: number };
  targetResolution: { width: number; height: number };
  viewportSizeInPixels?: { width: number; height: number };
}): ViewportPresetCropGeometry {
  const sourceWidth = resolveRecordingSafeDimension(args.sourceSize.width);
  const sourceHeight = resolveRecordingSafeDimension(args.sourceSize.height);
  const targetSize = resolveRecordingSafeSize(args.targetResolution);
  const requestedViewportWidth = Math.max(
    1,
    resolveRecordingSafeDimension(args.viewportSizeInPixels?.width ?? sourceWidth)
  );
  const requestedViewportHeight = Math.max(
    1,
    resolveRecordingSafeDimension(args.viewportSizeInPixels?.height ?? sourceHeight)
  );

  return {
    sourceX: 0,
    sourceY: 0,
    sourceWidth: Math.min(requestedViewportWidth, sourceWidth),
    sourceHeight: Math.min(requestedViewportHeight, sourceHeight),
    targetWidth: targetSize.width,
    targetHeight: targetSize.height,
  };
}

export function drawViewportPresetFrame(args: {
  canvas: ViewportPresetCanvas;
  ctx: ViewportPresetContext;
  state: ViewportPresetRuntimeState;
  video: ViewportPresetVideo;
}): boolean {
  if (args.state.drawFrozen) {
    return false;
  }

  const geometry = resolveViewportPresetCropGeometry({
    sourceSize: {
      width: args.video.videoWidth || args.state.viewportWidth || args.state.targetWidth,
      height: args.video.videoHeight || args.state.viewportHeight || args.state.targetHeight,
    },
    targetResolution: {
      width: args.state.targetWidth,
      height: args.state.targetHeight,
    },
    viewportSizeInPixels: {
      width: args.state.viewportWidth,
      height: args.state.viewportHeight,
    },
  });

  args.ctx.clearRect(0, 0, args.canvas.width, args.canvas.height);
  args.ctx.drawImage(
    args.video,
    geometry.sourceX,
    geometry.sourceY,
    geometry.sourceWidth,
    geometry.sourceHeight,
    0,
    0,
    geometry.targetWidth,
    geometry.targetHeight
  );

  return true;
}
