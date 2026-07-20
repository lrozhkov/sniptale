import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServiceTabApiContext = Pick<ScenarioSessionServiceRuntime, 'clearTab'>;

export function createScenarioSessionServiceTabApi(runtime: ScenarioSessionServiceTabApiContext) {
  return {
    async clearTab(tabId: number) {
      return runtime.clearTab(tabId);
    },
  };
}
