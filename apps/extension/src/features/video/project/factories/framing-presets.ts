import type { WindowHeader } from '@sniptale/runtime-contracts/window-header';
import { decoratedMediaSourceSize, insetMediaCanvas } from '../window-geometry';
import { fitVideoRect } from '../../review/geometry';
import { VideoMediaFitMode } from '../types';
import { resolveMediaClipTransformForFitMode } from './clip';

/** Fits the source first, then reduces decorative margins when aspect ratios leave large empty areas. */
export function getMediaFramingPresets(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  windowHeader?: WindowHeader
) {
  if (
    ![sourceWidth, sourceHeight, canvasWidth, canvasHeight].every(
      (value) => Number.isFinite(value) && value > 0
    )
  ) {
    return [];
  }
  const decorated = decoratedMediaSourceSize(sourceWidth, sourceHeight, windowHeader);
  sourceWidth = decorated.width;
  sourceHeight = decorated.height;
  const contained = resolveMediaClipTransformForFitMode(
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
    VideoMediaFitMode.CONTAIN
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
      preset.fitScalePercent
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
  windowHeader?: WindowHeader
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
  const source = decoratedMediaSourceSize(sourceWidth, sourceHeight, windowHeader);
  const content = insetMediaCanvas({ width: canvasWidth, height: canvasHeight }, padding);
  const fitted = fitVideoRect(content, source);
  const whole = fitVideoRect({ width: canvasWidth, height: canvasHeight }, source);
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
