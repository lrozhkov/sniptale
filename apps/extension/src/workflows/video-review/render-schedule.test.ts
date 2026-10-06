import { describe, expect, it } from 'vitest';
import { reviewRenderFrameSchedule } from './render-schedule';

function cutEdit(start: number, end: number) {
  return {
    id: `cut-${start}`,
    kind: 'cut' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
  };
}

function speedEdit(start: number, end: number) {
  return {
    id: `speed-${start}`,
    kind: 'speed' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
    rate: 0.5 as const,
    audio: 'speed' as const,
  };
}

describe('reviewRenderFrameSchedule', () => {
  it('covers an unedited duration exactly on the fps lattice', () => {
    const windows = reviewRenderFrameSchedule(2.5, [], 10);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.timestamps).toHaveLength(25);
    expect(windows[0]!.timestamps[0]).toBe(0);
    expect(windows[0]!.timestamps.at(-1)).toBe(2.4);
    expect(windows[0]!.sourceTimes[0]).toBe(0);
    expect(windows[0]!.sourceTimes.at(-1)).toBeCloseTo(2.4, 9);
  });

  it('shifts timestamps across cuts and resamples speed segments', () => {
    const windows = reviewRenderFrameSchedule(10, [cutEdit(1, 3), speedEdit(5, 7)], 2);
    expect(windows).toHaveLength(4);
    expect(windows[0]!.segment).toMatchObject({ sourceStart: 0, sourceEnd: 1, resultStart: 0 });
    expect(windows[1]!.segment).toMatchObject({ sourceStart: 3, sourceEnd: 5, resultStart: 1 });
    expect(windows[2]!.segment).toMatchObject({
      sourceStart: 5,
      sourceEnd: 7,
      resultStart: 3,
      rate: 0.5,
    });
    expect(windows[3]!.segment).toMatchObject({ sourceStart: 7, sourceEnd: 10, resultStart: 7 });
    expect(windows[2]!.timestamps).toHaveLength(8);
    expect(windows[2]!.timestamps[0]).toBe(3);
    expect(windows[2]!.sourceTimes[2]).toBeCloseTo(5.5, 9);
  });

  it('renders both visible speed fragments around a cut with a continuous output clock', () => {
    const windows = reviewRenderFrameSchedule(10, [speedEdit(1, 7), cutEdit(3, 5)], 2);
    expect(
      windows.map((window) => ({
        start: window.segment.sourceStart,
        end: window.segment.sourceEnd,
        kind: window.segment.kind,
        resultStart: window.segment.resultStart,
      }))
    ).toEqual([
      { start: 0, end: 1, kind: 'keep', resultStart: 0 },
      { start: 1, end: 3, kind: 'speed', resultStart: 1 },
      { start: 5, end: 7, kind: 'speed', resultStart: 5 },
      { start: 7, end: 10, kind: 'keep', resultStart: 9 },
    ]);
  });

  it('keeps frames over a sub-frame tail and rejects invalid frame rates', () => {
    const windows = reviewRenderFrameSchedule(0.1, [], 30);
    expect(windows[0]!.timestamps).toHaveLength(3);
    expect(() => reviewRenderFrameSchedule(1, [], 0)).toThrow('Render frame rate is invalid.');
  });
});

it('selects bounded sample windows on the same output clock without allocating the full video', () => {
  const sampled = reviewRenderFrameSchedule(36000, [], 60, [
    { start: 0, end: 2 },
    { start: 17999, end: 18001 },
    { start: 35998, end: 36000 },
  ]);
  expect(sampled.flatMap((window) => window.timestamps)).toHaveLength(360);
  expect(sampled[1]!.sourceTimes[0]).toBe(17999);
  const sped = reviewRenderFrameSchedule(10, [speedEdit(2, 6)], 30, [{ start: 3, end: 4 }]);
  expect(sped.flatMap((window) => window.timestamps)).toHaveLength(30);
  expect(sped[0]!.sourceTimes[0]).toBe(2.5);
});
