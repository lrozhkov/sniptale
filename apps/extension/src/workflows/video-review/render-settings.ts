import {
  resolveVideoOutputDimensions,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ReviewMediaIndex, ReviewRenderSettings } from './media-index';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { resolveReviewRenderBitrate, type ReviewOutputCodec } from './render-codec';

export { resolveReviewRenderBitrate, resolveReviewVideoEncoderConfig } from './render-codec';

/** The output profile is independent of the source container and preserves the scene aspect ratio. */
export function resolveReviewOutputProfile(
  index: ReviewMediaIndex,
  advanced: QuickEditAdvancedState,
  settings?: ReviewRenderSettings
) {
  if (
    settings &&
    (!Object.values(VideoQuality).includes(settings.quality) ||
      ![0, 24, 30, 60].includes(settings.frameRate) ||
      (settings.resolution !== undefined &&
        !Object.values(VideoResolutionPreset).includes(settings.resolution)) ||
      (settings.format !== undefined && settings.format !== 'mp4' && settings.format !== 'webm'))
  )
    throw new Error('Invalid export settings.');
  const format = settings?.format ?? index.container;
  const codecs = reviewOutputCodecs(index, format);
  const codec = settings?.codec ?? codecs[0] ?? null;
  const scene =
    advanced.ui.mode === 'advanced' && advanced.canvas
      ? advanced.canvas
      : { width: index.width ?? 1920, height: index.height ?? 1080 };
  const dimensions = resolveVideoOutputDimensions(
    scene.width,
    scene.height,
    settings?.resolution ?? VideoResolutionPreset.SOURCE
  );
  const fps = settings?.frameRate || index.frameRate || 30;
  return {
    format,
    codec,
    ...dimensions,
    fps,
    bitrate: resolveReviewRenderBitrate({ ...dimensions, fps }, settings?.quality),
  };
}

/** Admitted codecs per container; no source-codec substitution for an explicit unsupported choice. */
export function reviewOutputCodecs(
  index: ReviewMediaIndex,
  format: 'mp4' | 'webm'
): ReviewOutputCodec[] {
  const allowed: readonly ReviewOutputCodec[] =
    format === 'mp4' ? ['avc', 'hevc', 'vp9'] : ['vp9', 'vp8'];
  const probed =
    index.outputCodecs?.[format] ??
    (format === index.container
      ? (index.supportedVideoCodecs ??
        (index.processedVideoCodec ? [index.processedVideoCodec] : []))
      : []);
  return allowed.filter((codec) => probed.includes(codec));
}
