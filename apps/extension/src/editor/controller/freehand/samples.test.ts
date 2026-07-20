import { describe, expect, it } from 'vitest';
import { normalizeFreehandStrokeSamples, readFreehandSamplePoints } from './samples';

describe('editor-controller freehand samples seam', () => {
  it('normalizes valid stroke samples and projects them back to plain points', () => {
    const samples = normalizeFreehandStrokeSamples([
      { t: 10, x: 2, y: 3 },
      { t: Number.NaN, x: 4, y: 5 },
      { t: 20, x: 'bad', y: 8 },
      { t: 30, x: 8, y: 13 },
    ] as never);

    expect(samples).toEqual([
      { t: 10, x: 2, y: 3 },
      { t: 30, x: 8, y: 13 },
    ]);
    expect(readFreehandSamplePoints(samples!)).toEqual([
      { x: 2, y: 3 },
      { x: 8, y: 13 },
    ]);
    expect(normalizeFreehandStrokeSamples([{ t: Number.NaN, x: 4, y: 5 }] as never)).toBeNull();
  });
});
