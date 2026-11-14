import { AUDIO_PROCESSING_MAX_EFFECTS } from '@sniptale/runtime-contracts/audio-effects';

export const AUDIO_DSP_QUANTUM = 128;

/** One placement owns this state. Both executors supply the same fixed-size PCM blocks. */
export interface AudioBlockKernel {
  readonly channels: 1 | 2;
  readonly latencyFrames: number;
  process(input: readonly Float32Array[], output: readonly Float32Array[]): void;
  reset(): void;
  dispose(): void;
}

export interface AudioKernelStage {
  kernel: AudioBlockKernel;
  wet: number;
}

function release(stages: readonly AudioKernelStage[]): unknown[] {
  const errors: unknown[] = [];
  for (const stage of [...stages].reverse()) {
    try {
      stage.kernel.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/** Takes ownership at entry, including validation failure. Each dry path follows its wet latency. */
export function composeAudioKernels(
  channels: 1 | 2,
  ownedStages: readonly AudioKernelStage[]
): AudioBlockKernel {
  try {
    if ((channels !== 1 && channels !== 2) || ownedStages.length > AUDIO_PROCESSING_MAX_EFFECTS + 2)
      throw new Error('Unsupported audio kernel layout.');
    for (const stage of ownedStages) {
      if (
        stage.kernel.channels !== channels ||
        !Number.isSafeInteger(stage.kernel.latencyFrames) ||
        stage.kernel.latencyFrames < 0 ||
        !Number.isFinite(stage.wet) ||
        stage.wet < 0 ||
        stage.wet > 1
      )
        throw new Error('Invalid audio kernel stage.');
    }
  } catch (error) {
    const errors = release(ownedStages);
    if (errors.length)
      throw new AggregateError([error, ...errors], 'Audio kernel preparation failed.', {
        cause: error,
      });
    throw error;
  }
  function allocate() {
    try {
      const stages = ownedStages.map((stage) => ({
        ...stage,
        dry: Array.from({ length: channels }, () => new Float32Array(stage.kernel.latencyFrames)),
        dryBlock: Array.from({ length: channels }, () => new Float32Array(AUDIO_DSP_QUANTUM)),
        position: 0,
      }));
      const scratch = Array.from({ length: 2 }, () =>
        Array.from({ length: channels }, () => new Float32Array(AUDIO_DSP_QUANTUM))
      );
      return { stages, scratch };
    } catch (error) {
      const errors = release(ownedStages);
      if (errors.length)
        throw new AggregateError([error, ...errors], 'Audio kernel allocation failed.', {
          cause: error,
        });
      throw error;
    }
  }
  const { stages, scratch } = allocate();
  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const errors = release(stages);
    if (errors.length) throw new AggregateError(errors, 'Audio kernel release failed.');
  }
  function checkBlock(planes: readonly Float32Array[]): void {
    if (planes.length !== channels || planes.some((plane) => plane.length !== AUDIO_DSP_QUANTUM))
      throw new Error('Audio kernel requires complete fixed-size blocks.');
  }
  return {
    channels,
    latencyFrames: stages.reduce((sum, stage) => sum + stage.kernel.latencyFrames, 0),
    process(input, output) {
      if (disposed) throw new Error('Audio kernel is disposed.');
      checkBlock(input);
      checkBlock(output);
      try {
        let current = scratch[0]!;
        for (let c = 0; c < channels; c++) current[c]!.set(input[c]!);
        for (const stage of stages) {
          const next = current === scratch[0] ? scratch[1]! : scratch[0]!;
          if (stage.wet < 1) {
            const latency = stage.kernel.latencyFrames;
            for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) {
              for (let c = 0; c < channels; c++) {
                stage.dryBlock[c]![i] = latency ? stage.dry[c]![stage.position]! : current[c]![i]!;
                if (latency) stage.dry[c]![stage.position] = current[c]![i]!;
              }
              if (latency) stage.position = (stage.position + 1) % latency;
            }
          }
          stage.kernel.process(current, next);
          if (stage.wet < 1)
            for (let c = 0; c < channels; c++)
              for (let i = 0; i < AUDIO_DSP_QUANTUM; i++)
                next[c]![i] = next[c]![i]! * stage.wet + stage.dryBlock[c]![i]! * (1 - stage.wet);
          current = next;
        }
        for (const plane of current)
          for (const sample of plane)
            if (!Number.isFinite(sample))
              throw new Error('Audio processing produced an invalid sample.');
        for (let c = 0; c < channels; c++) output[c]!.set(current[c]!);
      } catch (error) {
        try {
          dispose();
        } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'Audio processing failed.', {
            cause: releaseError,
          });
        }
        throw error;
      }
    },
    reset() {
      if (disposed) throw new Error('Audio kernel is disposed.');
      try {
        for (const stage of stages) {
          stage.kernel.reset();
          for (const plane of stage.dry) plane.fill(0);
          stage.position = 0;
        }
      } catch (error) {
        try {
          dispose();
        } catch (releaseError) {
          throw new AggregateError([error, releaseError], 'Audio kernel reset failed.', {
            cause: releaseError,
          });
        }
        throw error;
      }
    },
    dispose,
  };
}
