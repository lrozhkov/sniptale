import { cloneScenarioSessionState } from '../../../helpers';
import type { ScenarioRestoreSnapshot } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionServiceCore } from '../../types/core';

export function createRestoreSnapshotApi(core: ScenarioSessionServiceCore) {
  return {
    async getRestoreSnapshot(
      tabId: number,
      projectRevision: number
    ): Promise<ScenarioRestoreSnapshot> {
      await core.ensureHydrated();
      return {
        session: cloneScenarioSessionState(core.getMutableSession(tabId)),
        surface: { ...core.getMutableSurface(tabId) },
        projectRevision,
      };
    },
  };
}
