import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
import { resolveDecoratedMediaFrame, insetMediaCanvas } from '../window-geometry';
import { fitVideoRect } from '../../review/geometry';
import { VideoMediaFitMode } from '../types';
import { resolveMediaClipTransformForFitMode } from './clip';

/** Fits the source first, then reduces decorative margins when aspect ratios leave large empty areas. */
export function getMediaFramingPresets(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  windowHeader?: WindowHeader,
  originalSource = { width: sourceWidth, height: sourceHeight }
) {
  if (
    ![sourceWidth, sourceHeight, canvasWidth, canvasHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return [];
  }
  const contained = resolveMediaClipTransformForFitMode(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    VideoMediaFitMode.CONTAIN,
    100,
    windowHeader,
    originalSource
  );
  const coverage = (contained.width * contained.height) / (canvasWidth * canvasHeight);
  const margin = Math.min(canvasWidth, canvasHeight) * (0.025 + 0.035 * coverage);
  const insetScale = Math.round(
    100 *
      Math.min(
        (canvasWidth - 2 * margin) / contained.width,
        (canvasHeight - 2 * margin) / contained.height
      )
  );
  return [
    { id: 'whole', fitMode: VideoMediaFitMode.CONTAIN, fitScalePercent: 100 },
    { id: 'background', fitMode: VideoMediaFitMode.CONTAIN, fitScalePercent: insetScale },
    { id: 'fill', fitMode: VideoMediaFitMode.COVER, fitScalePercent: 100 },
  ].map((preset) => ({
    ...preset,
    transform: resolveMediaClipTransformForFitMode(
      sourceWidth,
      sourceHeight,
      canvasWidth,
      canvasHeight,
      preset.fitMode,
      preset.fitScalePercent,
      windowHeader,
      originalSource
    ),
  }));
}

/** A measured inset must leave at least one available canvas pixel. */
export function maximumMediaPadding(canvasWidth: number, canvasHeight: number) {
  return Math.min(4096, Math.max(0, (Math.min(canvasWidth, canvasHeight) - 1) / 2));
}

/** Build one centered decorated frame; its ordinary transform remains the placement authority. */
export function resolveMediaPaddingLayout(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
  windowHeader?: WindowHeader,
  originalSource = { width: sourceWidth, height: sourceHeight }
) {
  if (
    ![sourceWidth, sourceHeight, canvasWidth, canvasHeight].every(
      (value) => Number.isFinite(value) && value > 0
    ) ||
    !Number.isFinite(padding) ||
    padding < 0 ||
    padding > maximumMediaPadding(canvasWidth, canvasHeight)
  )
    return null;
  const source = { width: sourceWidth, height: sourceHeight };
  const content = insetMediaCanvas({ width: canvasWidth, height: canvasHeight }, padding);
  const fit = (output: typeof source) => {
    if (!windowHeader) return fitVideoRect(output, source);
    const { headerHeight: _headerHeight, ...frame } = resolveDecoratedMediaFrame({
      sourceWidth: originalSource.width,
      sourceHeight: originalSource.height,
      contentWidth: sourceWidth,
      contentHeight: sourceHeight,
      windowHeader,
      frame: { x: 0, y: 0, width: output.width, height: output.height },
      fit: 'contain',
    });
    return frame;
  };
  const fitted = fit(content);
  const whole = fit({ width: canvasWidth, height: canvasHeight });
  return {
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: Math.max(1, Math.min(100, (100 * fitted.width) / whole.width)),
    transform: {
      ...fitted,
      x: content.x + fitted.x,
      y: content.y + fitted.y,
      rotation: 0,
      opacity: 1,
    },
  };
}
