import { beforeEach, expect, it, vi } from 'vitest';

import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from '../../test-support';
import { createScenarioSessionServiceForwarders } from './forwarders';

function createRuntime() {
  const session = createSession();
  const surface = createSurface();
  const pendingCaptureDescriptor = createStoredPendingScenarioCapture();
  const pendingCapture = {
    ...pendingCaptureDescriptor,
    dataUrl: 'data:image/png;base64,resolved',
  };
  const runtimeState = createRuntimeState(
    session,
    surface,
    pendingCaptureDescriptor,
    pendingCapture
  );

  return {
    pendingCapture,
    pendingCaptureDescriptor,
    session,
    surface,
    ...runtimeState,
    bufferPendingCapture: vi.fn(async () => session),
    bumpProjectRevision: vi.fn(async () => 7),
    clearPendingCapture: vi.fn(async () => session),
    clearPendingCaptureIfCurrent: vi.fn(async () => session),
    clearTab: vi.fn(),
    consumePendingCapture: vi.fn(async () => pendingCapture),
    getPendingCapture: vi.fn(() => pendingCaptureDescriptor),
    getRestoreSnapshot: vi.fn(async () => ({ projectRevision: 9, session, surface })),
    getSession: vi.fn(async () => session),
    getSurface: vi.fn(async () => surface),
    hasPendingCapture: vi.fn(() => true),
    resolvePendingCapture: vi.fn(async () => pendingCapture),
    setActiveProject: vi.fn(async () => session),
    setCaptureMode: vi.fn(async () => session),
    setEnabled: vi.fn(async () => session),
    setRememberProjectSelection: vi.fn(async () => session),
    setSidebarVisible: vi.fn(async () => session),
    syncProjectRevision: vi.fn(() => 3),
    updateSurfaceState: vi.fn(async () => surface),
  };
}

function createSession() {
  return {
    enabled: true,
    captureMode: 'by-click' as const,
    projectId: 'project-7',
    projectName: 'Project 7',
    rememberProjectSelection: true,
    pendingProjectSelection: false,
    sidebarVisible: true,
  };
}

function createSurface() {
  return {
    screenshotMode: true,
    toolbarVisible: false,
    captureAction: 'scenario' as const,
  };
}

function createRuntimeState(
  session: ReturnType<typeof createSession>,
  surface: ReturnType<typeof createSurface>,
  pendingCaptureDescriptor: ReturnType<typeof createStoredPendingScenarioCapture>,
  pendingCapture: ReturnType<typeof createStoredPendingScenarioCapture> & { dataUrl: string }
) {
  return {
    hydrationPromise: null,
    pendingCaptures: new Map([[7, pendingCaptureDescriptor]]),
    revisions: new Map([[7, 9]]),
    sessions: new Map([[7, session]]),
    surfaces: new Map([[7, surface]]),
    ensureHydrated: vi.fn(async () => {}),
    getMutableSession: vi.fn(() => session),
    getMutableSurface: vi.fn(() => surface),
    pendingCaptureBridge: {
      buffer: vi.fn(async () => session),
      clear: vi.fn(async () => session),
      clearIfCurrent: vi.fn(async () => session),
      consume: vi.fn(async () => pendingCapture),
      get: vi.fn(() => pendingCaptureDescriptor),
      has: vi.fn(() => true),
      resolve: vi.fn(async () => pendingCapture),
    },
    persistSessions: vi.fn(async () => {}),
    runPersistedWrite: vi.fn((task) => task()),
  };
}

let runtime: ReturnType<typeof createRuntime>;

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createRuntime();
});

it('composes runtime forwarders across reads, mutations, and tab helpers', async () => {
  const api = createScenarioSessionServiceForwarders(runtime);

  await expect(api.getSession(7)).resolves.toEqual(runtime.session);
  await expect(api.getSurface(7)).resolves.toEqual(runtime.surface);
  await expect(api.getRestoreSnapshot(7, 9)).resolves.toEqual({
    projectRevision: 9,
    session: runtime.session,
    surface: runtime.surface,
  });
  expect(api.getPendingCapture(7)).toEqual(runtime.pendingCaptureDescriptor);
  expect(api.hasPendingCapture(7)).toBe(true);
  await expect(api.resolvePendingCapture(7)).resolves.toEqual(runtime.pendingCapture);
  await expect(api.consumePendingCapture(7)).resolves.toEqual(runtime.pendingCapture);
  expect(api.syncProjectRevision(7)).toBe(3);
  await expect(api.bumpProjectRevision(7)).resolves.toBe(7);
  await expect(api.updateSurfaceState(7, runtime.surface)).resolves.toEqual(runtime.surface);
  await expect(api.setEnabled(7, false)).resolves.toEqual(runtime.session);
  await expect(api.setCaptureMode(7, 'manual')).resolves.toEqual(runtime.session);
  await expect(api.setSidebarVisible(7, false)).resolves.toEqual(runtime.session);
  await expect(api.setRememberProjectSelection(7, false)).resolves.toEqual(runtime.session);
  await expect(api.setActiveProject(7, { id: 'project-7', name: 'Project 7' })).resolves.toEqual(
    runtime.session
  );
  await expect(api.bufferPendingCapture(7, createPendingScenarioCaptureInput())).resolves.toEqual(
    runtime.session
  );
  await expect(api.clearPendingCapture(7)).resolves.toEqual(runtime.session);
  await expect(
    api.clearPendingCaptureIfCurrent(7, runtime.pendingCaptureDescriptor)
  ).resolves.toEqual(runtime.session);
  await expect(api.clearTab(7)).resolves.toBeUndefined();
  expect(runtime.getSession).toHaveBeenCalledWith(7);
  expect(runtime.getSurface).toHaveBeenCalledWith(7);
  expect(runtime.setEnabled).toHaveBeenCalledWith(7, false);
  expect(runtime.bufferPendingCapture).toHaveBeenCalledWith(7, expect.any(Object));
  expect(runtime.clearPendingCaptureIfCurrent).toHaveBeenCalledWith(
    7,
    runtime.pendingCaptureDescriptor
  );
  expect(runtime.clearTab).toHaveBeenCalledWith(7);
});
