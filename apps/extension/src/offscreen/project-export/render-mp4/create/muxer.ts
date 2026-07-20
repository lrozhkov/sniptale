import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import type { SupportedMp4AudioEncoder, SupportedMp4VideoEncoder } from '../../codecs/types';
import type { Mp4MuxerLike } from './types';

type Mp4PipelineProfiles = {
  audioProfile: SupportedMp4AudioEncoder | null;
  fallbackNotes: string[];
  mixedAudio: { settings: { numberOfChannels: number; sampleRate: number } } | null;
  videoProfile: SupportedMp4VideoEncoder;
};

export function buildMp4Muxer(
  profiles: Mp4PipelineProfiles,
  settings: VideoProjectExportSettings
): { muxer: Mp4MuxerLike; target: ArrayBufferTarget } {
  const target = new ArrayBufferTarget();
  const muxerOptions = {
    target,
    video: {
      codec: profiles.videoProfile.muxerCodec,
      width: settings.width,
      height: settings.height,
      frameRate: settings.fps,
    },
    fastStart: 'in-memory' as const,
    firstTimestampBehavior: 'offset' as const,
    ...(profiles.audioProfile && profiles.mixedAudio
      ? {
          audio: {
            codec: profiles.audioProfile.muxerCodec,
            numberOfChannels: profiles.mixedAudio.settings.numberOfChannels,
            sampleRate: profiles.mixedAudio.settings.sampleRate,
          },
        }
      : {}),
  };

  return {
    target,
    muxer: new Muxer(muxerOptions),
  };
}
