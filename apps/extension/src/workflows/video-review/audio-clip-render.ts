import { createTempoProcessor } from '../../features/video/audio/tempo';
import type { QuickEditAudioPlanEntry } from '../../features/video/review/advanced/audio-plan';

/** Job-local external audio processing; spans are output seconds relative to the clip. */
export interface ReviewAudioClipRenderer {
  render(
    entry: QuickEditAudioPlanEntry,
    buffer: AudioBuffer,
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
  return {
    async render(entry, buffer, from, to, signal) {
      signal.throwIfAborted();
      const padding = Math.round(buffer.sampleRate * 0.02);
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
        const chunk = state.processor.render(state.read, count);
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

function createClipTempo(entry: QuickEditAudioPlanEntry, buffer: AudioBuffer, padding: number) {
  const rate = entry.playbackRate ?? 1;
  const planes = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c)
  );
  const offset = Math.round(entry.sourceOffset * buffer.sampleRate);
  const end = Math.min(
    buffer.length,
    offset + Math.round(entry.duration * rate * buffer.sampleRate)
  );
  return {
    buffer,
    processor: createTempoProcessor(buffer.sampleRate, buffer.numberOfChannels, rate),
    read: (channel: number, frame: number) =>
      frame >= 0 && frame + offset >= 0 && frame + offset < end
        ? planes[channel]![frame + offset]!
        : 0,
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
