import { beforeEach, expect, it, vi } from 'vitest';

const {
  clearPendingScenarioCaptureAssetMock,
  resolvePendingScenarioCaptureMock,
  stagePendingScenarioCaptureMock,
  readStoredScenarioSessionsMock,
  writeStoredScenarioSessionsMock,
} = vi.hoisted(() => ({
  clearPendingScenarioCaptureAssetMock: vi.fn(),
  resolvePendingScenarioCaptureMock: vi.fn(),
  stagePendingScenarioCaptureMock: vi.fn(),
  readStoredScenarioSessionsMock: vi.fn(),
  writeStoredScenarioSessionsMock: vi.fn(),
}));

vi.mock('./pending-assets', () => ({
  clearPendingScenarioCaptureAsset: clearPendingScenarioCaptureAssetMock,
  resolvePendingScenarioCapture: resolvePendingScenarioCaptureMock,
  stagePendingScenarioCapture: stagePendingScenarioCaptureMock,
}));

vi.mock('../../storage/scenario/session', () => ({
  readStoredScenarioSessions: readStoredScenarioSessionsMock,
  writeStoredScenarioSessions: writeStoredScenarioSessionsMock,
}));

import { bufferPendingCaptureState, consumePendingCaptureState } from './pending-state';
import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
  createStoredScenarioTabState,
} from './test-support';
import { createDefaultScenarioSessionState } from './helpers';
import { createScenarioSessionPersistedWriteQueue } from './runtime/core/persisted-write';

beforeEach(() => {
  vi.clearAllMocks();
  readStoredScenarioSessionsMock.mockResolvedValue(
    new Map([
      [
        9,
        createStoredScenarioTabState({ captureMode: 'manual', projectId: null, projectName: null }),
      ],
    ])
  );
  writeStoredScenarioSessionsMock.mockResolvedValue(undefined);
  clearPendingScenarioCaptureAssetMock.mockResolvedValue(undefined);
  stagePendingScenarioCaptureMock.mockResolvedValue(createStoredPendingScenarioCapture());
  resolvePendingScenarioCaptureMock.mockResolvedValue({
    ...createStoredPendingScenarioCapture(),
    dataUrl: 'data:image/png;base64,resolved',
  });
});

function createContext() {
  const pendingCaptures = new Map<number, ReturnType<typeof createStoredPendingScenarioCapture>>();
  const sessions = new Map<number, ReturnType<typeof createDefaultScenarioSessionState>>();
  const surfaces = new Map<
    number,
    { screenshotMode: boolean; toolbarVisible: boolean; captureAction: string }
  >();

  return {
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    getMutableSession: vi.fn((tabId: number) => {
      const existing = sessions.get(tabId);
      if (existing) {
        return existing;
      }

      const created = createDefaultScenarioSessionState();
      sessions.set(tabId, created);
      return created;
    }),
    pendingCaptures,
    persistSessions: vi.fn().mockResolvedValue(undefined),
    runPersistedWrite: createScenarioSessionPersistedWriteQueue(),
    sessions,
    surfaces,
  };
}

function createReplacementPendingCapture() {
  return {
    ...createStoredPendingScenarioCapture(),
    id: 'pending-2',
    pendingAssetId: 'pending-asset-2',
  };
}

function createDeferredCapture() {
  let resolve!: (
    capture: ReturnType<typeof createStoredPendingScenarioCapture> & { dataUrl: string }
  ) => void;
  const promise = new Promise<
    ReturnType<typeof createStoredPendingScenarioCapture> & { dataUrl: string }
  >((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createDeferredNullableCapture() {
  let resolve!: (
    capture: (ReturnType<typeof createStoredPendingScenarioCapture> & { dataUrl: string }) | null
  ) => void;
  const promise = new Promise<
    (ReturnType<typeof createStoredPendingScenarioCapture> & { dataUrl: string }) | null
  >((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createDeferredStoredCapture() {
  let resolve!: (capture: ReturnType<typeof createStoredPendingScenarioCapture>) => void;
  const promise = new Promise<ReturnType<typeof createStoredPendingScenarioCapture>>(
    (promiseResolve) => {
      resolve = promiseResolve;
    }
  );
  return { promise, resolve };
}

it('does not let stale pending-capture consume clear a newer buffered capture', async () => {
  const context = createContext();
  const firstCapture = createStoredPendingScenarioCapture();
  const secondCapture = createReplacementPendingCapture();
  const deferredResolve = createDeferredCapture();
  context.pendingCaptures.set(9, firstCapture);
  resolvePendingScenarioCaptureMock.mockReturnValueOnce(deferredResolve.promise);
  stagePendingScenarioCaptureMock.mockResolvedValueOnce(secondCapture);

  const consume = consumePendingCaptureState(context, 9);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await bufferPendingCaptureState(context, 9, {
    ...createPendingScenarioCaptureInput(),
    id: 'pending-2',
  });
  deferredResolve.resolve({ ...firstCapture, dataUrl: 'data:image/png;base64,first' });

  await expect(consume).resolves.toBeNull();
  expect(context.pendingCaptures.get(9)).toEqual(secondCapture);
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalledWith(secondCapture);
});

it('does not let stale missing-asset resolution clear a newer buffered capture', async () => {
  const context = createContext();
  const firstCapture = createStoredPendingScenarioCapture();
  const secondCapture = createReplacementPendingCapture();
  const deferredResolve = createDeferredNullableCapture();
  context.pendingCaptures.set(9, firstCapture);
  resolvePendingScenarioCaptureMock.mockReturnValueOnce(deferredResolve.promise);
  stagePendingScenarioCaptureMock.mockResolvedValueOnce(secondCapture);

  const consume = consumePendingCaptureState(context, 9);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await bufferPendingCaptureState(context, 9, {
    ...createPendingScenarioCaptureInput(),
    id: 'pending-2',
  });
  deferredResolve.resolve(null);

  await expect(consume).resolves.toBeNull();
  expect(context.pendingCaptures.get(9)).toEqual(secondCapture);
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalledWith(secondCapture);
});

it('does not return stale resolved capture when expected pending capture is already gone', async () => {
  const context = createContext();
  const firstCapture = createStoredPendingScenarioCapture();
  const deferredResolve = createDeferredCapture();
  context.pendingCaptures.set(9, firstCapture);
  resolvePendingScenarioCaptureMock.mockReturnValueOnce(deferredResolve.promise);

  const consume = consumePendingCaptureState(context, 9);
  await new Promise((resolve) => setTimeout(resolve, 0));
  context.pendingCaptures.delete(9);
  deferredResolve.resolve({ ...firstCapture, dataUrl: 'data:image/png;base64,first' });

  await expect(consume).resolves.toBeNull();
  expect(context.pendingCaptures.has(9)).toBe(false);
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalledWith(firstCapture);
});

it('serializes pending-capture staging before newer buffers can persist', async () => {
  const context = createContext();
  const firstStage = createDeferredStoredCapture();
  const firstCapture = createStoredPendingScenarioCapture();
  const secondCapture = createReplacementPendingCapture();
  stagePendingScenarioCaptureMock
    .mockReturnValueOnce(firstStage.promise)
    .mockResolvedValueOnce(secondCapture);

  const firstBuffer = bufferPendingCaptureState(context, 9, createPendingScenarioCaptureInput());
  const secondBuffer = bufferPendingCaptureState(context, 9, {
    ...createPendingScenarioCaptureInput(),
    id: 'pending-2',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(stagePendingScenarioCaptureMock).toHaveBeenCalledTimes(1);
  firstStage.resolve(firstCapture);
  await expect(firstBuffer).resolves.toEqual(
    expect.objectContaining({ pendingProjectSelection: true })
  );
  await expect(secondBuffer).resolves.toEqual(
    expect.objectContaining({ pendingProjectSelection: true })
  );
  expect(stagePendingScenarioCaptureMock).toHaveBeenCalledTimes(2);
  expect(context.pendingCaptures.get(9)).toEqual(secondCapture);
  expect(clearPendingScenarioCaptureAssetMock).toHaveBeenCalledWith(firstCapture);
});
