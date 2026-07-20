import { expect, it } from 'vitest';
import { resolveArrowWingPair } from './arrow-wings';

it('keeps arrow wings as the compatibility facade for wing search', () => {
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
  ).toEqual(expect.objectContaining({ headStartIndex: 5 }));
});
