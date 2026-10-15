import { expect, it } from 'vitest';
import { motionBlurSamples } from './blur';

it('uses a bounded normalized exposure with no strength dead zone or early saturation', () => {
  let previous = 0;
  for (const strength of [0.01, 0.1, 0.25, 0.5, 0.75, 1]) {
    const samples = motionBlurSamples(5, strength, 0, 10);
    const span = samples.at(-1)!.time - samples[0]!.time;
    expect(span).toBeGreaterThan(previous);
    expect(span).toBeCloseTo(strength / 30);
    expect(samples.reduce((sum, sample) => sum + sample.alpha, 0)).toBeCloseTo(1);
    expect(samples[2]!.time).toBe(5);
    previous = span;
  }
});

it('does not sample another scene and keeps zero/invalid strength on a single sample', () => {
  for (const strength of [0, NaN, Infinity, -1])
    expect(motionBlurSamples(1, strength, 0, 2)).toEqual([{ time: 1, alpha: 1 }]);
  expect(motionBlurSamples(0, 1, 0, 2).every((sample) => sample.time >= 0)).toBe(true);
  expect(motionBlurSamples(2, 1, 0, 2).every((sample) => sample.time <= 2)).toBe(true);
});
