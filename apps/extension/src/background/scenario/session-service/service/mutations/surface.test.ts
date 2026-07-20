import { expect, it } from 'vitest';
import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import { updateScenarioRecorderSurfaceState } from './surface';

function createSurface(
  overrides: Partial<ScenarioRecorderSurfaceState> = {}
): ScenarioRecorderSurfaceState {
  return {
    screenshotMode: false,
    toolbarVisible: false,
    captureAction: 'download_default',
    ...overrides,
  };
}

it('mutates the recorder surface state in place', () => {
  const surface = createSurface();

  expect(
    updateScenarioRecorderSurfaceState(surface, {
      screenshotMode: true,
      toolbarVisible: true,
      captureAction: 'scenario',
    })
  ).toBe(surface);
  expect(surface).toEqual({
    screenshotMode: true,
    toolbarVisible: true,
    captureAction: 'scenario',
  });
});
