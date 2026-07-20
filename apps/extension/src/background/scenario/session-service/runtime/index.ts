import { bumpScenarioProjectRevision, syncScenarioProjectRevision } from '../revision';
import {
  createScenarioSessionServiceProjectMutationApi,
  createScenarioSessionServiceSessionStateMutationApi,
  createScenarioSessionServiceSurfaceMutationApi,
} from './mutations';
import {
  createScenarioSessionServicePendingCaptureApi,
  createScenarioSessionServiceSnapshotApi,
} from './reads';
import type { ScenarioSessionServiceCore } from './types/core';
import type { ScenarioSessionServiceRuntime } from './types/index';
import { createScenarioSessionServiceCore } from './core/index';

function createScenarioSessionServiceRevisionApi(core: ScenarioSessionServiceCore) {
  return {
    async bumpProjectRevision(tabId: number): Promise<number> {
      await core.ensureHydrated();
      return bumpScenarioProjectRevision(core.revisions, tabId);
    },
    syncProjectRevision(tabId: number, options: { hasActiveProject?: boolean } = {}): number {
      return syncScenarioProjectRevision(core.revisions, tabId, options);
    },
  };
}

function createScenarioSessionServiceMutationApi(core: ScenarioSessionServiceCore) {
  return {
    ...createScenarioSessionServicePendingCaptureApi(core),
    ...createScenarioSessionServiceProjectMutationApi(core),
    ...createScenarioSessionServiceSessionStateMutationApi(core),
    ...createScenarioSessionServiceSurfaceMutationApi(core),
  };
}

export function createScenarioSessionServiceRuntime(): ScenarioSessionServiceRuntime {
  const core = createScenarioSessionServiceCore();
  return {
    ...core,
    ...createScenarioSessionServiceSnapshotApi(core),
    ...createScenarioSessionServiceMutationApi(core),
    ...createScenarioSessionServiceRevisionApi(core),
  };
}
