import {
  createVideoExportCapabilities,
  getDefaultMp4VideoCodec,
} from '../../features/video/project/export/capabilities';
import {
  VideoExportCapabilityReason,
  VideoExportFormat,
  VideoMp4Codec,
  type VideoExportCapabilities,
  type VideoProjectExportSettings,
} from '../../features/video/project/types/export';
import { getSupportedMp4VideoCodecProfiles } from './codecs';
import type { SupportedMp4VideoEncoder } from './codecs/types';

export async function getProjectExportCapabilities(
  settings: VideoProjectExportSettings
): Promise<VideoExportCapabilities> {
  const webmAvailable = typeof MediaRecorder !== 'undefined';
  const videoEncoderAvailable = typeof VideoEncoder !== 'undefined';
  const supportedMp4Profiles: SupportedMp4VideoEncoder[] = videoEncoderAvailable
    ? await getSupportedMp4VideoCodecProfiles(settings)
    : [];
  const supportedCodecSet = new Set(supportedMp4Profiles.map((profile) => profile.codec));
  const mp4Codecs = [VideoMp4Codec.AVC, VideoMp4Codec.HEVC, VideoMp4Codec.VP9].map((codec) => ({
    codec,
    available: supportedCodecSet.has(codec),
    ...(supportedCodecSet.has(codec)
      ? {}
      : {
          reason: videoEncoderAvailable
            ? VideoExportCapabilityReason.CODEC_UNSUPPORTED
            : VideoExportCapabilityReason.VIDEO_ENCODER_UNAVAILABLE,
        }),
  }));

  return createVideoExportCapabilities({
    formats: [
      { format: VideoExportFormat.MP4, available: supportedCodecSet.size > 0 },
      { format: VideoExportFormat.WEBM, available: webmAvailable },
    ],
    mp4Codecs,
    defaultMp4VideoCodec: getDefaultMp4VideoCodec(mp4Codecs),
  });
}
