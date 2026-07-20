import { expect, it } from 'vitest';

import { resolveCameraViewportFrame } from './viewport';

it('resolves clamped camera viewport frames around a focus point', () => {
  expect(resolveCameraViewportFrame({ height: 800, width: 1200 }, { x: 900, y: 500 }, 2)).toEqual({
    viewportHeight: 400,
    viewportWidth: 600,
    viewportX: 600,
    viewportY: 300,
  });
  expect(resolveCameraViewportFrame({ height: 800, width: 1200 }, { x: 50, y: 50 }, 2)).toEqual(
    expect.objectContaining({ viewportX: 0, viewportY: 0 })
  );
});
