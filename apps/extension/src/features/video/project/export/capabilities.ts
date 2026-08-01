import {
  VideoExportFormat,
  VideoMp4Codec,
  VideoWebmCodec,
  type VideoExportCapabilities,
  type VideoExportFormatCapability,
  type VideoMp4CodecCapability,
  type VideoProjectExportSettings,
  type VideoProjectExportSettingsPatch,
} from '../types/index';

const MP4_CODEC_PRIORITY: readonly VideoMp4Codec[] = [
  VideoMp4Codec.AVC,
  VideoMp4Codec.HEVC,
  VideoMp4Codec.VP9,
] as const;

function normalizeWebmSettings(settings: VideoProjectExportSettings): VideoProjectExportSettings {
  const { mp4VideoCodec: _mp4VideoCodec, webmVideoCodec, format: _format, ...rest } = settings;
  return {
    ...rest,
    format: VideoExportFormat.WEBM,
    webmVideoCodec: webmVideoCodec ?? VideoWebmCodec.VP9,
  };
}

function normalizeMp4Settings(
  settings: VideoProjectExportSettings,
  codec: VideoMp4Codec
): VideoProjectExportSettings {
  const {
    mp4VideoCodec: _mp4VideoCodec,
    webmVideoCodec: _webmVideoCodec,
    format: _format,
    ...rest
  } = settings;
  return {
    ...rest,
    format: VideoExportFormat.MP4,
    mp4VideoCodec: codec,
  };
}

export function mergeVideoProjectExportSettings(
  settings: VideoProjectExportSettings,
  patch: VideoProjectExportSettingsPatch
): VideoProjectExportSettings {
  const merged = { ...settings, ...patch };
  const { format, mp4VideoCodec, webmVideoCodec, ...base } = merged;
  return format === VideoExportFormat.WEBM
    ? {
        ...base,
        format,
        webmVideoCodec: webmVideoCodec ?? VideoWebmCodec.VP9,
      }
    : {
        ...base,
        format,
        mp4VideoCodec: mp4VideoCodec ?? VideoMp4Codec.AVC,
      };
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
    return settings.format === VideoExportFormat.MP4
      ? normalizeMp4Settings(settings, settings.mp4VideoCodec)
      : normalizeWebmSettings(settings);
  }

  const availableFormats = capabilities.formats.filter((entry) => entry.available);
  const fallbackFormat = availableFormats[0]?.format ?? VideoExportFormat.WEBM;
  const nextFormat =
    settings.format === VideoExportFormat.MP4 &&
    !isExportFormatAvailable(capabilities, VideoExportFormat.MP4)
      ? fallbackFormat
      : settings.format;

  if (nextFormat !== VideoExportFormat.MP4) {
    return normalizeWebmSettings(settings);
  }

  const availableMp4Codecs = getAvailableMp4VideoCodecs(capabilities);
  const nextCodec =
    settings.mp4VideoCodec && availableMp4Codecs.includes(settings.mp4VideoCodec)
      ? settings.mp4VideoCodec
      : (capabilities.defaultMp4VideoCodec ?? getDefaultMp4VideoCodec(capabilities.mp4Codecs));

  return nextCodec ? normalizeMp4Settings(settings, nextCodec) : normalizeWebmSettings(settings);
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
