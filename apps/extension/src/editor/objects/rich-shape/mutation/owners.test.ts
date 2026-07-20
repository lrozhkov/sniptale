import { expect, it } from 'vitest';
import { getNormalizedRichShapeFrame, resolveFiniteNumber, resolveRichShapeScale } from './bounds';
import { cloneRichShape } from './clone';

it('keeps rich-shape scale normalization in the bounds owner', () => {
  expect(resolveFiniteNumber(Number.NaN, 12)).toBe(12);
  expect(resolveRichShapeScale(0)).toBe(1);
  expect(resolveRichShapeScale(-2)).toBe(2);
  expect(
    getNormalizedRichShapeFrame({
      height: Number.NaN,
      left: 4,
      sniptaleRichShape: { frame: { height: 10, left: 1, top: 2, width: 20 } },
      scaleX: -3,
      scaleY: 0,
      top: Number.NaN,
      width: 5,
    } as never)
  ).toEqual({ height: 10, left: 4, top: 2, width: 15 });
});

it('keeps rich-shape document cloning in the clone owner', () => {
  const shape = { frame: { height: 10, left: 1, top: 2, width: 20 } };
  const cloned = cloneRichShape(shape as never);

  expect(cloned).toEqual(shape);
  expect(cloned).not.toBe(shape);
});
