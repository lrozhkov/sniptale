import { expect, it } from 'vitest';
import { resolveObjectPoints, resolveObjectSamples } from './stored';

it('reads stored freehand point and sample metadata', () => {
  const object = {
    sniptaleBrushPointsJson: '[{"x":1,"y":2},{"x":"bad","y":3}]',
    sniptaleBrushSamplesJson: '[{"t":4,"x":5,"y":6},{"x":7,"y":8}]',
  };

  expect(resolveObjectPoints(object as never)).toEqual([{ x: 1, y: 2 }]);
  expect(resolveObjectSamples(object as never)).toEqual([{ t: 4, x: 5, y: 6 }]);
});
