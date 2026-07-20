import type { ArrayBufferTarget } from 'mp4-muxer';

import type { SupportedMp4AudioEncoder, SupportedMp4VideoEncoder } from '../../codecs/types';
import type { renderOfflineAudioMix } from '../../offline-audio/mix/render/orchestrate';

export interface Mp4MuxerLike {
  addAudioChunk(chunk: unknown, meta: unknown): void;
  addVideoChunk(chunk: unknown, meta: unknown): void;
  finalize(): void;
}

export type Mp4Pipeline = {
  audioProfile: SupportedMp4AudioEncoder | null;
  fallbackNotes: string[];
  mixedAudio: Awaited<ReturnType<typeof renderOfflineAudioMix>>;
  muxer: Mp4MuxerLike;
  target: ArrayBufferTarget;
  videoProfile: SupportedMp4VideoEncoder;
};

export type Mp4PipelineProfiles = Pick<
  Mp4Pipeline,
  'audioProfile' | 'fallbackNotes' | 'mixedAudio' | 'videoProfile'
>;
