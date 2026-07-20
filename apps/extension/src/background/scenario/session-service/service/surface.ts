import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServiceSurfaceApiContext = Pick<
  ScenarioSessionServiceRuntime,
  'getSurface' | 'updateSurfaceState'
>;

export function createScenarioSessionServiceSurfaceApi(
  runtime: ScenarioSessionServiceSurfaceApiContext
) {
  return {
    async getSurface(tabId: number) {
      return runtime.getSurface(tabId);
    },
    async updateSurfaceState(
      tabId: number,
      surfaceState: Parameters<ScenarioSessionServiceRuntime['updateSurfaceState']>[1]
    ) {
      return runtime.updateSurfaceState(tabId, surfaceState);
    },
  };
}
