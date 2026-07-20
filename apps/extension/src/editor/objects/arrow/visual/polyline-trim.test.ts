import { expect, it } from 'vitest';

import { trimPolyline } from './polyline-trim';

it('trims start and end edges while preserving the remaining polyline shape', () => {
  expect(
    trimPolyline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      4,
      6
    )
  ).toEqual([
    { x: 4, y: 0 },
    { x: 10, y: 0 },
    { x: 14, y: 0 },
  ]);
});
