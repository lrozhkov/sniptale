import { expect, it } from 'vitest';

import { getSketchSegmentNormal, interpolateSketchPoint } from './geometry';

it('resolves sketch segment normals and interpolation points', () => {
  expect(getSketchSegmentNormal({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: -0, y: 1 });
  expect(getSketchSegmentNormal({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: -1 });
  expect(interpolateSketchPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.25)).toEqual({
    x: 2.5,
    y: 5,
  });
});
