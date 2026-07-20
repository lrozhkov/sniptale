import { closeOfflineAudioMixContext } from '../context';
import { buildOfflineAudioMixResult } from '../../result';
import { scheduleOfflineAudioClipMix } from '../../../schedule';
import { decodeClipAudioBuffer } from '../../../../clip-audio/index';
import { throwIfOfflineAudioMixAborted } from './abort';
import { executeOfflineAudioMixRender } from './execute';
import { type OfflineAudioRenderableClip } from '../../../../clip-audio/index';
import { type VideoProject } from '../../../../../../../features/video/project/types/model';
import type { EffectAudioBufferCache } from '../../../../../../../features/video/composition/effect-runtime';

export async function renderOfflineAudioMixLoop({
  clipsWithAudio,
  decodeContext,
  decodedBuffers,
  offlineContext,
  project,
  signal,
}: {
  clipsWithAudio: OfflineAudioRenderableClip[];
  decodeContext: AudioContext;
  decodedBuffers: EffectAudioBufferCache<AudioBuffer>;
  offlineContext: OfflineAudioContext;
  project: VideoProject;
  signal?: AbortSignal;
}): Promise<{
  buffer: AudioBuffer;
  settings: { numberOfChannels: number; sampleRate: number };
}> {
  try {
    return await executeOfflineAudioMixRender({
      clipsWithAudio,
      decodeContext,
      decodedBuffers,
      offlineContext,
      buildOfflineAudioMixResult,
      decodeClipAudioBuffer,
      project,
      scheduleOfflineAudioClipMix,
      throwIfAborted: throwIfOfflineAudioMixAborted,
      ...(signal === undefined ? {} : { signal }),
    });
  } finally {
    decodedBuffers.dispose();
    await closeOfflineAudioMixContext(decodeContext);
  }
}
