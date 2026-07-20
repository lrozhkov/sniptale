import { expect, it } from 'vitest';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import { setScenarioSessionActiveProject } from './project';

function createSession(overrides: Partial<ScenarioSessionState> = {}): ScenarioSessionState {
  return {
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: true,
    ...overrides,
  };
}

it('updates the active project in place and returns the same session object', () => {
  const session = createSession();

  expect(
    setScenarioSessionActiveProject(
      session,
      { id: 'project-1', name: 'Project 1' },
      { rememberProjectSelection: true },
      false
    )
  ).toBe(session);
  expect(session).toEqual({
    enabled: false,
    captureMode: 'manual',
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  });
});
