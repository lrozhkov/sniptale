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

import {
  bufferPendingCaptureState,
  clearPendingCaptureState,
  consumePendingCaptureState,
  resolvePendingCaptureState,
} from './pending-state';
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

it('buffers a pending capture state and marks the session as pending', async () => {
  const context = createContext();

  const session = await bufferPendingCaptureState(context, 9, createPendingScenarioCaptureInput());

  expect(context.ensureHydrated).toHaveBeenCalled();
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalled();
  expect(stagePendingScenarioCaptureMock).toHaveBeenCalledTimes(1);
  expect(context.pendingCaptures.get(9)).toEqual(
    expect.objectContaining({ pendingAssetId: 'pending-asset-1' })
  );
  expect(session.pendingProjectSelection).toBe(true);
  expect(context.persistSessions).toHaveBeenCalledTimes(1);
});

it('rolls back a new pending capture when session persistence fails', async () => {
  const context = createContext();
  const persistenceError = new Error('persist failed');
  context.pendingCaptures.set(9, createStoredPendingScenarioCapture());
  context.persistSessions.mockRejectedValueOnce(persistenceError);

  await expect(
    bufferPendingCaptureState(context, 9, createPendingScenarioCaptureInput())
  ).rejects.toThrow('persist failed');

  expect(context.pendingCaptures.get(9)).toEqual(createStoredPendingScenarioCapture());
  expect(clearPendingScenarioCaptureAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ pendingAssetId: 'pending-asset-1' })
  );
});

it('clears a pending capture state and removes its staged blob', async () => {
  const context = createContext();
  context.pendingCaptures.set(9, createStoredPendingScenarioCapture());

  const session = await clearPendingCaptureState(context, 9);

  expect(context.pendingCaptures.has(9)).toBe(false);
  expect(clearPendingScenarioCaptureAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ pendingAssetId: 'pending-asset-1' })
  );
  expect(session.pendingProjectSelection).toBe(false);
});

it('restores the pending capture when clearing fails to persist', async () => {
  const context = createContext();
  const pendingCapture = createStoredPendingScenarioCapture();
  const persistenceError = new Error('persist failed');
  context.pendingCaptures.set(9, pendingCapture);
  context.persistSessions.mockRejectedValueOnce(persistenceError);

  await expect(clearPendingCaptureState(context, 9)).rejects.toThrow('persist failed');

  expect(context.pendingCaptures.get(9)).toEqual(pendingCapture);
  expect(clearPendingScenarioCaptureAssetMock).not.toHaveBeenCalled();
});

it('resolves a pending capture state and clears missing assets', async () => {
  const context = createContext();
  context.pendingCaptures.set(9, createStoredPendingScenarioCapture());

  const capture = await resolvePendingCaptureState(context, 9);

  expect(resolvePendingScenarioCaptureMock).toHaveBeenCalledWith(
    expect.objectContaining({ pendingAssetId: 'pending-asset-1' })
  );
  expect(capture).toEqual(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,resolved',
    })
  );
});

it('consumes a pending capture state in one step', async () => {
  const context = createContext();
  context.pendingCaptures.set(9, createStoredPendingScenarioCapture());

  const capture = await consumePendingCaptureState(context, 9);

  expect(capture).toEqual(
    expect.objectContaining({
      dataUrl: 'data:image/png;base64,resolved',
    })
  );
  expect(context.pendingCaptures.has(9)).toBe(false);
});
