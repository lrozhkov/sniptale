import { resolveVideoExportDimensions } from '../../features/video/project/export/output-dimensions';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { parseQuickEditCanvas } from '../../features/video/review/advanced/canvas';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { VideoQuality, VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
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
      (settings.frameRateMode !== undefined &&
        settings.frameRateMode !== 'constant' &&
        settings.frameRateMode !== 'adaptive') ||
      (settings.frameRateMode === 'adaptive' && settings.frameRate !== 60) ||
      (settings.resolution !== undefined &&
        !Object.values(VideoResolutionPreset).includes(settings.resolution)) ||
      (settings.format !== undefined && settings.format !== 'mp4' && settings.format !== 'webm'))
  )
    throw new Error('Invalid export settings.');
  const format = settings?.format ?? index.container;
  const codecs = reviewOutputCodecs(index, format);
  const codec = settings?.codec ?? codecs[0] ?? null;
  const scene = resolveReviewSceneOutput(
    { width: index.width ?? 1920, height: index.height ?? 1080 },
    resolveQuickEditEffectiveState(advanced),
    settings?.resolution ?? VideoResolutionPreset.SOURCE
  );
  const dimensions = scene.output;
  const fps = settings?.frameRate || index.frameRate || 30;
  return {
    format,
    codec,
    ...dimensions,
    dimensionsSupported: scene.supported,
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

/** Fit the complete scene, including decoration, before probing or allocating the encoder canvas. */
export function resolveReviewSceneOutput(
  source: { width: number; height: number },
  settings: {
    canvas?: QuickEditAdvancedState['canvas'];
    background: QuickEditAdvancedState['background'];
    windowHeader?: QuickEditAdvancedState['windowHeader'];
  },
  resolution: VideoResolutionPreset
) {
  const base = settings.canvas ?? source;
  const scene = computeQuickEditSceneSize({
    source,
    canvas: base,
    background: settings.background,
    windowHeader: settings.windowHeader,
  });
  const output = resolveVideoExportDimensions(scene.width, scene.height, resolution);
  const scale = output.width / base.width;
  const canvas = { width: output.width, height: base.height * scale };
  const background = settings.background.enabled
    ? {
        ...settings.background,
        layout: {
          ...settings.background.layout,
          padding: settings.background.layout.padding * scale,
          cornerRadius: settings.background.layout.cornerRadius * scale,
        },
      }
    : settings.background;
  return {
    canvas,
    output,
    background,
    scale,
    supported: !settings.windowHeader || parseQuickEditCanvas(output) !== null,
  };
}
