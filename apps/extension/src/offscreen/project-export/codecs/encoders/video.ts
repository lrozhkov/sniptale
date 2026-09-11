import {
  type VideoMp4Codec as VideoMp4CodecType,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import { translate } from '../../../../platform/i18n';
import { MP4_CODEC_PRIORITY, MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC } from '../constants';
import type { SupportedMp4VideoEncoder } from '../types';
import { resolveExportTargetBitrate } from '../bitrate';
import { buildMissingEncoderMessage, recordEncoderAttemptFailure } from './messages';

type VideoEncoderSupportResult = Awaited<ReturnType<typeof VideoEncoder.isConfigSupported>>;
type VideoEncoderCandidate =
  (typeof MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC)[VideoMp4CodecType][number];

function getVideoEncoderBitrate(settings: VideoProjectExportSettings): number {
  return resolveExportTargetBitrate(settings);
}

// Codec levels constrain frame size and processing rate even when the hardware supports the family.
function resolveCodecLevel(codec: string, settings: VideoProjectExportSettings): string {
  const pixels = settings.width * settings.height;
  if (codec.startsWith('avc1')) {
    const blocks = Math.ceil(settings.width / 16) * Math.ceil(settings.height / 16);
    const levels = [
      { level: 31, frame: 3600, rate: 108000 },
      { level: 40, frame: 8192, rate: 245760 },
      { level: 42, frame: 8704, rate: 522240 },
      { level: 50, frame: 22080, rate: 589824 },
      { level: 51, frame: 36864, rate: 983040 },
      { level: 52, frame: 36864, rate: 2073600 },
      { level: 60, frame: 139264, rate: 4177920 },
    ];
    const required = levels.find(
      (entry) => blocks <= entry.frame && blocks * settings.fps <= entry.rate
    );
    const level = Math.max(parseInt(codec.slice(-2), 16), required?.level ?? 62);
    return codec.slice(0, -2) + level.toString(16).padStart(2, '0');
  }
  if (codec.startsWith('hvc1')) {
    const levels = [
      { level: 123, frame: 2228224, rate: 133693440 },
      { level: 150, frame: 8912896, rate: 267386880 },
      { level: 153, frame: 8912896, rate: 534773760 },
      { level: 156, frame: 8912896, rate: 1069547520 },
      { level: 183, frame: 35651584, rate: 2139095040 },
    ];
    const required = levels.find(
      (entry) => pixels <= entry.frame && pixels * settings.fps <= entry.rate
    );
    return codec.replace(/\.L\d+\./, `.L${required?.level ?? 186}.`);
  }
  return codec;
}

function createVideoEncoderConfig(params: {
  bitrate: number;
  candidate: VideoEncoderCandidate;
  settings: VideoProjectExportSettings;
}): VideoEncoderConfig {
  const { bitrate, candidate, settings } = params;

  return {
    codec: resolveCodecLevel(candidate.codec, settings),
    width: settings.width,
    height: settings.height,
    bitrate,
    bitrateMode: 'variable',
    framerate: settings.fps,
    hardwareAcceleration: candidate.hardwareAcceleration,
    ...(candidate.avcFormat ? { avc: { format: candidate.avcFormat } } : {}),
  };
}

function createSupportedEncoder(params: {
  candidate: VideoEncoderCandidate;
  codec: VideoMp4CodecType;
  config: VideoEncoderConfig;
  label: string;
}): SupportedMp4VideoEncoder {
  return {
    codec: params.codec,
    muxerCodec: params.candidate.muxerCodec,
    label: params.label,
    config: params.config,
  };
}

function getValidatedEffectiveVideoEncoderConfig(
  requested: VideoEncoderConfig,
  support: VideoEncoderSupportResult
): VideoEncoderConfig | null {
  const effective = support.config;
  if (
    !support.supported ||
    !effective ||
    effective.codec !== requested.codec ||
    effective.width !== requested.width ||
    effective.height !== requested.height ||
    effective.framerate !== requested.framerate ||
    effective.bitrate !== requested.bitrate ||
    effective.bitrateMode !== 'variable'
  ) {
    return null;
  }

  return effective;
}

async function probeSupportedMp4VideoEncoder(
  settings: VideoProjectExportSettings,
  codec: VideoMp4CodecType
): Promise<SupportedMp4VideoEncoder | null> {
  const candidates = MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC[codec];
  const attempts: string[] = [];
  const bitrate = getVideoEncoderBitrate(settings);

  for (const candidate of candidates) {
    const label = translate(candidate.labelKey);
    const config = createVideoEncoderConfig({ bitrate, candidate, settings });

    try {
      const support: VideoEncoderSupportResult = await VideoEncoder.isConfigSupported(config);
      const effectiveConfig = getValidatedEffectiveVideoEncoderConfig(config, support);
      if (effectiveConfig) {
        return createSupportedEncoder({ candidate, codec, config: effectiveConfig, label });
      }

      recordEncoderAttemptFailure(attempts, label, candidate.codec);
    } catch (error) {
      recordEncoderAttemptFailure(attempts, label, candidate.codec, error);
    }
  }

  if (attempts.length === 0) {
    return null;
  }

  throw new Error(
    buildMissingEncoderMessage({
      attempts,
      prefixKey: 'offscreenExport.supportedVideoEncoderMissingPrefix',
      suffixKey: 'offscreenExport.supportedVideoEncoderMissingSuffix',
    })
  );
}

export async function getSupportedMp4VideoCodecProfiles(
  settings: VideoProjectExportSettings,
  codecs: readonly VideoMp4CodecType[] = MP4_CODEC_PRIORITY
): Promise<SupportedMp4VideoEncoder[]> {
  const profiles: SupportedMp4VideoEncoder[] = [];

  for (const codec of codecs) {
    try {
      const profile = await probeSupportedMp4VideoEncoder(settings, codec);
      if (profile) {
        profiles.push(profile);
      }
    } catch {
      // Capabilities are codec-scoped; unsupported codecs stay absent from the available list.
    }
  }

  return profiles;
}

export async function getSupportedMp4VideoEncoder(
  settings: VideoProjectExportSettings,
  codec: VideoMp4CodecType
): Promise<SupportedMp4VideoEncoder> {
  const profile = await probeSupportedMp4VideoEncoder(settings, codec);
  if (profile) {
    return profile;
  }

  throw new Error(
    buildMissingEncoderMessage({
      attempts: MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC[codec].map(
        (candidate) => `${translate(candidate.labelKey)} [${candidate.codec}]`
      ),
      prefixKey: 'offscreenExport.supportedVideoEncoderMissingPrefix',
      suffixKey: 'offscreenExport.supportedVideoEncoderMissingSuffix',
    })
  );
}
