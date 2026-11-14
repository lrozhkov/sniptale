import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  parseAudioProcessing,
  type AudioEffectInstance,
  type AudioProcessing,
} from '@sniptale/runtime-contracts/audio-effects';
import { FaustWasmInstantiator, FaustMonoWebAudioDsp } from 'sniptale:audio-runtime/faust';
import createRnnoise from 'sniptale:audio-runtime/rnnoise';
import createPitch from 'sniptale:audio-runtime/pitch';
import {
  AUDIO_DSP_ASSETS,
  getAudioEffectDefinition,
  getFaustModule,
  unavailableAudioProcessor,
} from './catalog';
import {
  AUDIO_DSP_QUANTUM,
  composeAudioKernels,
  type AudioBlockKernel,
  type AudioKernelStage,
} from './kernel';

/** Runtime owners supply local reads and cancellation. AudioWorklet can read supplied bytes. */
export interface AudioDspPreparation {
  readAsset(
    asset: Readonly<{ path: string; byteLength: number; sha256: string }>
  ): Promise<Uint8Array>;
  checkCancelled(): void;
}
export interface PreparedAudioProcessing {
  createSourceKernel(channels: 1 | 2): Promise<AudioBlockKernel>;
  createPlacementKernel(channels: 1 | 2): Promise<AudioBlockKernel>;
}

/** Prepares immutable code, not placement state. Each creation owns independent WASM instances. */
export async function prepareAudioProcessing(
  value: AudioProcessing,
  options: AudioDspPreparation
): Promise<PreparedAudioProcessing> {
  options.checkCancelled();
  const processing = parseAudioProcessing(value);
  if (!processing) throw new Error('Invalid audio processing settings.');
  if (unavailableAudioProcessor(processing))
    throw new Error('Audio processor implementation is unavailable.');
  const modules = new Map<
    AudioEffectInstance['kind'],
    { module: WebAssembly.Module; json: string }
  >();
  async function compileAsset(path: string) {
    const descriptor = AUDIO_DSP_ASSETS.files.find((asset) => asset.path === path);
    if (!descriptor) throw new Error('Fixed audio asset is missing.');
    const received = await options.readAsset(descriptor);
    if (received.byteLength !== descriptor.byteLength)
      throw new Error('Fixed audio asset digest differs.');
    const bytes = new Uint8Array(received);
    options.checkCancelled();
    if (bytesToHex(sha256(bytes)) !== descriptor.sha256)
      throw new Error('Fixed audio asset digest differs.');
    const module = await WebAssembly.compile(bytes);
    options.checkCancelled();
    return module;
  }
  let denoiseModule: WebAssembly.Module | undefined;
  if (!processing.bypassed) {
    const required = [
      ...new Set(
        processing.effects
          .filter((effect) => effect.enabled && effect.wet > 0)
          .map((effect) => effect.kind)
      ),
    ];
    await Promise.all([
      ...required.map(async (kind) => {
        const definition = getFaustModule(kind);
        modules.set(kind, { module: await compileAsset(definition.path), json: definition.json });
      }),
      ...(processing.denoise?.enabled
        ? [
            compileAsset('audio-effects/rnnoise.wasm').then((module) => {
              denoiseModule = module;
            }),
          ]
        : []),
    ]);
  }
  options.checkCancelled();
  return {
    async createSourceKernel(channels) {
      options.checkCancelled();
      const source = denoiseModule
        ? await rnnoiseKernel(channels, denoiseModule, options.checkCancelled)
        : null;
      try {
        options.checkCancelled();
      } catch (error) {
        source?.dispose();
        throw error;
      }
      return composeAudioKernels(channels, source ? [{ kernel: source, wet: 1 }] : []);
    },
    async createPlacementKernel(channels) {
      options.checkCancelled();
      const stages: AudioKernelStage[] = [];
      try {
        if (!processing.bypassed) {
          if (processing.pitch?.enabled && processing.pitch.semitones !== 0)
            stages.push({
              kernel: await pitchKernel(
                channels,
                processing.pitch.semitones,
                options.checkCancelled
              ),
              wet: 1,
            });
          for (const effect of processing.effects) {
            if (!effect.enabled || effect.wet === 0) continue;
            const factory = modules.get(effect.kind);
            if (!factory) throw new Error('Audio processor was not prepared.');
            stages.push({ kernel: faustKernel(channels, effect, factory), wet: effect.wet });
          }
        }
        options.checkCancelled();
      } catch (error) {
        const errors: unknown[] = [error];
        for (const stage of stages.reverse())
          try {
            stage.kernel.dispose();
          } catch (releaseError) {
            errors.push(releaseError);
          }
        if (errors.length > 1)
          throw new AggregateError(errors, 'Audio processor preparation failed.', { cause: error });
        throw error;
      }
      return composeAudioKernels(channels, stages);
    },
  };
}

function faustKernel(
  channels: 1 | 2,
  effect: AudioEffectInstance,
  factory: { module: WebAssembly.Module; json: string }
): AudioBlockKernel {
  const definition = getAudioEffectDefinition(effect.kind);
  let disposed = false;
  const input = [new Float32Array(AUDIO_DSP_QUANTUM), new Float32Array(AUDIO_DSP_QUANTUM)],
    output = input.map(() => new Float32Array(AUDIO_DSP_QUANTUM));
  const dsp = new FaustMonoWebAudioDsp(
    FaustWasmInstantiator.createSyncMonoDSPInstance(factory),
    48000,
    4,
    AUDIO_DSP_QUANTUM,
    {}
  );
  function dispose() {
    if (!disposed) {
      disposed = true;
      dsp.destroy();
    }
  }
  try {
    for (const parameter of definition.parameters) {
      const value = Object.entries(effect.parameters).find(([key]) => key === parameter.key)?.[1];
      if (typeof value !== 'number') throw new Error('Fixed audio parameter is missing.');
      dsp.setParamValue(parameter.address, value);
    }
    dsp.start();
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    channels,
    latencyFrames: definition.latencyFrames,
    process(planes, destination) {
      if (disposed) throw new Error('Audio processor is disposed.');
      input[0]!.set(planes[0]!);
      input[1]!.set(planes[channels === 1 ? 0 : 1]!);
      if (!dsp.compute(input, output)) throw new Error('Fixed audio processing failed.');
      if (channels === 1)
        for (let i = 0; i < AUDIO_DSP_QUANTUM; i++)
          destination[0]![i] = (output[0]![i]! + output[1]![i]!) / 2;
      else for (let c = 0; c < channels; c++) destination[c]!.set(output[c]!);
    },
    reset() {
      if (disposed) throw new Error('Audio processor is disposed.');
      dsp.instanceClear();
    },
    dispose,
  };
}

async function rnnoiseKernel(
  channels: 1 | 2,
  compiled: WebAssembly.Module,
  checkCancelled: () => void
): Promise<AudioBlockKernel> {
  const module = await createRnnoise({
    instantiateWasm(imports, receiveInstance) {
      checkCancelled();
      const instance = new WebAssembly.Instance(compiled, imports);
      receiveInstance(instance);
      return instance.exports;
    },
  }).ready;
  checkCancelled();
  const states: number[] = [],
    pending = Array.from({ length: channels }, () => new Float32Array(480)),
    queue = Array.from({ length: channels }, () => new Float32Array(960));
  let pointer = 0,
    fill = 0,
    head = 0,
    tail = 480,
    disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const state of states) module._rnnoise_destroy(state);
    if (pointer) module._free(pointer);
  }
  try {
    for (let c = 0; c < channels; c++) {
      const state = module._rnnoise_create(0);
      if (!state) throw new Error('RNNoise state allocation failed.');
      states.push(state);
    }
    pointer = module._malloc(480 * 4);
    if (!pointer) throw new Error('RNNoise frame allocation failed.');
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    channels,
    latencyFrames: AUDIO_DSP_ASSETS.denoise.latencyFrames + 480,
    process(input, output) {
      if (disposed) throw new Error('Audio processor is disposed.');
      for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) {
        for (let c = 0; c < channels; c++) {
          output[c]![i] = queue[c]![head % 960]!;
          pending[c]![fill] = input[c]![i]! * 32768;
        }
        head++;
        fill++;
        if (fill === 480) {
          for (let c = 0; c < channels; c++) {
            module.HEAPF32.set(pending[c]!, pointer / 4);
            module._rnnoise_process_frame(states[c]!, pointer, pointer);
            for (let j = 0; j < 480; j++)
              queue[c]![(tail + j) % 960] = module.HEAPF32[pointer / 4 + j]! / 32768;
          }
          fill = 0;
          tail += 480;
        }
      }
    },
    reset() {
      if (disposed) throw new Error('Audio processor is disposed.');
      for (const state of states)
        if (module._rnnoise_init(state, 0) !== 0) throw new Error('RNNoise reset failed.');
      for (const plane of queue) plane.fill(0);
      for (const plane of pending) plane.fill(0);
      fill = 0;
      head = 0;
      tail = 480;
    },
    dispose,
  };
}

async function pitchKernel(
  channels: 1 | 2,
  semitones: number,
  checkCancelled: () => void
): Promise<AudioBlockKernel> {
  const module = await createPitch();
  checkCancelled();
  module._main();
  module._presetDefault(channels, 48000);
  module._setTransposeSemitones(semitones, 8000 / 48000);
  const latency = module._inputLatency() + module._outputLatency(),
    length = Math.max(AUDIO_DSP_QUANTUM, latency),
    base = module._setBuffers(channels, length) / 4;
  let disposed = false;
  return {
    channels,
    latencyFrames: latency,
    process(input, output) {
      if (disposed) throw new Error('Audio processor is disposed.');
      const heap = new Float32Array(module.HEAP8.buffer);
      for (let c = 0; c < channels; c++) heap.set(input[c]!, base + c * length);
      module._process(AUDIO_DSP_QUANTUM, AUDIO_DSP_QUANTUM);
      const rendered =
        heap.buffer === module.HEAP8.buffer ? heap : new Float32Array(module.HEAP8.buffer);
      for (let c = 0; c < channels; c++)
        output[c]!.set(
          rendered.subarray(
            base + (c + channels) * length,
            base + (c + channels) * length + AUDIO_DSP_QUANTUM
          )
        );
    },
    reset() {
      if (disposed) throw new Error('Audio processor is disposed.');
      module._reset();
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        module._reset();
      }
    },
  };
}
