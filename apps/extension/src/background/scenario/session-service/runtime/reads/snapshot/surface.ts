import type { ScenarioRecorderSurfaceState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionServiceCore } from '../../types/core';

export function createSurfaceSnapshotApi(core: ScenarioSessionServiceCore) {
  return {
    async getSurface(tabId: number): Promise<ScenarioRecorderSurfaceState> {
      await core.ensureHydrated();
      return { ...core.getMutableSurface(tabId) };
    },
  };
}
