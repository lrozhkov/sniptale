import { describe, expect, it } from 'vitest';
import { resolveArrowWingPair } from './arrow-wing-search';

describe('editor-controller freehand arrow wing search owner', () => {
  it('finds the most symmetric opposite wing pair near the tip', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 24, y: 0 },
      { x: 48, y: 2 },
      { x: 72, y: 0 },
      { x: 96, y: 0 },
      { x: 74, y: -18 },
      { x: 96, y: 0 },
      { x: 72, y: 18 },
    ];

    expect(
      resolveArrowWingPair({
        points,
        shaftEnd: points[6]!,
        shaftStart: points[0]!,
        tipIndex: 6,
      })
    ).toEqual(
      expect.objectContaining({
        headStartIndex: 5,
        left: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        right: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        symmetry: expect.any(Number),
      })
    );
  });

  it('rejects short or one-sided arrow head candidates', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 18, y: 0 },
      { x: 30, y: -10 },
      { x: 42, y: 0 },
    ];

    expect(
      resolveArrowWingPair({
        points,
        shaftEnd: points[1]!,
        shaftStart: points[0]!,
        tipIndex: 1,
      })
    ).toBeNull();
  });
});
