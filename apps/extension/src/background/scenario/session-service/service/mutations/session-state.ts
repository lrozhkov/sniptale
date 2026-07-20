import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

export function setScenarioSessionEnabled(
  session: ScenarioSessionState,
  enabled: boolean
): ScenarioSessionState {
  session.enabled = enabled;
  return session;
}

export function setScenarioSessionCaptureMode(
  session: ScenarioSessionState,
  captureMode: ScenarioSessionState['captureMode']
): ScenarioSessionState {
  session.captureMode = captureMode;
  return session;
}

export function setScenarioSessionSidebarVisible(
  session: ScenarioSessionState,
  sidebarVisible: boolean
): ScenarioSessionState {
  session.sidebarVisible = sidebarVisible;
  return session;
}

export function setScenarioSessionRememberProjectSelection(
  session: ScenarioSessionState,
  rememberProjectSelection: boolean
): ScenarioSessionState {
  session.rememberProjectSelection = rememberProjectSelection;
  return session;
}
