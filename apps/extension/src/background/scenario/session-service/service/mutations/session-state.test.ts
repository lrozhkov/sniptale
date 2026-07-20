import { expect, it } from 'vitest';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import {
  setScenarioSessionCaptureMode,
  setScenarioSessionEnabled,
  setScenarioSessionRememberProjectSelection,
  setScenarioSessionSidebarVisible,
} from './session-state';

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

it('mutates the session state fields in place', () => {
  const session = createSession();

  expect(setScenarioSessionEnabled(session, true)).toBe(session);
  expect(setScenarioSessionCaptureMode(session, 'by-click')).toBe(session);
  expect(setScenarioSessionSidebarVisible(session, false)).toBe(session);
  expect(setScenarioSessionRememberProjectSelection(session, false)).toBe(session);

  expect(session).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    pendingProjectSelection: false,
    sidebarVisible: false,
  });
});
