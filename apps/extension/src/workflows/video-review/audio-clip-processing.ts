import { readAudioRuntimeAsset } from '../../features/video/audio/effects/browser-assets';
import type { AudioProcessing } from '@sniptale/runtime-contracts/audio-effects';
import {
  prepareAudioProcessing,
  type AudioDspPreparation,
} from '../../features/video/audio/effects/assets';
import {
  createAudioProcessingRenderer,
  type AudioProcessingRenderer,
} from '../../features/video/audio/effects/prepare';
import {
  createCanonicalAudioSource,
  CANONICAL_AUDIO_RATE,
} from '../../features/video/audio/effects/source';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';
import { readReviewAudioClipRange, type ReviewAudioClipInput } from './audio-clip-source';

/** Inactive authored values preserve the existing exact bypass and its native sample clock. */
export function hasReviewAudioProcessing(value: AudioProcessing | undefined): boolean {
  return Boolean(
    value &&
    !value.bypassed &&
    (value.denoise?.enabled ||
      (value.pitch?.enabled && value.pitch.semitones !== 0) ||
      value.effects.some((effect) => effect.enabled && effect.wet > 0))
  );
}

/** Owns the processed placement; the caller retains decoder and project ownership. */
export async function createReviewProcessedClip(
  entry: Pick<
    QuickEditAudioPlanEntry,
    'audioProcessing' | 'sourceOffset' | 'duration' | 'playbackRate'
  >,
  input: ReviewAudioClipInput,
  signal: AbortSignal,
  readAsset: AudioDspPreparation['readAsset'] = (asset) => readAudioRuntimeAsset(asset, signal)
): Promise<AudioProcessingRenderer> {
  signal.throwIfAborted();
  if (!entry.audioProcessing) throw new Error('Audio processing settings are missing.');
  const channels = input.numberOfChannels;
  if (channels !== 1 && channels !== 2)
    throw new Error('Audio processing supports mono and stereo sources only.');
  const rate = entry.playbackRate ?? 1;
  const checkCancelled = () => signal.throwIfAborted();
  const processors = await prepareAudioProcessing(entry.audioProcessing, {
    readAsset,
    checkCancelled,
  });
  checkCancelled();
  const source = createReviewAudioClipCanonicalSource(entry, input, signal);
  let lastYield = performance.now();
  const renderer = await createAudioProcessingRenderer({
    source,
    processors,
    rate,
    durationFrames: Math.round(entry.duration * CANONICAL_AUDIO_RATE),
    checkCancelled,
    async cooperate() {
      if (performance.now() - lastYield < 8) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastYield = performance.now();
    },
  });
  const dispose = () => {
    signal.removeEventListener('abort', dispose);
    renderer.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  if (signal.aborted) {
    dispose();
    checkCancelled();
  }
  return { render: renderer.render, dispose };
}

/** Shares source bounds, native PCM interpretation and SRC with preview and offline consumers. */
export function createReviewAudioClipCanonicalSource(
  entry: Pick<QuickEditAudioPlanEntry, 'sourceOffset' | 'duration' | 'playbackRate'>,
  input: ReviewAudioClipInput,
  signal: AbortSignal
) {
  const channels = input.numberOfChannels;
  if (channels !== 1 && channels !== 2)
    throw new Error('Audio processing supports mono and stereo sources only.');
  const rate = entry.playbackRate ?? 1;
  const checkCancelled = () => signal.throwIfAborted();
  return createCanonicalAudioSource(
    {
      channels,
      sampleRate: input.sampleRate,
      lengthFrames: input.length,
      async read(start, end) {
        const read = await readReviewAudioClipRange(input, start, end, signal);
        return Array.from({ length: channels }, (_, channel) =>
          Float32Array.from({ length: end - start }, (_, index) => read(channel, start + index))
        );
      },
    },
    { start: entry.sourceOffset, end: entry.sourceOffset + entry.duration * rate },
    checkCancelled
  );
}
