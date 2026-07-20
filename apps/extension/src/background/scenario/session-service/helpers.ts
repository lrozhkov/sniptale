import type { PendingScenarioCapture, ScenarioStoredTabState } from './types';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';

export function createDefaultScenarioSessionState(): ScenarioSessionState {
  return {
    enabled: false,
    captureMode: 'manual',
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
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

export function cloneScenarioSessionState(session: ScenarioSessionState): ScenarioSessionState {
  return {
    ...session,
  };
}

export function hydrateScenarioSessionMaps(args: {
  pendingCaptures: Map<number, PendingScenarioCapture>;
  sessions: Map<number, ScenarioSessionState>;
  storedSessions: Map<number, ScenarioStoredTabState>;
  surfaces: Map<number, ScenarioRecorderSurfaceState>;
}) {
  args.pendingCaptures.clear();
  args.sessions.clear();
  args.surfaces.clear();
  args.storedSessions.forEach((state, tabId) => {
    args.sessions.set(tabId, state.session);
    args.surfaces.set(tabId, state.surface);
    if (state.pendingCapture) {
      args.pendingCaptures.set(tabId, state.pendingCapture);
    }
  });
}

export function serializeScenarioSessionMaps(args: {
  getMutableSurface: (tabId: number) => ScenarioRecorderSurfaceState;
  pendingCaptures: Map<number, PendingScenarioCapture>;
  sessions: Map<number, ScenarioSessionState>;
}): Map<number, ScenarioStoredTabState> {
  const serializedState = new Map<number, ScenarioStoredTabState>();

  args.sessions.forEach((session, tabId) => {
    serializedState.set(tabId, {
      pendingCapture: args.pendingCaptures.get(tabId) ?? null,
      session,
      surface: args.getMutableSurface(tabId),
    });
  });

  return serializedState;
}
