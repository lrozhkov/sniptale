import type { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProjectExportSettings } from '../types/export';

/** Export quality targets are independent of recording bitrate and preserve the requested pixel rate. */
export function getVideoExportQuantizer(codec: string, quality: VideoQuality): number | null {
  if (codec === 'vp8') return null;
  const targets =
    codec === 'vp9' || codec.startsWith('vp09')
      ? { LOW: 40, MEDIUM: 32, HIGH: 24, ULTRA: 20 }
      : { LOW: 28, MEDIUM: 24, HIGH: 20, ULTRA: 16 };
  return targets[quality];
}

/** Prefer content-dependent size; retain the existing bitrate budget when quantizers are unsupported. */
export function getVideoExportConfigCandidates(config: VideoEncoderConfig): VideoEncoderConfig[] {
  const fallback = { ...config, latencyMode: 'quality' as const };
  if (config.codec === 'vp8') return [fallback];
  const { bitrate: _bitrate, ...base } = fallback;
  return [{ ...base, bitrateMode: 'quantizer' }, fallback];
}

/** A browser must preserve the requested dimensions, timing and rate-control mode to admit export. */
export function supportsVideoExportConfig(
  requested: VideoEncoderConfig,
  result: VideoEncoderSupport
): boolean {
  const effective = result.config;
  return !!(
    result.supported &&
    effective &&
    effective.codec === requested.codec &&
    effective.width === requested.width &&
    effective.height === requested.height &&
    effective.framerate === requested.framerate &&
    effective.bitrate === requested.bitrate &&
    effective.bitrateMode === requested.bitrateMode
  );
}

/** Codec-specific quantizers are ignored by WebCodecs when the selected config uses bitrate control. */
export function getProjectExportFrameOptions(
  settings: VideoProjectExportSettings
): VideoEncoderEncodeOptions {
  const codec = settings.format === 'MP4' ? settings.mp4VideoCodec : settings.webmVideoCodec;
  if (codec === 'VP8') return {};
  const quantizer = getVideoExportQuantizer(codec === 'VP9' ? 'vp9' : 'avc', settings.quality);
  if (quantizer === null) return {};
  if (codec === 'HEVC') return { hevc: { quantizer } };
  if (codec === 'VP9') return { vp9: { quantizer } };
  return { avc: { quantizer } };
}
