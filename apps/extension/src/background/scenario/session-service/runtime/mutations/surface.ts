import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import { runPersistedMutation } from '../../persisted-mutation';
import { updateScenarioRecorderSurfaceState } from '../../service/mutations';
import type { ScenarioSessionServiceCore } from '../types/core';

export function createScenarioSessionServiceSurfaceMutationApi(core: ScenarioSessionServiceCore) {
  return {
    async updateSurfaceState(
      tabId: number,
      surfaceState: ScenarioRecorderSurfaceState
    ): Promise<ScenarioRecorderSurfaceState> {
      return runPersistedMutation({
        cloneResult: (surface) => ({ ...surface }),
        core,
        mutate: () =>
          updateScenarioRecorderSurfaceState(core.getMutableSurface(tabId), surfaceState),
      });
    },
  };
}
