import { expect, it, vi } from 'vitest';

import { createPendingCaptureSnapshotApi } from './pending-capture';
import type { ScenarioSessionServiceCore } from '../../types/index';

function createCore(): ScenarioSessionServiceCore {
  const pendingCapture = { id: 'capture-1' };

  return {
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map(),
    surfaces: new Map(),
    clearTab: vi.fn(),
    ensureHydrated: vi.fn(async () => undefined),
    getMutableSession: vi.fn(),
    getMutableSurface: vi.fn(),
    pendingCaptureBridge: {
      buffer: vi.fn(),
      clear: vi.fn(),
      consume: vi.fn(async () => ({ id: 'capture-1', dataUrl: 'data:image/png;base64,resolved' })),
      get: vi.fn(() => pendingCapture),
      has: vi.fn(() => true),
      resolve: vi.fn(async () => ({ id: 'capture-1', dataUrl: 'data:image/png;base64,resolved' })),
    },
    persistSessions: vi.fn(async () => undefined),
  } as unknown as ScenarioSessionServiceCore;
}

it('forwards pending-capture reads to the bridge', async () => {
  const core = createCore();
  const api = createPendingCaptureSnapshotApi(core);

  expect(api.getPendingCapture(7)).toEqual({ id: 'capture-1' });
  expect(api.hasPendingCapture(7)).toBe(true);
  await expect(api.resolvePendingCapture(7)).resolves.toEqual({
    id: 'capture-1',
    dataUrl: 'data:image/png;base64,resolved',
  });
  await expect(api.consumePendingCapture(7)).resolves.toEqual({
    id: 'capture-1',
    dataUrl: 'data:image/png;base64,resolved',
  });
});
