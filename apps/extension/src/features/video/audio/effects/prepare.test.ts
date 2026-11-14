import { expect, it, vi } from 'vitest';
import { readAudioFixtureAsset } from 'sniptale:audio-test-assets';
import { parseAudioProcessing } from '@sniptale/runtime-contracts/audio-effects';
import { createTempoProcessor } from '../tempo';
import { prepareAudioProcessing } from './assets';
import { AUDIO_DSP_ASSETS, createAudioEffectInstance } from './catalog';
import { createAudioProcessingRenderer } from './prepare';
import { createCanonicalAudioSource, type AudioPcmSource } from './source';
import type { AudioBlockKernel } from './kernel';
const assets = { get: readAudioFixtureAsset };
const sample = (channel: number, frame: number) =>
  Math.fround(0.6 * Math.sin((2 * Math.PI * 180 * frame) / 48000) * (channel ? -0.5 : 1));
function source(seconds = 1, channels: 1 | 2 = 2) {
  const native: AudioPcmSource = {
    sampleRate: 48000,
    channels,
    lengthFrames: seconds * 48000,
    read: vi.fn(async (first: number, last: number) =>
      Array.from({ length: channels }, (_, c) =>
        Float32Array.from({ length: last - first }, (_, i) => sample(c, first + i))
      )
    ),
  };
  return {
    native,
    canonical: createCanonicalAudioSource(native, { start: 0, end: seconds }, () => {}),
  };
}
function config() {
  const result = parseAudioProcessing({ version: 1, bypassed: false, effects: [] });
  if (!result) throw new Error('Invalid fixture');
  return result;
}
const preparation = {
  readAsset: async (asset: { path: string }) => {
    const bytes = assets.get(asset.path);
    if (!bytes) throw new Error('Missing asset');
    return bytes;
  },
  checkCancelled() {},
};
const cooperate = async () => {};

it.each([0.5, 1, 1.25, 1.5, 2, 4, 8])(
  'retains exact legacy WSOLA output at %sx across bounded reads',
  async (rate) => {
    const input = source(),
      processors = await prepareAudioProcessing(config(), preparation),
      count = Math.round(48000 / rate);
    const renderer = await createAudioProcessingRenderer({
      source: input.canonical,
      processors,
      rate,
      durationFrames: count,
      checkCancelled() {},
      cooperate,
    });
    try {
      const actual = [new Float32Array(count), new Float32Array(count)];
      for (let start = 0; start < count; start += 17003) {
        const end = Math.min(count, start + 17003),
          part = await renderer.render(start, end);
        for (let c = 0; c < 2; c++) actual[c]!.set(part[c]!, start);
      }
      const expected = createTempoProcessor(48000, 2, rate).render(
        (c, i) => (i >= 0 && i < 48000 ? sample(c, i) : 0),
        count
      );
      expect(actual).toEqual(expected);
    } finally {
      renderer.dispose();
    }
  }
);

it('reconstructs an earlier request from the real interval start after bounded caches expire', async () => {
  const input = source(8, 1),
    processors = await prepareAudioProcessing(config(), preparation),
    renderer = await createAudioProcessingRenderer({
      source: input.canonical,
      processors,
      rate: 1,
      durationFrames: 8 * 48000,
      checkCancelled() {},
      cooperate,
    });
  try {
    expect((await renderer.render(250000, 250128))[0]![0]).toBe(sample(0, 250000));
    expect((await renderer.render(0, 128))[0]![0]).toBe(sample(0, 0));
    const read = vi.mocked(input.native.read);
    for (const [first, last] of read.mock.calls) expect(last - first).toBeLessThanOrEqual(48000);
  } finally {
    renderer.dispose();
  }
});

function runKernel(kernel: AudioBlockKernel, data: readonly Float32Array[], count: number) {
  const output = data.map(() => new Float32Array(128)),
    raw = data.map(() => new Float32Array(Math.ceil((count + kernel.latencyFrames) / 128) * 128));
  for (let first = 0; first < raw[0]!.length; first += 128) {
    const input = data.map((channel) =>
      Float32Array.from({ length: 128 }, (_, i) => channel[first + i] ?? 0)
    );
    kernel.process(input, output);
    for (let c = 0; c < data.length; c++) raw[c]!.set(output[c]!, first);
  }
  return raw.map((channel) => channel.slice(kernel.latencyFrames, kernel.latencyFrames + count));
}
it('uses denoising before tempo and Faust after tempo with exact latency compensation', async () => {
  const value = config();
  value.denoise = { enabled: true, processor: AUDIO_DSP_ASSETS.denoise.processor };
  const eq = createAudioEffectInstance('eq', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1');
  if (eq.kind !== 'eq') throw new Error('Fixture kind');
  eq.parameters.gain = 6;
  value.effects = [eq];
  const processors = await prepareAudioProcessing(value, preparation),
    input = source(2),
    renderer = await createAudioProcessingRenderer({
      source: input.canonical,
      processors,
      rate: 2,
      durationFrames: 48000,
      checkCancelled() {},
      cooperate,
    }),
    sourceKernel = await processors.createSourceKernel(2),
    placementKernel = await processors.createPlacementKernel(2);
  try {
    const raw = Array.from({ length: 2 }, (_, c) =>
        Float32Array.from({ length: 96000 }, (_, i) => sample(c, i))
      ),
      denoised = runKernel(sourceKernel, raw, 96000),
      retimed = createTempoProcessor(48000, 2, 2).render((c, i) => denoised[c]![i] ?? 0, 48000),
      expected = runKernel(placementKernel, retimed, 48000),
      actual = await renderer.render(0, 48000);
    expect(actual).toEqual(expected);
  } finally {
    renderer.dispose();
    sourceKernel.dispose();
    placementKernel.dispose();
  }
});
it('clips delay tails to placement duration and never reads removed content', async () => {
  const calls: number[][] = [],
    native: AudioPcmSource = {
      sampleRate: 48000,
      channels: 1,
      lengthFrames: 48000,
      async read(first, last) {
        calls.push([first, last]);
        return [
          Float32Array.from({ length: last - first }, (_, i) =>
            first + i === 100 ? 1 : first + i === 33600 ? 1 : 0
          ),
        ];
      },
    },
    canonical = createCanonicalAudioSource(native, { start: 0, end: 0.5 }, () => {}),
    value = config(),
    delay = createAudioEffectInstance('delay', 'b1b80118-71a9-4e59-89d2-a95ba0139aa1');
  if (delay.kind !== 'delay') throw new Error('Fixture kind');
  delay.parameters.duration = 0.1;
  value.effects = [delay];
  const processors = await prepareAudioProcessing(value, preparation),
    renderer = await createAudioProcessingRenderer({
      source: canonical,
      processors,
      rate: 1,
      durationFrames: 24000,
      checkCancelled() {},
      cooperate,
    });
  try {
    const result = (await renderer.render(-128, 24128))[0]!;
    expect(result.subarray(0, 128)).toEqual(new Float32Array(128));
    expect(result.subarray(24128)).toEqual(new Float32Array(128));
    expect(result[128 + 100 + 4800]).toBeGreaterThan(0);
    for (const [first, last] of calls) {
      expect(first).toBeGreaterThanOrEqual(0);
      expect(last).toBeLessThanOrEqual(24000);
    }
  } finally {
    renderer.dispose();
  }
});
it('rejects a cancelled preparation/render without publishing or reusing partial state', async () => {
  let cancelled = false;
  const checkCancelled = () => {
    if (cancelled) throw new Error('cancelled');
  };
  const input = source(1, 1),
    dispose = vi.spyOn(input.canonical, 'dispose'),
    processors = await prepareAudioProcessing(config(), preparation),
    renderer = await createAudioProcessingRenderer({
      source: input.canonical,
      processors,
      rate: 1,
      durationFrames: 48000,
      checkCancelled,
      async cooperate() {
        cancelled = true;
      },
    });
  await expect(renderer.render(0, 48000)).rejects.toThrow('cancelled');
  expect(dispose).toHaveBeenCalledTimes(1);
  await expect(renderer.render(0, 128)).rejects.toThrow('disposed');
  renderer.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
});
