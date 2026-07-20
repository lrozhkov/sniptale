import { expect, it, vi } from 'vitest';

import { createScenarioSessionServicePendingCaptureApi } from './pending-capture';
import type { ScenarioSessionServiceCore } from '../types/index';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from '../../test-support';

function createSession(): ScenarioSessionState {
  return {
    enabled: true,
    captureMode: 'by-click',
    projectId: 'project-7',
    projectName: 'Project 7',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

function createSurface(): ScenarioRecorderSurfaceState {
  return {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario',
  };
}

function createPendingCaptureBridge(session: ScenarioSessionState) {
  const pendingCapture = createStoredPendingScenarioCapture();
  const resolvedPendingCapture = {
    ...pendingCapture,
    dataUrl: 'data:image/png;base64,resolved',
  };

  return {
    buffer: vi.fn(async () => ({ ...session, pendingProjectSelection: true })),
    clear: vi.fn(async () => ({ ...session, pendingProjectSelection: false })),
    clearIfCurrent: vi.fn(async () => ({ ...session, pendingProjectSelection: false })),
    consume: vi.fn(async () => resolvedPendingCapture),
    get: vi.fn(() => pendingCapture),
    has: vi.fn(() => true),
    resolve: vi.fn(async () => resolvedPendingCapture),
  } satisfies ScenarioSessionServiceCore['pendingCaptureBridge'];
}

function createCore(): ScenarioSessionServiceCore {
  const session = createSession();

  return {
    hydrationPromise: null,
    pendingCaptures: new Map(),
    revisions: new Map(),
    sessions: new Map([[7, session]]),
    surfaces: new Map(),
    clearTab: vi.fn(),
    ensureHydrated: vi.fn(async () => undefined),
    getMutableSession: vi.fn(() => session),
    getMutableSurface: vi.fn(() => createSurface()),
    pendingCaptureBridge: createPendingCaptureBridge(session),
    persistSessions: vi.fn(async () => undefined),
    runPersistedWrite: vi.fn((task) => task()),
  };
}

it('clones buffered and cleared pending-capture session results', async () => {
  const core = createCore();
  const pendingCaptureApi = createScenarioSessionServicePendingCaptureApi(core);
  const pendingCapture = createPendingScenarioCaptureInput();

  const buffered = await pendingCaptureApi.bufferPendingCapture(7, pendingCapture);
  const cleared = await pendingCaptureApi.clearPendingCapture(7);
  const conditionallyCleared = await pendingCaptureApi.clearPendingCaptureIfCurrent(
    7,
    core.pendingCaptureBridge.get(7)!
  );

  expect(buffered.pendingProjectSelection).toBe(true);
  expect(cleared.pendingProjectSelection).toBe(false);
  expect(conditionallyCleared.pendingProjectSelection).toBe(false);
  expect(buffered).not.toBe(await core.pendingCaptureBridge.buffer(7, pendingCapture));
  expect(cleared).not.toBe(await core.pendingCaptureBridge.clear(7));
  expect(conditionallyCleared).not.toBe(
    await core.pendingCaptureBridge.clearIfCurrent(7, core.pendingCaptureBridge.get(7)!)
  );
  await expect(pendingCaptureApi.consumePendingCapture(7)).resolves.toEqual(
    expect.objectContaining({
      id: 'pending-1',
      dataUrl: 'data:image/png;base64,resolved',
      pendingAssetId: 'pending-asset-1',
    })
  );
});
