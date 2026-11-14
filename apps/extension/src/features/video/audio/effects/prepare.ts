import { createTempoProcessor } from '../tempo';
import { AUDIO_DSP_QUANTUM, type AudioBlockKernel } from './kernel';
import type { PreparedAudioProcessing } from './assets';
import {
  CANONICAL_AUDIO_RATE,
  AUDIO_PCM_MAX_READ_FRAMES,
  type CanonicalAudioSource,
} from './source';

export interface AudioProcessingRenderer {
  render(startFrame: number, endFrame: number): Promise<Float32Array[]>;
  dispose(): void;
}
interface RenderOptions {
  source: CanonicalAudioSource;
  processors: PreparedAudioProcessing;
  rate: number;
  durationFrames: number;
  checkCancelled(): void;
  /** Scheduling differs by runtime. This callback does not change sample clocks or DSP values. */
  cooperate(): Promise<void>;
}

/** Owns placement state and the supplied canonical reader, but not its decoder. */
export async function createAudioProcessingRenderer(
  options: RenderOptions
): Promise<AudioProcessingRenderer> {
  const acquired: AudioBlockKernel[] = [];
  try {
    options.checkCancelled();
    if (!Number.isSafeInteger(options.durationFrames) || options.durationFrames < 0)
      throw new Error('Invalid processed audio duration.');
    const sourceKernel = await options.processors.createSourceKernel(options.source.channels);
    acquired.push(sourceKernel);
    const placementKernel = await options.processors.createPlacementKernel(options.source.channels);
    acquired.push(placementKernel);
    options.checkCancelled();
    return createRenderer(options, sourceKernel, placementKernel);
  } catch (error) {
    const errors: unknown[] = [error];
    for (const kernel of acquired.reverse())
      try {
        kernel.dispose();
      } catch (releaseError) {
        errors.push(releaseError);
      }
    try {
      options.source.dispose();
    } catch (releaseError) {
      errors.push(releaseError);
    }
    if (errors.length > 1)
      throw new AggregateError(errors, 'Audio placement preparation failed.', { cause: error });
    throw error;
  }
}

function createRenderer(
  options: RenderOptions,
  sourceKernel: AudioBlockKernel,
  placementKernel: AudioBlockKernel
): AudioProcessingRenderer {
  const { source, durationFrames } = options,
    channels = source.channels;
  const capacity = AUDIO_PCM_MAX_READ_FRAMES + AUDIO_DSP_QUANTUM;
  const sourceRing = Array.from({ length: channels }, () => new Float32Array(capacity)),
    outputRing = sourceRing.map(() => new Float32Array(capacity));
  const sourceOutput = sourceRing.map(() => new Float32Array(AUDIO_DSP_QUANTUM)),
    placementOutput = sourceOutput.map(() => new Float32Array(AUDIO_DSP_QUANTUM));
  let tempo = createTempoProcessor(CANONICAL_AUDIO_RATE, channels, options.rate);
  let sourceInputFrame = 0,
    placementInputFrame = 0,
    outputEnd = 0,
    disposed = false,
    queue: Promise<void> = Promise.resolve();
  function check() {
    if (disposed) throw new Error('Audio placement is disposed.');
    options.checkCancelled();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const kernel of [placementKernel, sourceKernel])
      try {
        kernel.dispose();
      } catch (error) {
        errors.push(error);
      }
    try {
      source.dispose();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, 'Audio placement release failed.');
  }
  function reset() {
    sourceKernel.reset();
    placementKernel.reset();
    tempo = createTempoProcessor(CANONICAL_AUDIO_RATE, channels, options.rate);
    sourceInputFrame = 0;
    placementInputFrame = 0;
    outputEnd = 0;
    for (const plane of [...sourceRing, ...outputRing]) plane.fill(0);
  }
  async function sourceWindow(start: number, end: number) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end - start > AUDIO_PCM_MAX_READ_FRAMES
    )
      throw new Error('Tempo requested an invalid audio window.');
    if (start >= source.lengthFrames || end <= 0) return () => 0;
    const target = Math.min(end, source.lengthFrames);
    while (sourceInputFrame - sourceKernel.latencyFrames < target) {
      check();
      const input = await source.read(sourceInputFrame, sourceInputFrame + AUDIO_DSP_QUANTUM);
      check();
      sourceKernel.process(input, sourceOutput);
      for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) {
        const frame = sourceInputFrame - sourceKernel.latencyFrames + i;
        if (frame >= 0 && frame < source.lengthFrames)
          for (let c = 0; c < channels; c++)
            sourceRing[c]![frame % capacity] = sourceOutput[c]![i]!;
      }
      sourceInputFrame += AUDIO_DSP_QUANTUM;
      await options.cooperate();
      check();
    }
    const availableEnd = Math.max(
        0,
        Math.min(source.lengthFrames, sourceInputFrame - sourceKernel.latencyFrames)
      ),
      first = Math.max(0, availableEnd - capacity);
    if (Math.max(0, start) < first) throw new Error('Tempo exceeded the retained audio context.');
    return (channel: number, frame: number) => {
      if (frame < 0 || frame >= source.lengthFrames) return 0;
      if (frame < start || frame >= end || frame < first || frame >= availableEnd)
        throw new Error('Tempo read outside its prepared audio window.');
      return sourceRing[channel]![frame % capacity]!;
    };
  }
  async function ensureOutput(end: number) {
    while (outputEnd < end) {
      check();
      const range = tempo.inputRange(AUDIO_DSP_QUANTUM),
        read = await sourceWindow(range.start, range.end);
      check();
      const input = tempo.render(read, AUDIO_DSP_QUANTUM);
      placementKernel.process(input, placementOutput);
      for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) {
        const frame = placementInputFrame - placementKernel.latencyFrames + i;
        if (frame >= 0 && frame < durationFrames)
          for (let c = 0; c < channels; c++)
            outputRing[c]![frame % capacity] = placementOutput[c]![i]!;
      }
      placementInputFrame += AUDIO_DSP_QUANTUM;
      outputEnd = Math.max(
        0,
        Math.min(durationFrames, placementInputFrame - placementKernel.latencyFrames)
      );
      await options.cooperate();
      check();
    }
  }
  async function render(start: number, end: number) {
    check();
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end < start ||
      end - start > AUDIO_PCM_MAX_READ_FRAMES
    )
      throw new Error('Invalid processed audio range.');
    const output = Array.from({ length: channels }, () => new Float32Array(end - start));
    const from = Math.max(0, start),
      to = Math.min(durationFrames, end);
    if (to <= from) return output;
    try {
      if (from < Math.max(0, outputEnd - capacity)) reset();
      await ensureOutput(to);
      check();
      for (let frame = from; frame < to; frame++)
        for (let c = 0; c < channels; c++)
          output[c]![frame - start] = outputRing[c]![frame % capacity]!;
      return output;
    } catch (error) {
      try {
        dispose();
      } catch (releaseError) {
        throw new AggregateError([error, releaseError], 'Audio placement rendering failed.', {
          cause: releaseError,
        });
      }
      throw error;
    }
  }
  return {
    render(start, end) {
      const request = queue.then(() => render(start, end));
      queue = request.then(
        () => {},
        () => {}
      );
      return request;
    },
    dispose,
  };
}
