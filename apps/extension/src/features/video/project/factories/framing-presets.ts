import { VideoMediaFitMode } from '../types';
import { resolveMediaClipTransformForFitMode } from './clip';

/** Fits the source first, then reduces decorative margins when aspect ratios leave large empty areas. */
export function getMediaFramingPresets(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
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
