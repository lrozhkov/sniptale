import { expect, it, vi } from 'vitest';

import { createScenarioSessionServiceSurfaceMutationApi } from './surface';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionServiceCore } from '../types/index';

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
    captureAction: 'scenario',
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

function createCore(): ScenarioSessionServiceCore {
  return {
    clearTab: vi.fn(),
    getMutableSession: vi.fn(() => createSession()),
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

it('updates surface state and returns a cloned result', async () => {
  const core = createCore();
  const api = createScenarioSessionServiceSurfaceMutationApi(core);

  const result = await api.updateSurfaceState(7, {
    captureAction: 'download_default',
    screenshotMode: true,
    toolbarVisible: true,
  });

  expect(result).toEqual({
    captureAction: 'download_default',
    screenshotMode: true,
    toolbarVisible: true,
  });
  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(core.persistSessions).toHaveBeenCalledTimes(1);
});
