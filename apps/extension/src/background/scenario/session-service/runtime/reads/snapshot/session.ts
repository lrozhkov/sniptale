import { cloneScenarioSessionState } from '../../../helpers';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionServiceCore } from '../../types/core';

export function createSessionSnapshotApi(core: ScenarioSessionServiceCore) {
  return {
    async getSession(tabId: number): Promise<ScenarioSessionState> {
      await core.ensureHydrated();
      return cloneScenarioSessionState(core.getMutableSession(tabId));
    },
  };
}
