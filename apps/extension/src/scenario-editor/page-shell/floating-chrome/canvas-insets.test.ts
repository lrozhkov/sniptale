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
    bottom: 168,
    left: 304,
    right: 376,
    top: 136,
  });
  expect(resolveScenarioFloatingChromeCanvasInsets({ height: 1080, width: 1920 })).toEqual({
    bottom: 176,
    left: 336,
    right: 384,
    top: 96,
  });
});

it('releases bottom canvas space when the floating timeline is hidden', () => {
  expect(
    resolveScenarioFloatingChromeCanvasInsets(
      { height: 720, width: 1000 },
      { timelineHidden: true }
    )
  ).toEqual({
    bottom: 88,
    left: 304,
    right: 376,
    top: 136,
  });
  expect(
    resolveScenarioFloatingChromeCanvasInsets(
      { height: 1080, width: 1920 },
      { timelineHidden: true }
    )
  ).toEqual({
    bottom: 72,
    left: 336,
    right: 384,
    top: 96,
  });
});
