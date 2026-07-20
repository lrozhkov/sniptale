import { createEffectAudioBufferCache } from '../../../../../../features/video/composition/effect-runtime';

const OFFLINE_AUDIO_CHANNELS = 2;
const OFFLINE_AUDIO_SAMPLE_RATE = 48_000;

export function createOfflineAudioMixContext(duration: number) {
  const totalFrames = Math.max(1, Math.ceil(Math.max(0.1, duration) * OFFLINE_AUDIO_SAMPLE_RATE));
  const offlineContext = new OfflineAudioContext(
    OFFLINE_AUDIO_CHANNELS,
    totalFrames,
    OFFLINE_AUDIO_SAMPLE_RATE
  );
  const decodeContext = new AudioContext({ sampleRate: OFFLINE_AUDIO_SAMPLE_RATE });

  return {
    decodeContext,
    decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
    offlineContext,
  };
}

export async function closeOfflineAudioMixContext(decodeContext: AudioContext): Promise<void> {
  await decodeContext.close().catch(() => undefined);
}
