import { expect, it, vi } from 'vitest';
import { AUDIO_DSP_QUANTUM, composeAudioKernels, type AudioBlockKernel } from './kernel';
const block = (value = 0) => [new Float32Array(AUDIO_DSP_QUANTUM).fill(value)];
function delayedGain(delay: number, gain = 1): AudioBlockKernel {
  const history = new Float32Array(delay);
  let position = 0;
  return {
    channels: 1,
    latencyFrames: delay,
    process(input, output) {
      for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) {
        const sample = input[0]![i]!;
        output[0]![i] = (delay ? history[position]! : sample) * gain;
        if (delay) {
          history[position] = sample;
          position = (position + 1) % delay;
        }
      }
    },
    reset() {
      history.fill(0);
      position = 0;
    },
    dispose: vi.fn(),
  };
}
it('keeps empty-chain samples exact, including an aliased destination', () => {
  const kernel = composeAudioKernels(1, []),
    input = block();
  for (let i = 0; i < AUDIO_DSP_QUANTUM; i++) input[0]![i] = Math.sin(i) * 0.25;
  const expected = input[0]!.slice();
  kernel.process(input, input);
  expect(input[0]).toEqual(expected);
  kernel.dispose();
});
it('aligns dry and wet at a latency that crosses quantum boundaries', () => {
  const kernel = composeAudioKernels(1, [{ kernel: delayedGain(480, 2), wet: 0.25 }]);
  expect(kernel.latencyFrames).toBe(480);
  const actual: number[] = [],
    output = block();
  for (let pos = 0; pos < 768; pos += 128) {
    const input = block();
    if (pos === 0) input[0]![0] = 1;
    kernel.process(input, output);
    actual.push(...output[0]!);
  }
  expect(actual.filter((sample) => sample !== 0)).toEqual([1.25]);
  expect(actual[480]).toBe(1.25);
  kernel.dispose();
});
it('preserves stage order and resets all temporal state', () => {
  const clip = delayedGain(17),
    render = clip.process;
  clip.process = (input, output) => {
    render(input, output);
    for (let i = 0; i < AUDIO_DSP_QUANTUM; i++)
      output[0]![i] = Math.max(-0.25, Math.min(0.25, output[0]![i]!));
  };
  const kernel = composeAudioKernels(1, [
    { kernel: delayedGain(31, 2), wet: 1 },
    { kernel: clip, wet: 1 },
  ]);
  const input = block();
  input[0]![0] = 0.2;
  const first = block(),
    second = block();
  kernel.process(input, first);
  kernel.reset();
  kernel.process(input, second);
  expect(first).toEqual(second);
  expect(first[0]![48]).toBeCloseTo(0.25, 6);
  expect(kernel.latencyFrames).toBe(48);
  kernel.dispose();
});
it('keeps placement state independent', () => {
  const first = composeAudioKernels(1, [{ kernel: delayedGain(480), wet: 1 }]);
  const second = composeAudioKernels(1, [{ kernel: delayedGain(480), wet: 1 }]);
  first.process(block(1), block());
  const output = block();
  for (let i = 0; i < 8; i++) second.process(block(), output);
  expect(output[0]).toEqual(new Float32Array(128));
  first.dispose();
  second.dispose();
});
it('refuses partial blocks without advancing the state', () => {
  const stage = delayedGain(31),
    process = vi.spyOn(stage, 'process'),
    kernel = composeAudioKernels(1, [{ kernel: stage, wet: 1 }]);
  expect(() => kernel.process([new Float32Array(127)], block())).toThrow(
    'complete fixed-size blocks'
  );
  expect(process).not.toHaveBeenCalled();
  kernel.dispose();
});
it('publishes no partial frame and releases every stage once on failure', () => {
  const first = delayedGain(0, 2),
    broken = delayedGain(0),
    last = delayedGain(0);
  broken.process = () => {
    throw new Error('processor failed');
  };
  const kernel = composeAudioKernels(
      1,
      [first, broken, last].map((stage) => ({ kernel: stage, wet: 1 }))
    ),
    output = block(0.125);
  expect(() => kernel.process(block(0.2), output)).toThrow('processor failed');
  expect(output).toEqual(block(0.125));
  kernel.dispose();
  for (const stage of [first, broken, last]) expect(stage.dispose).toHaveBeenCalledTimes(1);
  expect(() => kernel.process(block(), output)).toThrow('disposed');
});
it('releases acquired stages on configuration failure and nonfinite output', () => {
  const invalid = delayedGain(0);
  expect(() => composeAudioKernels(1, [{ kernel: invalid, wet: NaN }])).toThrow(
    'Invalid audio kernel stage'
  );
  expect(invalid.dispose).toHaveBeenCalledTimes(1);
  const bad = delayedGain(0);
  bad.process = (_input, output) => {
    output[0]!.fill(NaN);
  };
  const kernel = composeAudioKernels(1, [{ kernel: bad, wet: 1 }]);
  const output = block(0.25);
  expect(() => kernel.process(block(), output)).toThrow('invalid sample');
  expect(output).toEqual(block(0.25));
  expect(bad.dispose).toHaveBeenCalledTimes(1);
});

it('releases acquired kernels if delay-buffer allocation fails', () => {
  const first = delayedGain(0),
    impossible = { ...delayedGain(0), latencyFrames: Number.MAX_SAFE_INTEGER };
  expect(() =>
    composeAudioKernels(1, [
      { kernel: first, wet: 1 },
      { kernel: impossible, wet: 1 },
    ])
  ).toThrow(RangeError);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(impossible.dispose).toHaveBeenCalledTimes(1);
});
