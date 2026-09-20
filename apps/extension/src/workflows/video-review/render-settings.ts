import {
  resolveVideoTargetBitrate,
  VideoQuality,
} from '@sniptale/runtime-contracts/video/types/types';

/** Re-encoding needs headroom, but sparse screen recordings need no camera-video bitrate. */
export function resolveReviewRenderBitrate(
  source: {
    videoBitrate?: number | undefined;
    width?: number;
    height?: number;
    frameRate?: number;
  },
  output: { width: number; height: number; fps: number },
  quality: 'standard' | 'high' = 'standard'
): number {
  const budget = resolveVideoTargetBitrate({
    ...output,
    quality: quality === 'high' ? VideoQuality.HIGH : VideoQuality.MEDIUM,
  });
  if (
    quality === 'high' ||
    !source.videoBitrate ||
    !Number.isFinite(source.videoBitrate) ||
    source.videoBitrate <= 0
  )
    return budget;
  const pixels =
    source.width && source.height
      ? (output.width * output.height) / (source.width * source.height)
      : 1;
  const frames = source.frameRate && source.frameRate > 0 ? output.fps / source.frameRate : 1;
  return Math.round(
    Math.min(budget, Math.max(500_000, source.videoBitrate * 1.5 * pixels * frames))
  );
}
