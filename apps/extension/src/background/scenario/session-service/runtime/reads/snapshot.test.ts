import { expect, it, vi } from 'vitest';

import { createScenarioSessionServiceSnapshotApi } from './snapshot/index';
import type { ScenarioSessionServiceCore } from '../types/index';

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
      consume: vi.fn(async () => ({ id: 'capture-1', dataUrl: 'data:image/png;base64,resolved' })),
      get: vi.fn(() => ({ id: 'capture-1' })),
      has: vi.fn(() => true),
      resolve: vi.fn(async () => ({ id: 'capture-1', dataUrl: 'data:image/png;base64,resolved' })),
    },
    persistSessions: vi.fn(async () => undefined),
  } as unknown as ScenarioSessionServiceCore;
}

it('clones session and surface reads while delegating pending-capture lookups', async () => {
  const core = createCore();
  const reads = createScenarioSessionServiceSnapshotApi(core);

  const session = await reads.getSession(7);
  const surface = await reads.getSurface(7);
  const restoreSnapshot = await reads.getRestoreSnapshot(7, 9);

  expect(session).toEqual(core.getMutableSession(7));
  expect(session).not.toBe(core.getMutableSession(7));
  expect(surface).toEqual(core.getMutableSurface(7));
  expect(surface).not.toBe(core.getMutableSurface(7));
  expect(restoreSnapshot).toEqual({
    projectRevision: 9,
    session,
    surface,
  });
  expect(reads.getPendingCapture(7)).toEqual({ id: 'capture-1' });
  expect(reads.hasPendingCapture(7)).toBe(true);
  await expect(reads.resolvePendingCapture(7)).resolves.toEqual({
    id: 'capture-1',
    dataUrl: 'data:image/png;base64,resolved',
  });
  await expect(reads.consumePendingCapture(7)).resolves.toEqual({
    id: 'capture-1',
    dataUrl: 'data:image/png;base64,resolved',
  });
});
