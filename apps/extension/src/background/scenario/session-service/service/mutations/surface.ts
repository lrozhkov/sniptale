import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';

export function updateScenarioRecorderSurfaceState(
  surface: ScenarioRecorderSurfaceState,
  surfaceState: Partial<ScenarioRecorderSurfaceState>
): ScenarioRecorderSurfaceState {
  if (surfaceState.screenshotMode !== undefined)
    surface.screenshotMode = surfaceState.screenshotMode;
  if (surfaceState.toolbarVisible !== undefined)
    surface.toolbarVisible = surfaceState.toolbarVisible;
  if (surfaceState.captureAction !== undefined) surface.captureAction = surfaceState.captureAction;
  return surface;
}
