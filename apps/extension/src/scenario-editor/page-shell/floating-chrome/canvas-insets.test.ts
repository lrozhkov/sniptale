import { expect, it } from 'vitest';
import { resolveScenarioFloatingChromeCanvasInsets } from './canvas-insets';

it('resolves scenario canvas safe insets for floating chrome breakpoints', () => {
  expect(resolveScenarioFloatingChromeCanvasInsets({ height: 640, width: 700 })).toEqual({
    bottom: 188,
    left: 16,
    right: 16,
    top: 136,
  });
  expect(resolveScenarioFloatingChromeCanvasInsets({ height: 720, width: 1000 })).toEqual({
    bottom: 88,
    left: 304,
    right: 376,
    top: 136,
  });
  expect(resolveScenarioFloatingChromeCanvasInsets({ height: 1080, width: 1920 })).toEqual({
    bottom: 72,
    left: 336,
    right: 384,
    top: 96,
  });
});
