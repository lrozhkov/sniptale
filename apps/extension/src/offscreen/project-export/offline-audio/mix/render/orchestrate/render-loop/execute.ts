import { type OfflineAudioRenderableClip } from '../../../../clip-audio/index';
import { type VideoProject } from '../../../../../../../features/video/project/types/model';
import type { EffectAudioBufferCache } from '../../../../../../../features/video/composition/effect-runtime';

export async function executeOfflineAudioMixRender({
  buildOfflineAudioMixResult,
  clipsWithAudio,
  decodeContext,
  decodeClipAudioBuffer,
  decodedBuffers,
  offlineContext,
  project,
  scheduleOfflineAudioClipMix,
  signal,
  throwIfAborted,
}: {
  buildOfflineAudioMixResult: (renderedBuffer: AudioBuffer) => {
    buffer: AudioBuffer;
    settings: { numberOfChannels: number; sampleRate: number };
  };
  clipsWithAudio: OfflineAudioRenderableClip[];
  decodeContext: AudioContext;
  decodeClipAudioBuffer: (
    project: VideoProject,
    clip: OfflineAudioRenderableClip,
    decodedBuffers: EffectAudioBufferCache<AudioBuffer>,
    decodeContext: AudioContext
  ) => Promise<AudioBuffer>;
  decodedBuffers: EffectAudioBufferCache<AudioBuffer>;
  offlineContext: OfflineAudioContext;
  project: VideoProject;
  scheduleOfflineAudioClipMix: (
    offlineContext: OfflineAudioContext,
    clip: OfflineAudioRenderableClip,
    buffer: AudioBuffer
  ) => void;
  signal?: AbortSignal;
  throwIfAborted: (signal?: AbortSignal) => void;
}): Promise<{
  buffer: AudioBuffer;
  settings: { numberOfChannels: number; sampleRate: number };
}> {
  for (const clip of clipsWithAudio) {
    throwIfAborted(signal);

    const buffer = await decodeClipAudioBuffer(project, clip, decodedBuffers, decodeContext);
    scheduleOfflineAudioClipMix(offlineContext, clip, buffer);
  }

  return buildOfflineAudioMixResult(await offlineContext.startRendering());
}
