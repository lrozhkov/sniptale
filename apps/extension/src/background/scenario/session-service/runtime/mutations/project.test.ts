import { expect, it, vi } from 'vitest';

import { createScenarioSessionServiceProjectMutationApi } from './project';
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

it('updates the active project and persists the session snapshot', async () => {
  const core = createCore();
  const api = createScenarioSessionServiceProjectMutationApi(core);

  await api.setActiveProject(7, { id: 'project-1', name: 'Project 1' });

  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(core.pendingCaptureBridge.has).toHaveBeenCalledWith(7);
  expect(core.persistSessions).toHaveBeenCalledTimes(1);
});
