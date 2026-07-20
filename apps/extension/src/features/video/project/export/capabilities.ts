import {
  VideoExportFormat,
  VideoMp4Codec,
  type VideoExportCapabilities,
  type VideoExportFormatCapability,
  type VideoMp4CodecCapability,
  type VideoProjectExportSettings,
} from '../types/index';

const MP4_CODEC_PRIORITY: readonly VideoMp4Codec[] = [
  VideoMp4Codec.AVC,
  VideoMp4Codec.HEVC,
  VideoMp4Codec.VP9,
] as const;

function withoutMp4VideoCodec(settings: VideoProjectExportSettings): VideoProjectExportSettings {
  const { mp4VideoCodec: _mp4VideoCodec, ...rest } = settings;
  return rest;
}

export function getDefaultMp4VideoCodec(
  codecs: readonly Pick<VideoMp4CodecCapability, 'available' | 'codec'>[]
): VideoMp4Codec | null {
  for (const codec of MP4_CODEC_PRIORITY) {
    if (codecs.some((entry) => entry.available && entry.codec === codec)) {
      return codec;
    }
  }

  return null;
}

export function getAvailableMp4VideoCodecs(capabilities: VideoExportCapabilities): VideoMp4Codec[] {
  return capabilities.mp4Codecs.filter((codec) => codec.available).map((codec) => codec.codec);
}

function isExportFormatAvailable(
  capabilities: VideoExportCapabilities,
  format: VideoExportFormat
): boolean {
  return capabilities.formats.some((entry) => entry.format === format && entry.available);
}

export function normalizeVideoProjectExportSettings(
  settings: VideoProjectExportSettings,
  capabilities?: VideoExportCapabilities | null
): VideoProjectExportSettings {
  if (!capabilities) {
    return settings.format === VideoExportFormat.MP4 ? settings : withoutMp4VideoCodec(settings);
  }

  const availableFormats = capabilities.formats.filter((entry) => entry.available);
  const fallbackFormat = availableFormats[0]?.format ?? VideoExportFormat.WEBM;
  const nextFormat =
    settings.format === VideoExportFormat.MP4 &&
    !isExportFormatAvailable(capabilities, VideoExportFormat.MP4)
      ? fallbackFormat
      : settings.format;

  if (nextFormat !== VideoExportFormat.MP4) {
    return withoutMp4VideoCodec({
      ...settings,
      format: nextFormat,
    });
  }

  const availableMp4Codecs = getAvailableMp4VideoCodecs(capabilities);
  const nextCodec =
    settings.mp4VideoCodec && availableMp4Codecs.includes(settings.mp4VideoCodec)
      ? settings.mp4VideoCodec
      : (capabilities.defaultMp4VideoCodec ?? getDefaultMp4VideoCodec(capabilities.mp4Codecs));

  return nextCodec
    ? {
        ...settings,
        format: nextFormat,
        mp4VideoCodec: nextCodec,
      }
    : withoutMp4VideoCodec({
        ...settings,
        format: nextFormat,
      });
}

export function createVideoExportCapabilities(
  args: {
    defaultMp4VideoCodec?: VideoMp4Codec | null;
    formats?: readonly VideoExportFormatCapability[];
    mp4Codecs?: readonly VideoMp4CodecCapability[];
  } = {}
): VideoExportCapabilities {
  const formats = [...(args.formats ?? [])];
  const mp4Codecs = [...(args.mp4Codecs ?? [])];

  return {
    formats,
    mp4Codecs,
    defaultMp4VideoCodec: args.defaultMp4VideoCodec ?? getDefaultMp4VideoCodec(mp4Codecs) ?? null,
  };
}
