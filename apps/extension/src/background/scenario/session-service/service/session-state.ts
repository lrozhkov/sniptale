import type { ScenarioSessionServiceRuntime } from '../runtime/types/index';

type ScenarioSessionServiceSessionStateApiContext = Pick<
  ScenarioSessionServiceRuntime,
  | 'setActiveProject'
  | 'setCaptureMode'
  | 'setEnabled'
  | 'setRememberProjectSelection'
  | 'setSidebarVisible'
>;

export function createScenarioSessionServiceSessionStateApi(
  runtime: ScenarioSessionServiceSessionStateApiContext
) {
  return {
    async setActiveProject(
      tabId: number,
      project: { id: string | null; name: string | null },
      options: { rememberProjectSelection?: boolean } = {}
    ) {
      return runtime.setActiveProject(tabId, project, options);
    },
    async setCaptureMode(
      tabId: number,
      captureMode: Parameters<ScenarioSessionServiceRuntime['setCaptureMode']>[1]
    ) {
      return runtime.setCaptureMode(tabId, captureMode);
    },
    async setEnabled(tabId: number, enabled: boolean) {
      return runtime.setEnabled(tabId, enabled);
    },
    async setRememberProjectSelection(tabId: number, rememberProjectSelection: boolean) {
      return runtime.setRememberProjectSelection(tabId, rememberProjectSelection);
    },
    async setSidebarVisible(tabId: number, sidebarVisible: boolean) {
      return runtime.setSidebarVisible(tabId, sidebarVisible);
    },
  };
}
