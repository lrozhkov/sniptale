import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServiceRevisionApiContext = Pick<
  ScenarioSessionServiceRuntime,
  'bumpProjectRevision' | 'syncProjectRevision'
>;

export function createScenarioSessionServiceRevisionApi(
  runtime: ScenarioSessionServiceRevisionApiContext
) {
  return {
    async bumpProjectRevision(tabId: number) {
      return runtime.bumpProjectRevision(tabId);
    },
    syncProjectRevision(tabId: number, options: { hasActiveProject?: boolean } = {}) {
      return runtime.syncProjectRevision(tabId, options);
    },
  };
}
