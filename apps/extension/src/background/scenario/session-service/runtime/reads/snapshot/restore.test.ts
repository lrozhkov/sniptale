import { expect, it, vi } from 'vitest';

import { createRestoreSnapshotApi } from './restore';
import type { ScenarioSessionServiceCore } from '../../types/index';

function createCore(): ScenarioSessionServiceCore {
  const session = {
    enabled: true,
    captureMode: 'by-click' as const,
    projectId: 'project-7',
    projectName: 'Project 7',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
  const surface = {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario' as const,
  };

  return {
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map([[7, session]]),
    surfaces: new Map([[7, surface]]),
    clearTab: vi.fn(),
    ensureHydrated: vi.fn(async () => undefined),
    getMutableSession: vi.fn(() => session),
    getMutableSurface: vi.fn(() => surface),
    pendingCaptureBridge: {
      buffer: vi.fn(),
      clear: vi.fn(),
      consume: vi.fn(),
      get: vi.fn(),
      has: vi.fn(),
      resolve: vi.fn(),
    },
    persistSessions: vi.fn(async () => undefined),
  } as unknown as ScenarioSessionServiceCore;
}

it('hydrates before building the restore snapshot', async () => {
  const core = createCore();

  const snapshot = await createRestoreSnapshotApi(core).getRestoreSnapshot(7, 9);

  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(snapshot).toEqual({
    projectRevision: 9,
    session: core.getMutableSession(7),
    surface: core.getMutableSurface(7),
  });
  expect(snapshot.session).not.toBe(core.getMutableSession(7));
  expect(snapshot.surface).not.toBe(core.getMutableSurface(7));
});
