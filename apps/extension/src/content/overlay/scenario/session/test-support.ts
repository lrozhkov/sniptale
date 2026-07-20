import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

export function createScenarioSession(
  overrides: Partial<ScenarioSessionState> = {}
): ScenarioSessionState {
  return {
    enabled: true,
    captureMode: 'manual',
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
    ...overrides,
  };
}
