import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioStoredTabState } from './contracts';
import {
  parseStoredPendingScenarioCapture,
  parseStoredScenarioSessionState,
  parseStoredScenarioSurfaceState,
} from './guards';

const SCENARIO_SESSION_STORAGE_KEY = 'scenario-tab-sessions';

type ScenarioStoredSessionMap =
  | Record<string, ScenarioSessionState>
  | Record<string, ScenarioStoredTabState>;

function normalizeStoredSession(session: ScenarioSessionState): ScenarioSessionState {
  return {
    ...session,
    sidebarVisible: session.sidebarVisible ?? true,
  };
}

function normalizeStoredSurface(
  surface: Partial<ScenarioRecorderSurfaceState> | null | undefined
): ScenarioRecorderSurfaceState {
  return {
    screenshotMode: surface?.screenshotMode ?? false,
    toolbarVisible: surface?.toolbarVisible ?? false,
    captureAction: surface?.captureAction ?? 'download_default',
  };
}

function isStoredTabState(value: unknown): value is ScenarioStoredTabState {
  return typeof value === 'object' && value !== null && 'session' in value;
}

function isLegacyStoredSession(value: unknown): value is ScenarioSessionState {
  return typeof value === 'object' && value !== null && !('session' in value);
}

/**
 * Restores persisted per-tab scenario session state from chrome.storage.session.
 */
export async function readStoredScenarioSessions(): Promise<Map<number, ScenarioStoredTabState>> {
  const stored = await browserStorage.session.get(SCENARIO_SESSION_STORAGE_KEY);
  const rawSessions = stored[SCENARIO_SESSION_STORAGE_KEY];
  if (typeof rawSessions !== 'object' || rawSessions === null) {
    return new Map();
  }

  const sessionMap = new Map<number, ScenarioStoredTabState>();
  for (const [tabId, entry] of Object.entries(rawSessions as ScenarioStoredSessionMap)) {
    const numericTabId = Number(tabId);
    if (Number.isFinite(numericTabId)) {
      if (isStoredTabState(entry)) {
        const parsedSession = parseStoredScenarioSessionState(entry.session);
        if (!parsedSession) {
          continue;
        }

        sessionMap.set(numericTabId, {
          pendingCapture: parseStoredPendingScenarioCapture(entry.pendingCapture),
          session: normalizeStoredSession(parsedSession),
          surface: normalizeStoredSurface(parseStoredScenarioSurfaceState(entry.surface)),
        });
        continue;
      }

      if (isLegacyStoredSession(entry)) {
        const parsedSession = parseStoredScenarioSessionState(entry);
        if (!parsedSession) {
          continue;
        }

        sessionMap.set(numericTabId, {
          pendingCapture: null,
          session: normalizeStoredSession(parsedSession),
          surface: normalizeStoredSurface(null),
        });
      }
    }
  }

  return sessionMap;
}

/**
 * Persists the current per-tab scenario session map to chrome.storage.session.
 */
export async function writeStoredScenarioSessions(
  sessions: ReadonlyMap<number, ScenarioStoredTabState>
): Promise<void> {
  if (sessions.size === 0) {
    await browserStorage.session.remove(SCENARIO_SESSION_STORAGE_KEY);
    return;
  }

  const serialized: Record<string, ScenarioStoredTabState> = {};
  for (const [tabId, state] of sessions.entries()) {
    serialized[String(tabId)] = state;
  }

  await browserStorage.session.set({
    [SCENARIO_SESSION_STORAGE_KEY]: serialized,
  });
}
