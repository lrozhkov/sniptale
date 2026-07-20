import { expect, it, vi } from 'vitest';

import { createSessionSnapshotApi } from './session';
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

  return {
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map([[7, session]]),
    surfaces: new Map(),
    clearTab: vi.fn(),
    ensureHydrated: vi.fn(async () => undefined),
    getMutableSession: vi.fn(() => session),
    getMutableSurface: vi.fn(),
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

it('hydrates before cloning the session snapshot', async () => {
  const core = createCore();

  const session = await createSessionSnapshotApi(core).getSession(7);

  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(session).toEqual(core.getMutableSession(7));
  expect(session).not.toBe(core.getMutableSession(7));
});
