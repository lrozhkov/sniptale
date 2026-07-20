import { expect, it } from 'vitest';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  setScenarioSessionActiveProject,
  setScenarioSessionCaptureMode,
  setScenarioSessionEnabled,
  setScenarioSessionRememberProjectSelection,
  setScenarioSessionSidebarVisible,
  updateScenarioRecorderSurfaceState,
} from './index';
import { setScenarioSessionActiveProject as setScenarioSessionActiveProjectImpl } from './project';
import {
  setScenarioSessionCaptureMode as setScenarioSessionCaptureModeImpl,
  setScenarioSessionEnabled as setScenarioSessionEnabledImpl,
  setScenarioSessionRememberProjectSelection as setScenarioSessionRememberProjectSelectionImpl,
  setScenarioSessionSidebarVisible as setScenarioSessionSidebarVisibleImpl,
} from './session-state';
import { updateScenarioRecorderSurfaceState as updateSurfaceStateImpl } from './surface';

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

function createSurface(
  overrides: Partial<ScenarioRecorderSurfaceState> = {}
): ScenarioRecorderSurfaceState {
  return {
    screenshotMode: false,
    toolbarVisible: false,
    captureAction: 'download_default',
    ...overrides,
  };
}

it('applies session and surface mutations without changing unrelated fields', () => {
  const session = createSession();
  const surface = createSurface();

  expect(setScenarioSessionEnabled).toBe(setScenarioSessionEnabledImpl);
  expect(setScenarioSessionCaptureMode).toBe(setScenarioSessionCaptureModeImpl);
  expect(setScenarioSessionSidebarVisible).toBe(setScenarioSessionSidebarVisibleImpl);
  expect(setScenarioSessionRememberProjectSelection).toBe(
    setScenarioSessionRememberProjectSelectionImpl
  );
  expect(setScenarioSessionActiveProject).toBe(setScenarioSessionActiveProjectImpl);
  expect(updateScenarioRecorderSurfaceState).toBe(updateSurfaceStateImpl);

  expect(setScenarioSessionEnabled(session, true)).toBe(session);
  expect(setScenarioSessionCaptureMode(session, 'by-click')).toBe(session);
  expect(setScenarioSessionSidebarVisible(session, false)).toBe(session);
  expect(setScenarioSessionRememberProjectSelection(session, false)).toBe(session);
  expect(
    setScenarioSessionActiveProject(
      session,
      { id: 'project-1', name: 'Project 1' },
      { rememberProjectSelection: true },
      false
    )
  ).toBe(session);
  expect(
    updateScenarioRecorderSurfaceState(surface, {
      screenshotMode: true,
      toolbarVisible: true,
      captureAction: 'scenario',
    })
  ).toBe(surface);

  expect(session).toEqual({
    enabled: true,
    captureMode: 'by-click',
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: false,
  });
  expect(surface).toEqual({
    screenshotMode: true,
    toolbarVisible: true,
    captureAction: 'scenario',
  });
});
