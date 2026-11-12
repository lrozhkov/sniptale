import { hasReviewAudioProcessing, createReviewProcessedClip } from './audio-clip-processing';
import { CANONICAL_AUDIO_RATE } from '../../features/video/audio/effects/source';
import type { AudioProcessingRenderer } from '../../features/video/audio/effects/prepare';
import { readReviewAudioClipRange, type ReviewAudioClipInput } from './audio-clip-source';
import { createTempoProcessor } from '../../features/video/audio/tempo';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';

/** Fixed renderer overlap; consumers skip these padded frames when scheduling output. */
export const REVIEW_AUDIO_CLIP_PADDING_SECONDS = 0.02;

/** Job-local external audio processing; spans are output seconds relative to the clip. */
export interface ReviewAudioClipRenderer {
  /** Releases job-owned processing state; never closes borrowed source decoders. */
  dispose?(): void;
  render(
    entry: QuickEditAudioPlanEntry,
    buffer: ReviewAudioClipInput,
    from: number,
    to: number,
    signal: AbortSignal
  ): Promise<AudioBuffer>;
}

/**
 * Keeps WSOLA phase across video segments and retains only resampler overlap.
 * A fragment beginning midway through a clip is primed from its real origin in
 * bounded chunks, so its speech matches preview rather than restarting a grain.
 */
export function createReviewAudioClipRenderer(): ReviewAudioClipRenderer {
  const states = new Map<QuickEditAudioPlanEntry, ReturnType<typeof createClipTempo>>();
  const processed = new Map<
    QuickEditAudioPlanEntry,
    {
      buffer: ReviewAudioClipInput;
      signal: AbortSignal;
      signature: string;
      promise: Promise<AudioProcessingRenderer>;
      release(): void;
    }
  >();
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      states.clear();
      for (const state of processed.values()) state.release();
      processed.clear();
    },
    async render(entry, buffer, from, to, signal) {
      if (disposed) throw new Error('Audio clip renderer is disposed.');
      if (hasReviewAudioProcessing(entry.audioProcessing)) {
        signal.throwIfAborted();
        const signature = JSON.stringify([
          entry.audioProcessing,
          entry.sourceOffset,
          entry.duration,
          entry.playbackRate,
        ]);
        let state = processed.get(entry);
        if (
          !state ||
          state.buffer !== buffer ||
          state.signal !== signal ||
          state.signature !== signature
        ) {
          state?.release();
          let released = false;
          const promise = createReviewProcessedClip(entry, buffer, signal).then((renderer) => {
            if (released) {
              renderer.dispose();
              throw new Error('Audio clip renderer is disposed.');
            }
            return renderer;
          });
          const next = {
            buffer,
            signal,
            signature,
            promise,
            release() {
              if (released) return;
              released = true;
              void promise.then(
                (renderer) => renderer.dispose(),
                () => {}
              );
            },
          };
          state = next;
          processed.set(entry, state);
          void promise.catch(() => {
            if (processed.get(entry) === next) processed.delete(entry);
          });
        }
        const renderer = await state.promise;
        const padding = Math.round(CANONICAL_AUDIO_RATE * REVIEW_AUDIO_CLIP_PADDING_SECONDS);
        const start = Math.round(from * CANONICAL_AUDIO_RATE) - padding;
        const end = Math.round(to * CANONICAL_AUDIO_RATE) + padding;
        const planes = await renderer.render(start, end);
        signal.throwIfAborted();
        if (disposed) throw new Error('Audio clip renderer is disposed.');
        const output = new AudioBuffer({
          length: end - start,
          sampleRate: CANONICAL_AUDIO_RATE,
          numberOfChannels: planes.length,
        });
        for (let channel = 0; channel < planes.length; channel++)
          output.getChannelData(channel).set(planes[channel]!);
        return output;
      }
      processed.get(entry)?.release();
      processed.delete(entry);
      signal.throwIfAborted();
      const padding = Math.round(buffer.sampleRate * REVIEW_AUDIO_CLIP_PADDING_SECONDS);
      const start = Math.round(from * buffer.sampleRate) - padding;
      const end = Math.round(to * buffer.sampleRate) + padding;
      let state = states.get(entry);
      if (!state || state.buffer !== buffer || start < state.frame - state.tail[0]!.length) {
        state = createClipTempo(entry, buffer, padding);
        states.set(entry, state);
      }
      const result = new AudioBuffer({
        length: end - start,
        sampleRate: buffer.sampleRate,
        numberOfChannels: buffer.numberOfChannels,
      });
      copyClipRange(result, state.tail, state.frame - state.tail[0]!.length, start);
      const limit = Math.min(end, Math.round(entry.duration * buffer.sampleRate));
      while (state.frame < limit) {
        signal.throwIfAborted();
        const count = Math.min(state.chunkSize, limit - state.frame);
        const range = state.processor.inputRange(count);
        const read = await readReviewAudioClipRange(
          buffer,
          state.offset + range.start,
          state.offset + range.end,
          signal
        );
        const chunk = state.processor.render(
          (channel, frame) =>
            frame >= 0 && frame + state.offset >= 0 && frame + state.offset < state.end
              ? read(channel, frame + state.offset)
              : 0,
          count
        );
        copyClipRange(result, chunk, state.frame, start);
        retainClipTail(state, chunk);
        state.frame += count;
        if (state.frame < limit) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      signal.throwIfAborted();
      return result;
    },
  };
}

function createClipTempo(
  entry: QuickEditAudioPlanEntry,
  buffer: ReviewAudioClipInput,
  padding: number
) {
  const rate = entry.playbackRate ?? 1;
  const offset = Math.round(entry.sourceOffset * buffer.sampleRate);
  const end = Math.min(
    buffer.length,
    offset + Math.round(entry.duration * rate * buffer.sampleRate)
  );
  return {
    buffer,
    processor: createTempoProcessor(buffer.sampleRate, buffer.numberOfChannels, rate),
    offset,
    end,
    chunkSize: Math.max(1, Math.min(buffer.sampleRate, Math.floor((4 * buffer.sampleRate) / rate))),
    frame: 0,
    padding,
    tail: Array.from({ length: buffer.numberOfChannels }, () => new Float32Array(0)),
  };
}

function copyClipRange(
  result: AudioBuffer,
  planes: readonly Float32Array[],
  frame: number,
  start: number
) {
  const from = Math.max(frame, start, 0);
  const end = Math.min(frame + planes[0]!.length, start + result.length);
  if (end <= from) return;
  for (let c = 0; c < planes.length; c++)
    result.getChannelData(c).set(planes[c]!.subarray(from - frame, end - frame), from - start);
}

function retainClipTail(state: ReturnType<typeof createClipTempo>, chunk: readonly Float32Array[]) {
  state.tail = chunk.map((plane, c) => {
    const previous = state.tail[c]!;
    const length = Math.min(2 * state.padding, previous.length + plane.length);
    const retained = new Float32Array(length);
    const previousCount = Math.max(0, length - plane.length);
    retained.set(previous.subarray(previous.length - previousCount));
    retained.set(plane.subarray(Math.max(0, plane.length - length)), previousCount);
    return retained;
  });
}
