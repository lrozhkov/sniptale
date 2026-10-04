import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { BackgroundRuntimeMessageDeps } from '../routing/boundary/shared';

export type ScenarioRestoreState = {
  shouldEnablePreparation: boolean;
  shouldRestore: boolean;
  shouldWriteForcedScenarioSurface: boolean;
  surface: ScenarioRecorderSurfaceState;
};

function shouldScenarioSurfaceRestore(surface: ScenarioRecorderSurfaceState): boolean {
  return surface.captureAction === 'scenario' || surface.screenshotMode || surface.toolbarVisible;
}

export async function readScenarioRestoreState(
  tabId: number,
  runtimeState: Pick<BackgroundRuntimeMessageDeps, 'scenarioSessionService'>
): Promise<ScenarioRestoreState> {
  const [session, surface] = await Promise.all([
    runtimeState.scenarioSessionService.getSession(tabId),
    runtimeState.scenarioSessionService.getSurface(tabId),
  ]);
  const shouldRestore = session.enabled || shouldScenarioSurfaceRestore(surface);
  return {
    shouldEnablePreparation: session.enabled || shouldScenarioSurfaceRestore(surface),
    shouldRestore,
    shouldWriteForcedScenarioSurface:
      session.enabled && (surface.captureAction !== 'scenario' || !surface.screenshotMode),
    surface,
  };
}
