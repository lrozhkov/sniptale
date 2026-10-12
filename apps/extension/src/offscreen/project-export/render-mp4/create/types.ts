import type { BufferTarget } from 'mediabunny';

import type { SupportedMp4AudioEncoder, SupportedMp4VideoEncoder } from '../../codecs/types';
import type { renderOfflineAudioMix } from '../../offline-audio/mix/render/orchestrate';

export interface Mp4MuxerLike {
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void>;
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void>;
  finalize(): Promise<void>;
  cancel(): Promise<void>;
}

export type Mp4Pipeline = {
  audioProfile: SupportedMp4AudioEncoder | null;
  fallbackNotes: string[];
  mixedAudio: Awaited<ReturnType<typeof renderOfflineAudioMix>>;
  muxer: Mp4MuxerLike;
  target: BufferTarget;
  videoProfile: SupportedMp4VideoEncoder;
};

export type Mp4PipelineProfiles = Pick<
  Mp4Pipeline,
  'audioProfile' | 'fallbackNotes' | 'mixedAudio' | 'videoProfile'
>;
