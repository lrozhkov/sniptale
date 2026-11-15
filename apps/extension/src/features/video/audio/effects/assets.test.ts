import { expect, it, vi } from 'vitest';
import { readAudioFixtureAsset } from 'sniptale:audio-test-assets';
import {
  parseAudioProcessing,
  type AudioEffectSettings,
} from '@sniptale/runtime-contracts/audio-effects';
import { AUDIO_DSP_ASSETS, createAudioEffectInstance } from './catalog';
import { prepareAudioProcessing } from './assets';
import type { AudioBlockKernel } from './kernel';

const assets = { get: readAudioFixtureAsset };
const id = 'b1b80118-71a9-4e59-89d2-a95ba0139aa1';
const kinds: AudioEffectSettings['kind'][] = [
  'eq',
  'highpass',
  'lowpass',
  'compressor',
  'limiter',
  'delay',
  'reverb',
  'saturation',
];
const config = (effects: ReturnType<typeof createAudioEffectInstance>[] = []) => {
  const parsed = parseAudioProcessing({ version: 1, bypassed: false, effects });
  if (!parsed) throw new Error('Invalid processing fixture.');
  return parsed;
};
const options = {
  readAsset: async (asset: { path: string }) => {
    const bytes = assets.get(asset.path);
    if (!bytes) throw new Error('Missing test asset');
    return bytes;
  },
  checkCancelled() {},
};
function render(kernel: AudioBlockKernel, blocks: number) {
  const input = Array.from({ length: kernel.channels }, () => new Float32Array(128)),
    output = input.map(() => new Float32Array(128));
  const result = output.map(() => new Float32Array(blocks * 128));
  for (let block = 0; block < blocks; block++) {
    for (let c = 0; c < kernel.channels; c++)
      for (let i = 0; i < 128; i++)
        input[c]![i] =
          c === 0 ? 0.2 * Math.sin((2 * Math.PI * 180 * (block * 128 + i)) / 48000) : 0;
    kernel.process(input, output);
    for (let c = 0; c < kernel.channels; c++) result[c]!.set(output[c]!, block * 128);
  }
  return result;
}
it.each(kinds)('executes the real compiled %s module with common metadata', async (kind) => {
  const prepared = await prepareAudioProcessing(
    config([createAudioEffectInstance(kind, id)]),
    options
  );
  const first = await prepared.createPlacementKernel(1),
    second = await prepared.createPlacementKernel(1);
  try {
    const a = render(first, 32),
      b = render(second, 32);
    expect(a).toEqual(b);
    expect(a[0]!.some((value) => value !== 0)).toBe(true);
    expect(a[0]!.every(Number.isFinite)).toBe(true);
    first.reset();
    expect(render(first, 32)).toEqual(a);
  } finally {
    first.dispose();
    second.dispose();
  }
});
it('bypasses both phases exactly without loading or creating processors', async () => {
  const readAsset = vi.fn(options.readAsset),
    prepared = await prepareAudioProcessing(config(), { ...options, readAsset });
  const source = await prepared.createSourceKernel(2),
    placement = await prepared.createPlacementKernel(2);
  try {
    const a = render(source, 4),
      b = render(placement, 4);
    expect(a).toEqual(b);
    expect(source.latencyFrames).toBe(0);
    expect(placement.latencyFrames).toBe(0);
    expect(readAsset).not.toHaveBeenCalled();
  } finally {
    source.dispose();
    placement.dispose();
  }
});
it('rejects a corrupt fixed asset and an unavailable implementation before execution', async () => {
  const effect = createAudioEffectInstance('eq', id);
  await expect(
    prepareAudioProcessing(config([effect]), {
      ...options,
      readAsset: async () => new Uint8Array(4),
    })
  ).rejects.toThrow('digest differs');
  effect.processor.sha256 = '0'.repeat(64);
  const readAsset = vi.fn(options.readAsset);
  await expect(prepareAudioProcessing(config([effect]), { ...options, readAsset })).rejects.toThrow(
    'unavailable'
  );
  expect(readAsset).not.toHaveBeenCalled();
});
it('cancels controlled delayed preparation before publishing a usable factory', async () => {
  let cancelled = false;
  let resolve!: (value: Uint8Array) => void;
  const deferred = new Promise<Uint8Array>((done) => {
    resolve = done;
  });
  const effect = createAudioEffectInstance('eq', id),
    request = prepareAudioProcessing(config([effect]), {
      readAsset: () => deferred,
      checkCancelled() {
        if (cancelled) throw new Error('cancelled');
      },
    });
  cancelled = true;
  resolve(assets.get('audio-effects/faust/eq.wasm')!);
  await expect(request).rejects.toThrow('cancelled');
});
it('runs RNNoise before tempo with separate stereo states and deterministic reset', async () => {
  const value = config();
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  const prepared = await prepareAudioProcessing(value, options),
    first = await prepared.createSourceKernel(2),
    second = await prepared.createSourceKernel(2);
  try {
    expect(first.latencyFrames).toBe(1440);
    const a = render(first, 48);
    expect(a).toEqual(render(second, 48));
    expect(a[1]).toEqual(new Float32Array(48 * 128));
    expect(a[0]!.some((value) => value !== 0)).toBe(true);
    first.reset();
    expect(render(first, 48)).toEqual(a);
  } finally {
    first.dispose();
    second.dispose();
  }
});
it('runs independent pitch after tempo with the same block API', async () => {
  const value = config();
  value.pitch = { enabled: true, semitones: 7, processor: AUDIO_DSP_ASSETS.pitch.processor };
  const prepared = await prepareAudioProcessing(value, options),
    kernel = await prepared.createPlacementKernel(1);
  try {
    expect(kernel.latencyFrames).toBe(5760);
    const actual = render(kernel, 375)[0]!;
    let crossings = 0;
    for (let i = 12001; i < 36000; i++) if (actual[i - 1]! < 0 && actual[i]! >= 0) crossings++;
    expect(Math.abs(crossings * 2 - 180 * 2 ** (7 / 12))).toBeLessThan(5);
    kernel.reset();
    expect(render(kernel, 375)[0]).toEqual(actual);
  } finally {
    kernel.dispose();
  }
});

it('prepares RNNoise code asynchronously and never compiles while creating placement state', async () => {
  const value = config();
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  const prepared = await prepareAudioProcessing(value, options);
  const compile = vi
    .spyOn(WebAssembly, 'compile')
    .mockRejectedValue(new Error('unexpected compile'));
  try {
    const kernel = await prepared.createSourceKernel(1);
    try {
      expect(render(kernel, 8)[0]!.every(Number.isFinite)).toBe(true);
      expect(compile).not.toHaveBeenCalled();
    } finally {
      kernel.dispose();
    }
  } finally {
    compile.mockRestore();
  }
});
it('rejects a damaged RNNoise model before creating source state', async () => {
  const value = config();
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  await expect(
    prepareAudioProcessing(value, {
      ...options,
      readAsset: async (asset) => {
        const bytes = readAudioFixtureAsset(asset.path);
        bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
        return bytes;
      },
    })
  ).rejects.toThrow('digest differs');
});

it('reduces stationary noise by at least 6 dB through the production RNNoise source adapter', async () => {
  const value = config();
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  const prepared = await prepareAudioProcessing(value, options),
    kernel = await prepared.createSourceKernel(1);
  let seed = 12345;
  const noise = Float32Array.from({ length: 96000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return ((seed / 4294967296) * 2 - 1) * 0.04;
  });
  const output = new Float32Array(noise.length + kernel.latencyFrames + 128);
  try {
    const block = [new Float32Array(128)],
      result = [new Float32Array(128)];
    for (let first = 0; first + 128 <= output.length; first += 128) {
      block[0]!.fill(0);
      block[0]!.set(noise.subarray(first, Math.min(noise.length, first + 128)));
      kernel.process(block, result);
      output.set(result[0]!, first);
    }
    const rms = (samples: Float32Array) =>
      Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const dry = rms(noise.subarray(48000, 90000));
    const wet = rms(output.subarray(kernel.latencyFrames + 48000, kernel.latencyFrames + 90000));
    expect(output.every(Number.isFinite)).toBe(true);
    // A 6 dB reduction halves amplitude: an audible functional floor, not a quality claim for speech.
    expect(20 * Math.log10(dry / Math.max(wet, Number.EPSILON))).toBeGreaterThanOrEqual(6);
  } finally {
    kernel.dispose();
  }
});
it('keeps a bypassed chain dry without requesting assets or retaining disposed kernels', async () => {
  const value = config([createAudioEffectInstance('eq', id)]);
  value.bypassed = true;
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  const readAsset = vi.fn(options.readAsset);
  const factory = await prepareAudioProcessing(value, { ...options, readAsset });
  const source = await factory.createSourceKernel(1),
    placement = await factory.createPlacementKernel(1);
  const input = [new Float32Array(128).fill(0.25)],
    output = [new Float32Array(128)];
  try {
    source.process(input, output);
    expect(output).toEqual(input);
    placement.process(input, output);
    expect(output).toEqual(input);
    expect(readAsset).not.toHaveBeenCalled();
  } finally {
    source.dispose();
    placement.dispose();
  }
});
it('preserves both channels through a stereo Faust instance and refuses its use after disposal', async () => {
  const prepared = await prepareAudioProcessing(
    config([createAudioEffectInstance('eq', id)]),
    options
  );
  const kernel = await prepared.createPlacementKernel(2);
  const input = [new Float32Array(128).fill(0.2), new Float32Array(128).fill(-0.1)],
    output = [new Float32Array(128), new Float32Array(128)];
  kernel.process(input, output);
  expect(output[0]!.some((value) => value > 0)).toBe(true);
  expect(output[1]!.some((value) => value < 0)).toBe(true);
  kernel.dispose();
  kernel.dispose();
  expect(() => kernel.process(input, output)).toThrow('disposed');
  expect(() => kernel.reset()).toThrow('disposed');
});
it('rejects invalid configuration and missing fixed assets before creating a processor', async () => {
  const value = config();
  Object.defineProperty(value, 'version', { value: 2 });
  await expect(prepareAudioProcessing(value, options)).rejects.toThrow('Invalid audio processing');
  const effect = createAudioEffectInstance('eq', id),
    original = effect.processor.sha256;
  const descriptor = AUDIO_DSP_ASSETS.files.find(
    (file) => file.path === 'audio-effects/faust/eq.wasm'
  )!;
  const readAsset = vi.fn(async () => new Uint8Array(descriptor.byteLength));
  await expect(prepareAudioProcessing(config([effect]), { ...options, readAsset })).rejects.toThrow(
    'digest differs'
  );
  expect(effect.processor.sha256).toBe(original);
});
