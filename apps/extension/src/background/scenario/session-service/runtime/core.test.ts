import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPendingScenarioCaptureAssetMock,
  readStoredScenarioSessionsMock,
  resolvePendingScenarioCaptureMock,
  stagePendingScenarioCaptureMock,
  writeStoredScenarioSessionsMock,
} = vi.hoisted(() => ({
  clearPendingScenarioCaptureAssetMock: vi.fn(),
  readStoredScenarioSessionsMock: vi.fn(),
  resolvePendingScenarioCaptureMock: vi.fn(),
  stagePendingScenarioCaptureMock: vi.fn(),
  writeStoredScenarioSessionsMock: vi.fn(),
}));

vi.mock('../../../storage/scenario/session', () => ({
  readStoredScenarioSessions: readStoredScenarioSessionsMock,
  writeStoredScenarioSessions: writeStoredScenarioSessionsMock,
}));

vi.mock('../pending-assets', () => ({
  clearPendingScenarioCaptureAsset: clearPendingScenarioCaptureAssetMock,
  resolvePendingScenarioCapture: resolvePendingScenarioCaptureMock,
  stagePendingScenarioCapture: stagePendingScenarioCaptureMock,
}));

import { createScenarioSessionServiceCore } from './core/index';
import { runPersistedMutation } from './mutations/persisted';
import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from '../test-support';

function createDeferred() {
  let reject!: (error: Error) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  readStoredScenarioSessionsMock.mockResolvedValue(new Map());
  writeStoredScenarioSessionsMock.mockResolvedValue(undefined);
  clearPendingScenarioCaptureAssetMock.mockResolvedValue(undefined);
  resolvePendingScenarioCaptureMock.mockResolvedValue(null);
  stagePendingScenarioCaptureMock.mockResolvedValue({
    id: 'capture-1',
    pendingAssetId: 'pending-asset-1',
  });
});

it('creates a runtime core with isolated state buckets and pending-capture wiring', async () => {
  const core = createScenarioSessionServiceCore();

  expect(core.hydrationPromise).toBeNull();
  expect(core.pendingCaptures).toEqual(new Map());
  expect(core.revisions).toEqual(new Map());
  expect(core.sessions).toEqual(new Map());
  expect(core.surfaces).toEqual(new Map());
  expect(core.pendingCaptureBridge.has(12)).toBe(false);

  core.pendingCaptures.set(12, {
    ...createStoredPendingScenarioCapture(),
    id: 'capture-1',
  });
  expect(core.pendingCaptureBridge.get(12)).toEqual(expect.objectContaining({ id: 'capture-1' }));

  await core.clearTab(12);

  expect(core.pendingCaptureBridge.has(12)).toBe(false);
  expect(core.revisions.has(12)).toBe(false);
  expect(core.sessions.has(12)).toBe(false);
  expect(core.surfaces.has(12)).toBe(false);
});

it('serializes persisted mutations with pending-capture writes on the same core', async () => {
  const core = createScenarioSessionServiceCore();
  const firstPersist = createDeferred();
  writeStoredScenarioSessionsMock
    .mockReturnValueOnce(firstPersist.promise)
    .mockResolvedValueOnce(undefined);
  core.sessions.set(12, {
    captureMode: 'manual',
    enabled: false,
    pendingProjectSelection: false,
    projectId: null,
    projectName: null,
    rememberProjectSelection: false,
    sidebarVisible: true,
  });

  const firstMutation = runPersistedMutation({
    cloneResult: (value) => ({ ...value }),
    core,
    mutate: () => {
      const session = core.getMutableSession(12);
      session.enabled = true;
      return session;
    },
  });
  const pendingWrite = core.pendingCaptureBridge.buffer(12, createPendingScenarioCaptureInput());

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(writeStoredScenarioSessionsMock).toHaveBeenCalledTimes(1);
  expect(core.pendingCaptures.has(12)).toBe(false);

  firstPersist.reject(new Error('first persist failed'));
  await expect(firstMutation).rejects.toThrow('first persist failed');
  await expect(pendingWrite).resolves.toEqual(expect.objectContaining({ enabled: false }));

  expect(writeStoredScenarioSessionsMock).toHaveBeenCalledTimes(2);
  expect(core.sessions.get(12)).toEqual(
    expect.objectContaining({ enabled: false, pendingProjectSelection: true })
  );
  expect(core.pendingCaptures.get(12)).toEqual(
    expect.objectContaining({ id: 'capture-1', pendingAssetId: 'pending-asset-1' })
  );
});

it('does not let a slow pending-capture buffer recreate state after tab cleanup', async () => {
  const core = createScenarioSessionServiceCore();
  const stagedCapture = createDeferred();
  stagePendingScenarioCaptureMock.mockReturnValueOnce(
    stagedCapture.promise.then(() => ({
      id: 'capture-after-clear',
      pendingAssetId: 'pending-asset-after-clear',
    }))
  );

  const buffer = core.pendingCaptureBridge.buffer(12, createPendingScenarioCaptureInput());
  await new Promise((resolve) => setTimeout(resolve, 0));

  const clearTab = core.clearTab(12);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(writeStoredScenarioSessionsMock).toHaveBeenCalledTimes(0);
  stagedCapture.resolve();

  await expect(buffer).resolves.toEqual(expect.objectContaining({ pendingProjectSelection: true }));
  await expect(clearTab).resolves.toBeUndefined();

  expect(writeStoredScenarioSessionsMock).toHaveBeenCalledTimes(2);
  expect(core.pendingCaptures.has(12)).toBe(false);
  expect(core.sessions.has(12)).toBe(false);
  expect(core.surfaces.has(12)).toBe(false);
});
