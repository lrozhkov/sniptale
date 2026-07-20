import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import { setScenarioSessionActiveProject } from '../../service/mutations';
import { runPersistedMutation } from '../../persisted-mutation';
import type { ScenarioSessionServiceCore } from '../types/core';

export function createScenarioSessionServiceProjectMutationApi(core: ScenarioSessionServiceCore) {
  return {
    async setActiveProject(
      tabId: number,
      project: { id: string | null; name: string | null },
      options: { rememberProjectSelection?: boolean } = {}
    ): Promise<ScenarioSessionState> {
      return runPersistedMutation({
        cloneResult: (session) => ({ ...session }),
        core,
        mutate: () =>
          setScenarioSessionActiveProject(
            core.getMutableSession(tabId),
            project,
            options,
            core.pendingCaptureBridge.has(tabId)
          ),
      });
    },
  };
}
