import { expect, it } from 'vitest';
import { createNewWorkspacePresentationSettings } from './advanced/presentation';
import {
  planReviewPresentationSequence,
  iteratePresentationCandidates,
  type PresentationRate,
} from './presentation-sequence';
import { planPresentationPreview } from './presentation-preview';

function sequence(
  rate: PresentationRate = { numerator: 60, denominator: 1 },
  duration = 10,
  bookends = 0
) {
  const settings = createNewWorkspacePresentationSettings();
  if (bookends) {
    const slot = {
      mode: 'image' as const,
      image: {
        assetId: 'project-asset:test',
        width: 100,
        height: 100,
        duration: bookends,
        fit: 'contain' as const,
        fillColor: '#000000ff',
        crop: { panX: 0, panY: 0 },
      },
    };
    settings.intro = slot;
    settings.outro = slot;
  }
  const result = planReviewPresentationSequence({
    settings,
    mainDuration: duration,
    fragmentOffset: 17,
    includeBookends: true,
    rate,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}
const preferences = { frameRate: 'current' as const, rasterPreset: 'current' as const };
function preview(plan = sequence(), edge: 'beginning' | 'ending' = 'beginning') {
  return planPresentationPreview({ sequence: plan, edge, width: 1920, height: 1080, preferences });
}
it('offers disjoint Start/Join and Join/End without encoding intervening long bookends', () => {
  const plan = sequence(undefined, 10, 10);
  expect(
    preview(plan).windows.map((entry) => [entry.name, entry.requestedStartUs, entry.requestedEndUs])
  ).toEqual([
    ['start', 0, 3_000_000],
    ['join', 8_000_000, 12_000_000],
  ]);
  expect(
    preview(plan, 'ending').windows.map((entry) => [
      entry.name,
      entry.requestedStartUs,
      entry.requestedEndUs,
    ])
  ).toEqual([
    ['join', 18_000_000, 22_000_000],
    ['end', 27_000_000, 30_000_000],
  ]);
});
it.each([
  { frameRate: '30' as const, count: 90, deltas: [2] },
  { frameRate: '24' as const, count: 72, deltas: [2, 3] },
  { frameRate: '15' as const, count: 45, deltas: [4] },
])(
  'subsamples 60fps globally at $frameRate without changing source clocks',
  ({ frameRate, count, deltas }) => {
    const plan = sequence();
    const result = planPresentationPreview({
      sequence: plan,
      edge: 'beginning',
      width: 1920,
      height: 1080,
      preferences: { ...preferences, frameRate },
    });
    const frames = result.windows[0]!.frames;
    expect(frames).toHaveLength(count);
    expect(
      [...new Set(frames.slice(1).map((frame, index) => frame.tick - frames[index]!.tick))].sort()
    ).toEqual(deltas);
    const originals = [...iteratePresentationCandidates(plan)];
    for (const frame of frames) {
      expect(frame.sequenceTimeUs).toBe(originals[frame.tick]!.timestampUs);
      expect(frame.sequenceDurationUs).toBe(originals[frame.tick]!.durationUs);
    }
  }
);
it.each([
  { numerator: 30000, denominator: 1001 },
  { numerator: 60000, denominator: 1001 },
])(
  'preserves fractional joins, absolute audio rounding, and partial tail for $numerator',
  (rate) => {
    const plan = sequence(rate, 1.25, 0.1);
    const original = [...iteratePresentationCandidates(plan)];
    const result = preview(plan, 'ending');
    const window = result.windows.at(-1)!;
    expect(window.endUs).toBe(plan.totalDurationUs);
    expect(window.frames.at(-1)!.tick).toBe(plan.candidateCount - 1);
    expect(window.frames.at(-1)!.durationUs).toBe(original.at(-1)!.durationUs);
    expect(window.audioEnd).toBe(Math.round(plan.totalDurationUs * 0.048));
    for (const frame of window.frames) {
      expect(frame.sequenceTimeUs).toBe(original[frame.tick]!.timestampUs);
      expect(frame.containerTimeUs).toBe(frame.sequenceTimeUs - window.startUs);
      expect(frame.durationUs).toBeGreaterThan(0);
    }
    for (let index = 1; index < window.frames.length; index++) {
      expect(window.frames[index]!.tick - window.frames[index - 1]!.tick).toBeGreaterThanOrEqual(
        rate.numerator === 60000 ? 2 : 1
      );
    }
  }
);
it('retains final endpoint by replacement and never adds a close cadence burst', () => {
  const plan = sequence(undefined, 0.105);
  const window = preview(plan).windows[0]!;
  expect(window.frames.map((frame) => frame.tick)).toEqual([0, 2, 4, 6]);
  const replacement = preview(sequence(undefined, 0.1)).windows[0]!;
  expect(replacement.frames.map((frame) => frame.tick)).toEqual([0, 2, 5]);
  expect(replacement.frames.at(-1)!.sequenceTimeUs).toBe(83333);
});
it('aligns the selected start forward and clips exact audio before container rebasing', () => {
  const plan = sequence({ numerator: 60000, denominator: 1001 }, 10.005);
  const window = preview(plan, 'ending').windows[0]!;
  expect(window.startUs).toBeGreaterThanOrEqual(window.requestedStartUs);
  expect(window.endUs - window.startUs).toBeLessThanOrEqual(3_000_000);
  expect(window.audioStart).toBe(Math.round(window.startUs * 0.048));
  expect(window.audioEnd).toBe(480240);
  expect(window.frames[0]!.containerTimeUs).toBe(0);
  expect(window.frames.reduce((sum, frame) => sum + frame.durationUs, 0)).toBe(
    window.endUs - window.startUs
  );
});
it('preserves a one-microsecond whole window without inventing extra frames or duration', () => {
  const window = preview(sequence(undefined, 0.000001)).windows[0]!;
  expect(window.frames).toEqual([
    { tick: 0, sequenceTimeUs: 0, sequenceDurationUs: 1, containerTimeUs: 0, durationUs: 1 },
  ]);
  expect(window.audioStart).toBe(0);
  expect(window.audioEnd).toBe(0);
});
it.each([
  { width: 1920, height: 1080, expected: [640, 360] },
  { width: 1080, height: 1920, expected: [360, 640] },
  { width: 320, height: 180, expected: [320, 180] },
])(
  'caps both raster dimensions without upscaling $width×$height',
  ({ width, height, expected }) => {
    const result = planPresentationPreview({
      sequence: sequence(),
      edge: 'beginning',
      width,
      height,
      preferences,
    });
    expect([result.width, result.height]).toEqual(expected);
  }
);
it('honors a smaller named preview raster and rejects invalid geometry', () => {
  const input = {
    sequence: sequence(),
    edge: 'beginning' as const,
    width: 1080,
    height: 1920,
    preferences: { ...preferences, rasterPreset: '360p' as const },
  };
  expect(planPresentationPreview(input)).toMatchObject({ width: 202, height: 360 });
  expect(() => planPresentationPreview({ ...input, width: NaN })).toThrow(RangeError);
});

it.each([30000, 60000])('keeps an honest 29.97fps cadence for a %s/1001 export', (numerator) => {
  const frames = preview(sequence({ numerator, denominator: 1001 })).windows[0]!.frames;
  expect(frames).toHaveLength(90);
  expect(frames.map((frame) => frame.tick)).toEqual(
    Array.from({ length: 90 }, (_, index) => index * (numerator === 60000 ? 2 : 1))
  );
});
it('keeps end-window work and memory bounded for a near-day-long sequence', () => {
  const plan = sequence({ numerator: 120, denominator: 1 }, 86_000, 60);
  for (const entry of preview(plan, 'ending').windows) {
    expect(entry.endUs - entry.startUs).toBeLessThanOrEqual(4_000_000);
    expect(entry.frames.length).toBeLessThanOrEqual(120);
    expect(entry.frames[0]!.sequenceTimeUs).toBeGreaterThan(85_000_000_000);
  }
});
