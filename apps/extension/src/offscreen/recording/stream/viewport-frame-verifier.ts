import type {
  ViewportCalibrationColor,
  ViewportFrameVerification,
} from '@sniptale/runtime-contracts/video/types/viewport-calibration';
import type {
  CropRect,
  OutputSize,
  VerifiedViewportFrame,
  VerifyViewportFrame,
} from './crop-frame-gate';

const FRAME_TIMEOUT_MS = 4_000;
const COLOR_TOLERANCE = 46;

type Run = { fixed: number; from: number; length: number; to: number };

function matchesColor(
  pixels: Uint8ClampedArray,
  offset: number,
  color: ViewportCalibrationColor
): boolean {
  return (
    Math.abs(pixels[offset]! - color.red) <= COLOR_TOLERANCE &&
    Math.abs(pixels[offset + 1]! - color.green) <= COLOR_TOLERANCE &&
    Math.abs(pixels[offset + 2]! - color.blue) <= COLOR_TOLERANCE
  );
}

function findLongestVerticalRun(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  color: ViewportCalibrationColor,
  preferLast = false
): Run {
  let best: Run = { fixed: 0, from: 0, length: 0, to: -1 };
  for (let x = 0; x < width; x += 1) {
    let start = -1;
    for (let y = 0; y <= height; y += 1) {
      const matches = y < height && matchesColor(pixels, (y * width + x) * 4, color);
      if (matches && start < 0) start = y;
      if (!matches && start >= 0) {
        const length = y - start;
        if (length > best.length || (preferLast && length === best.length)) {
          best = { fixed: x, from: start, length, to: y - 1 };
        }
        start = -1;
      }
    }
  }
  return best;
}

function measureHorizontalSpanAt(
  pixels: Uint8ClampedArray,
  width: number,
  y: number,
  x: number,
  color: ViewportCalibrationColor
): number {
  if (!matchesColor(pixels, (y * width + x) * 4, color)) return 0;
  let from = x;
  let to = x;
  while (from > 0 && matchesColor(pixels, (y * width + from - 1) * 4, color)) from -= 1;
  while (to + 1 < width && matchesColor(pixels, (y * width + to + 1) * 4, color)) to += 1;
  return to - from + 1;
}

function hasHorizontalCoverage(args: {
  color: ViewportCalibrationColor;
  from: number;
  pixels: Uint8ClampedArray;
  to: number;
  width: number;
  yFrom: number;
  yTo: number;
}): boolean {
  const required = Math.floor((args.to - args.from + 1) * 0.7);
  for (let y = args.yFrom; y <= args.yTo; y += 1) {
    let matches = 0;
    for (let x = args.from; x <= args.to; x += 1) {
      if (matchesColor(args.pixels, (y * args.width + x) * 4, args.color)) matches += 1;
    }
    if (matches >= required) return true;
  }
  return false;
}

function resolveMarkedViewport(
  pixels: Uint8ClampedArray,
  sourceSize: OutputSize,
  verification: ViewportFrameVerification
): CropRect | null {
  const { width, height } = sourceSize;
  const left = findLongestVerticalRun(pixels, width, height, verification.pattern.colors.left);
  const right = findLongestVerticalRun(
    pixels,
    width,
    height,
    verification.pattern.colors.right,
    true
  );
  const minimumVertical = Math.max(48, Math.floor(height * 0.2));
  if (left.length < minimumVertical || right.length < minimumVertical) {
    return null;
  }
  const leftThickness = measureHorizontalSpanAt(
    pixels,
    width,
    Math.floor((left.from + left.to) / 2),
    left.fixed,
    verification.pattern.colors.left
  );
  const rightThickness = measureHorizontalSpanAt(
    pixels,
    width,
    Math.floor((right.from + right.to) / 2),
    right.fixed,
    verification.pattern.colors.right
  );
  const thickness = Math.min(leftThickness, rightThickness);
  const x = left.fixed;
  const rightEdge = right.fixed;
  const y = Math.min(left.from, right.from) - thickness;
  const bottomEdge = Math.max(left.to, right.to) + thickness;
  if (
    right.fixed <= left.fixed ||
    thickness <= 0 ||
    y < 0 ||
    bottomEdge >= height ||
    !hasHorizontalCoverage({
      color: verification.pattern.colors.top,
      from: x,
      pixels,
      to: rightEdge,
      width,
      yFrom: y,
      yTo: Math.min(y + thickness - 1, height - 1),
    }) ||
    !hasHorizontalCoverage({
      color: verification.pattern.colors.bottom,
      from: x,
      pixels,
      to: rightEdge,
      width,
      yFrom: Math.max(0, bottomEdge - thickness + 1),
      yTo: bottomEdge,
    })
  ) {
    return null;
  }
  const viewportRect = {
    height: bottomEdge - y + 1,
    width: rightEdge - x + 1,
    x,
    y,
  };
  if (
    viewportRect.width <= 0 ||
    viewportRect.height <= 0 ||
    viewportRect.x + viewportRect.width > width ||
    viewportRect.y + viewportRect.height > height
  ) {
    return null;
  }
  return viewportRect;
}

function hasCalibrationRuns(
  pixels: Uint8ClampedArray,
  sourceSize: OutputSize,
  verification: ViewportFrameVerification
): boolean {
  return resolveMarkedViewport(pixels, sourceSize, verification) !== null;
}

function hasExpectedEdgeResidue(args: {
  color: ViewportCalibrationColor;
  fixed: number;
  from: number;
  horizontal: boolean;
  pixels: Uint8ClampedArray;
  to: number;
  width: number;
}): boolean {
  let matches = 0;
  for (let variable = args.from; variable <= args.to; variable += 1) {
    const x = args.horizontal ? variable : args.fixed;
    const y = args.horizontal ? args.fixed : variable;
    if (matchesColor(args.pixels, (y * args.width + x) * 4, args.color)) matches += 1;
  }
  const length = args.to - args.from + 1;
  return matches >= Math.max(8, Math.ceil(length * 0.2));
}

function hasCalibrationResidue(
  pixels: Uint8ClampedArray,
  sourceSize: OutputSize,
  verification: ViewportFrameVerification & { expectedViewportRect?: CropRect }
): boolean {
  const rect = verification.expectedViewportRect;
  if (!rect) return hasCalibrationRuns(pixels, sourceSize, verification);
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  const edges = [
    {
      color: verification.pattern.colors.top,
      fixed: rect.y,
      from: rect.x,
      horizontal: true,
      to: right,
    },
    {
      color: verification.pattern.colors.bottom,
      fixed: bottom,
      from: rect.x,
      horizontal: true,
      to: right,
    },
    {
      color: verification.pattern.colors.left,
      fixed: rect.x,
      from: rect.y,
      horizontal: false,
      to: bottom,
    },
    {
      color: verification.pattern.colors.right,
      fixed: right,
      from: rect.y,
      horizontal: false,
      to: bottom,
    },
  ];
  return edges.some((edge) => hasExpectedEdgeResidue({ ...edge, pixels, width: sourceSize.width }));
}

export function createViewportFrameVerifier(video: HTMLVideoElement): VerifyViewportFrame {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Viewport frame verification canvas is unavailable');

  return (verification, isCurrent) =>
    new Promise<VerifiedViewportFrame>((resolve, reject) => {
      let callbackId: number | null = null;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let consecutiveCleanFrames = 0;
      const finish = (error: Error | null, result?: VerifiedViewportFrame) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
          video.cancelVideoFrameCallback(callbackId);
        }
        callbackId = null;
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const scheduleFrame = () => {
        if (settled) return;
        callbackId = video.requestVideoFrameCallback(inspectFrame);
      };
      const inspectFrame: VideoFrameRequestCallback = (_now, metadata) => {
        callbackId = null;
        if (settled) return;
        if (!isCurrent()) {
          finish(new Error('Viewport frame verification was superseded'));
          return;
        }
        if (
          verification.afterPresentedFrames !== undefined &&
          metadata.presentedFrames <= verification.afterPresentedFrames
        ) {
          scheduleFrame();
          return;
        }
        const sourceSize = { height: video.videoHeight, width: video.videoWidth };
        if (sourceSize.width <= 0 || sourceSize.height <= 0) {
          scheduleFrame();
          return;
        }
        if (canvas.width !== sourceSize.width) canvas.width = sourceSize.width;
        if (canvas.height !== sourceSize.height) canvas.height = sourceSize.height;
        context.drawImage(video, 0, 0, sourceSize.width, sourceSize.height);
        const pixels = context.getImageData(0, 0, sourceSize.width, sourceSize.height).data;
        if (verification.phase === 'marked') {
          const viewportRect = resolveMarkedViewport(pixels, sourceSize, verification);
          if (viewportRect) {
            finish(null, { presentedFrames: metadata.presentedFrames, sourceSize, viewportRect });
            return;
          }
        } else if (!hasCalibrationResidue(pixels, sourceSize, verification)) {
          consecutiveCleanFrames += 1;
          if (consecutiveCleanFrames >= 2) {
            finish(null, {
              presentedFrames: metadata.presentedFrames,
              sourceSize,
              viewportRect: { height: sourceSize.height, width: sourceSize.width, x: 0, y: 0 },
            });
            return;
          }
        } else {
          consecutiveCleanFrames = 0;
        }
        scheduleFrame();
      };
      timeoutId = setTimeout(
        () =>
          finish(
            new Error(`Timed out waiting for a verified ${verification.phase} viewport frame`)
          ),
        FRAME_TIMEOUT_MS
      );
      scheduleFrame();
    });
}
