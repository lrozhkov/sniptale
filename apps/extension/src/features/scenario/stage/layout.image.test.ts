import { expect, it } from 'vitest';

import { resolveScenarioImageRect } from './layout.image.ts';

it('centers and offsets image placement for editor previews', () => {
  expect(
    resolveScenarioImageRect({
      asset: { width: 1440, height: 900 },
      imageTransform: { scale: 1.25, x: 12, y: -18 },
      normalizedViewport: { x: 80, y: 40, width: 560, height: 320 },
      renderMode: 'editor',
      viewport: { x: 80, y: 40, width: 560, height: 320 },
    })
  ).toEqual({
    x: 52,
    y: -18,
    width: 640,
    height: 400,
  });
});

it('uses full-asset bounds in original render mode', () => {
  expect(
    resolveScenarioImageRect({
      asset: { width: 2880, height: 1800 },
      imageTransform: { scale: 1.25, x: 12, y: -18 },
      normalizedViewport: { x: 80, y: 40, width: 560, height: 320 },
      renderMode: 'original',
      viewport: { x: 0, y: 0, width: 2880, height: 1800 },
    })
  ).toEqual({
    x: 0,
    y: 0,
    width: 2880,
    height: 1800,
  });
});
