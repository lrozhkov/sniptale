import { beforeEach, expect, it, vi } from 'vitest';

const { createScenarioSessionServiceRuntimeMock } = vi.hoisted(() => ({
  createScenarioSessionServiceRuntimeMock: vi.fn(),
}));

vi.mock('../../runtime', () => ({
  createScenarioSessionServiceRuntime: createScenarioSessionServiceRuntimeMock,
}));

import { ScenarioSessionService } from './index';
import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from '../../test-support';

function createRuntime() {
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
  const pendingCaptureDescriptor = createStoredPendingScenarioCapture();
  const pendingCapture = {
    ...pendingCaptureDescriptor,
    dataUrl: 'data:image/png;base64,resolved',
  };

  return {
    pendingCapture,
    pendingCaptureDescriptor,
    session,
    surface,
    bufferPendingCapture: vi.fn(async () => session),
    bumpProjectRevision: vi.fn(async () => 7),
    clearPendingCapture: vi.fn(async () => session),
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

let runtime: ReturnType<typeof createRuntime>;

beforeEach(() => {
  vi.clearAllMocks();
  runtime = createRuntime();
  createScenarioSessionServiceRuntimeMock.mockReturnValue(runtime);
});

it('wires the class facade through the runtime seam without changing the public contract', async () => {
  const service = new ScenarioSessionService();

  await expect(service.getSession(7)).resolves.toEqual(runtime.session);
  expect(service.getPendingCapture(7)).toEqual(runtime.pendingCaptureDescriptor);
  expect(service.syncProjectRevision(7)).toBe(3);
  await expect(service.setEnabled(7, false)).resolves.toEqual(runtime.session);
  await expect(service.clearTab(7)).resolves.toBeUndefined();
  expect(runtime.getSession).toHaveBeenCalledWith(7);
  expect(runtime.setEnabled).toHaveBeenCalledWith(7, false);
  expect(runtime.clearTab).toHaveBeenCalledWith(7);
  expect(runtime.bufferPendingCapture).toHaveBeenCalledTimes(0);
  await expect(
    service.bufferPendingCapture(7, createPendingScenarioCaptureInput())
  ).resolves.toEqual(runtime.session);
  expect(runtime.bufferPendingCapture).toHaveBeenCalledWith(7, expect.any(Object));
});
