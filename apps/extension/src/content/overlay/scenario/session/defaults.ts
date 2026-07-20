import type {
  ScenarioRecorderSurfaceState,
  ScenarioRestoreSnapshot,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioControllerResponse } from '../types';

export function createDefaultScenarioSession(): ScenarioSessionState {
  return {
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

export function createDefaultScenarioSurfaceState(): ScenarioRecorderSurfaceState {
  return {
    screenshotMode: false,
    toolbarVisible: false,
    captureAction: 'download_default',
  };
}

export function createDefaultScenarioRestoreSnapshot(): ScenarioRestoreSnapshot {
  return {
    session: createDefaultScenarioSession(),
    surface: createDefaultScenarioSurfaceState(),
    projectRevision: 0,
  };
}

export function shouldRestoreScenarioSurface(snapshot: ScenarioRestoreSnapshot): boolean {
  return (
    snapshot.session.enabled ||
    snapshot.surface.captureAction === 'scenario' ||
    snapshot.surface.toolbarVisible ||
    snapshot.surface.screenshotMode
  );
}

export function buildCreatedProjectResponse(args: {
  currentSession: ScenarioSessionState;
  nextProjectName: string;
  response: ScenarioControllerResponse;
}): ScenarioControllerResponse {
  const { currentSession, nextProjectName, response } = args;

  return {
    ...response,
    session: {
      ...currentSession,
      ...(response.session ?? {}),
      projectId: response.projectId ?? response.session?.projectId ?? currentSession.projectId,
      projectName: response.session?.projectName ?? nextProjectName,
      rememberProjectSelection:
        response.session?.rememberProjectSelection ?? currentSession.rememberProjectSelection,
      pendingProjectSelection: false,
      sidebarVisible: response.session?.sidebarVisible ?? currentSession.sidebarVisible,
    },
  };
}
