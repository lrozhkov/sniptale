import { expect, it, vi } from 'vitest';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import { createScenarioSessionServiceSessionStateAuthority } from './session-state-authority';
import type { ScenarioSessionServiceCore } from '../runtime/types/index';

function createSession(): ScenarioSessionState {
  return {
    captureMode: 'manual',
    enabled: false,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: true,
  };
}

function createSurface(): ScenarioRecorderSurfaceState {
  return {
    captureAction: 'download_default',
    screenshotMode: false,
    toolbarVisible: false,
  };
}

function createPendingCaptureBridge(): ScenarioSessionServiceCore['pendingCaptureBridge'] {
  return {
    buffer: vi.fn(async () => createSession()),
    clear: vi.fn(async () => createSession()),
    clearIfCurrent: vi.fn(async () => createSession()),
    consume: vi.fn(async () => null),
    get: vi.fn(() => null),
    has: vi.fn(() => true),
    resolve: vi.fn(async () => null),
  };
}

function createCore(session: ScenarioSessionState): ScenarioSessionServiceCore {
  return {
    clearTab: vi.fn(),
    getMutableSession: vi.fn(() => session),
    getMutableSurface: vi.fn(() => createSurface()),
    hydrationPromise: null,
    pendingCaptures: new Map(),
    pendingCaptureBridge: createPendingCaptureBridge(),
    revisions: new Map(),
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    sessions: new Map(),
    persistSessions: vi.fn().mockResolvedValue(undefined),
    runPersistedWrite: vi.fn((task) => task()),
    surfaces: new Map(),
  };
}

it('owns session-state mutation persistence and returns cloned state snapshots', async () => {
  const session = createSession();
  const core = createCore(session);
  const authority = createScenarioSessionServiceSessionStateAuthority(core);

  const enabledState = await authority.setEnabled(7, true);
  const captureModeState = await authority.setCaptureMode(7, 'by-click');
  const rememberProjectSelectionState = await authority.setRememberProjectSelection(7, false);
  const sidebarVisibleState = await authority.setSidebarVisible(7, false);

  expect(core.ensureHydrated).toHaveBeenCalledTimes(4);
  expect(core.persistSessions).toHaveBeenCalledTimes(4);
  expect(enabledState.enabled).toBe(true);
  expect(captureModeState.captureMode).toBe('by-click');
  expect(rememberProjectSelectionState.rememberProjectSelection).toBe(false);
  expect(sidebarVisibleState.sidebarVisible).toBe(false);
  expect(enabledState).not.toBe(session);
});
