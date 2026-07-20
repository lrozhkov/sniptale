import {
  type VideoMp4Codec as VideoMp4CodecType,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import { translate } from '../../../../platform/i18n';
import { MP4_CODEC_PRIORITY, MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC } from '../constants';
import type { SupportedMp4VideoEncoder } from '../types';
import { scaleBitrate } from '../bitrate';
import { buildMissingEncoderMessage, recordEncoderAttemptFailure } from './messages';

type VideoEncoderSupportResult = Awaited<ReturnType<typeof VideoEncoder.isConfigSupported>>;
type VideoEncoderCandidate =
  (typeof MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC)[VideoMp4CodecType][number];

function getVideoEncoderBitrate(
  settings: VideoProjectExportSettings,
  codec: VideoMp4CodecType
): number {
  return Math.max(
    1_200_000,
    scaleBitrate(settings.quality, settings.width, settings.height, codec)
  );
}

function createVideoEncoderConfig(params: {
  bitrate: number;
  candidate: VideoEncoderCandidate;
  settings: VideoProjectExportSettings;
}): VideoEncoderConfig {
  const { bitrate, candidate, settings } = params;

  return {
    codec: candidate.codec,
    width: settings.width,
    height: settings.height,
    bitrate,
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
  support: VideoEncoderSupportResult;
}): SupportedMp4VideoEncoder {
  return {
    codec: params.codec,
    muxerCodec: params.candidate.muxerCodec,
    label: params.label,
    config: params.support.config ?? params.config,
  };
}

async function probeSupportedMp4VideoEncoder(
  settings: VideoProjectExportSettings,
  codec: VideoMp4CodecType
): Promise<SupportedMp4VideoEncoder | null> {
  const candidates = MP4_VIDEO_ENCODER_CANDIDATES_BY_CODEC[codec];
  const attempts: string[] = [];
  const bitrate = getVideoEncoderBitrate(settings, codec);

  for (const candidate of candidates) {
    const label = translate(candidate.labelKey);
    const config = createVideoEncoderConfig({ bitrate, candidate, settings });

    try {
      const support: VideoEncoderSupportResult = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        return createSupportedEncoder({ candidate, codec, config, label, support });
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
