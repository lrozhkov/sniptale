import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';

export function updateScenarioRecorderSurfaceState(
  surface: ScenarioRecorderSurfaceState,
  surfaceState: ScenarioRecorderSurfaceState
): ScenarioRecorderSurfaceState {
  surface.screenshotMode = surfaceState.screenshotMode;
  surface.toolbarVisible = surfaceState.toolbarVisible;
  surface.captureAction = surfaceState.captureAction;
  return surface;
}
