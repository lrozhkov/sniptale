import { expect, it, vi } from 'vitest';

import { createSurfaceSnapshotApi } from './surface';
import type { ScenarioSessionServiceCore } from '../../types/index';

function createCore(): ScenarioSessionServiceCore {
  const surface = {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario' as const,
  };

  return {
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map(),
    surfaces: new Map([[7, surface]]),
    clearTab: vi.fn(),
    ensureHydrated: vi.fn(async () => undefined),
    getMutableSession: vi.fn(),
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

it('hydrates before cloning the surface snapshot', async () => {
  const core = createCore();

  const surface = await createSurfaceSnapshotApi(core).getSurface(7);

  expect(core.ensureHydrated).toHaveBeenCalledTimes(1);
  expect(surface).toEqual(core.getMutableSurface(7));
  expect(surface).not.toBe(core.getMutableSurface(7));
});
