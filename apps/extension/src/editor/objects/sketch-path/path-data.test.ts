import { expect, it } from 'vitest';

import { buildSketchPolylinePathData } from './path-data';

it('builds fallback and sampled sketch path data', () => {
  const options = { bowing: 0, roughness: 0, seed: 1, strokeWidth: 2 };

  expect(buildSketchPolylinePathData([], options)).toBe('M 0 0 L 0 0');
  expect(
    buildSketchPolylinePathData(
      [
        { x: 0, y: 0 },
        { x: 28, y: 0 },
      ],
      options
    )
  ).toContain('L 28 0');
});
