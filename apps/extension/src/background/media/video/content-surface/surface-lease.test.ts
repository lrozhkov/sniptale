import { beforeEach, expect, it, vi } from 'vitest';

const { closePeerMock, getMock, removeMock, setMock } = vi.hoisted(() => ({
  closePeerMock: vi.fn(),
  getMock: vi.fn(),
  removeMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock('./camera-peer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./camera-peer')>()),
  closeVideoRecordingCameraPeerForLease: closePeerMock,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: getMock,
      isAvailable: () => true,
      remove: removeMock,
      set: setMock,
    },
  },
}));

import {
  beginVideoRecordingSurfaceRebind,
  ensureVideoRecordingSurfaceLeaseHydrated,
  getVideoRecordingSurfaceLeaseSnapshot,
  releaseVideoRecordingSurface,
  requestVideoRecordingSurface,
  resetVideoRecordingSurfaceLeaseForTests,
  updateVideoRecordingSurface,
  validateVideoRecordingSurfaceCapability,
} from './surface-lease';
import { resetVideoRecordingCameraPeerCleanupForTests } from './camera-peer-cleanup';
import { resetVideoRecordingCameraPeerRetryForTests } from './camera-peer';

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({});
  closePeerMock.mockResolvedValue(undefined);
  removeMock.mockResolvedValue(undefined);
  setMock.mockResolvedValue(undefined);
  resetVideoRecordingCameraPeerCleanupForTests();
  resetVideoRecordingCameraPeerRetryForTests();
  resetVideoRecordingSurfaceLeaseForTests();
});

it('hydrates valid state and leaves malformed persistence read-only and non-authoritative', async () => {
  const persisted = {
    capabilityEpoch: 2,
    documentGeneration: 1,
    entry: 'popup',
    expiresAt: Date.now() + 10_000,
    lifecycle: 'ready',
    peerGeneration: 3,
    recordingId: null,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 7,
    toolbarRequested: true,
    version: 1,
  };
  getMock.mockResolvedValueOnce({ 'video-recording-content-surface-lease': persisted });
  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toEqual(
    expect.objectContaining({ surfaceSessionId: 'surface-1' })
  );
  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toEqual(
    expect.objectContaining({ surfaceSessionId: 'surface-1' })
  );

  resetVideoRecordingSurfaceLeaseForTests();
  getMock.mockResolvedValueOnce({
    'video-recording-content-surface-lease': { ...persisted, tabId: -1 },
  });
  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toBeNull();
  expect(removeMock).not.toHaveBeenCalled();
});

it('retains an expired persisted lease only as cleanup identity until peer retirement', async () => {
  const expired = {
    capabilityEpoch: 2,
    documentGeneration: 1,
    entry: 'popup',
    expiresAt: Date.now() - 1,
    lifecycle: 'ready',
    peerGeneration: 3,
    recordingId: null,
    surfaceSessionId: 'surface-expired',
    surfaceToken: 'token-expired',
    tabId: 7,
    toolbarRequested: true,
    version: 1,
  };
  getMock.mockResolvedValueOnce({ 'video-recording-content-surface-lease': expired });

  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toMatchObject({
    surfaceSessionId: expired.surfaceSessionId,
    expiresAt: expired.expiresAt,
  });
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toBeNull();
  expect(
    validateVideoRecordingSurfaceCapability({
      recordingId: null,
      surfaceToken: expired.surfaceToken,
      tabId: 7,
    })
  ).toBe(false);
  expect(removeMock).not.toHaveBeenCalled();

  await expect(releaseVideoRecordingSurface({ tabId: 7 })).resolves.toBe(true);
  expect(closePeerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      surfaceSessionId: 'surface-expired',
    })
  );
});

it.each([
  ['capabilityEpoch', 0],
  ['documentGeneration', -1],
  ['entry', 'other'],
  ['expiresAt', 0],
  ['lifecycle', 'other'],
  ['peerGeneration', -1],
  ['recordingId', 7],
  ['surfaceSessionId', 7],
  ['surfaceToken', 7],
  ['tabId', 1.2],
  ['toolbarRequested', 'yes'],
] as const)('rejects malformed persisted %s', async (key, value) => {
  const persisted = {
    capabilityEpoch: 1,
    documentGeneration: 0,
    entry: 'manual',
    expiresAt: Date.now() + 10_000,
    lifecycle: 'requested',
    peerGeneration: 0,
    recordingId: null,
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 7,
    toolbarRequested: true,
    version: 1,
    [key]: value,
  };
  getMock.mockResolvedValueOnce({ 'video-recording-content-surface-lease': persisted });
  await expect(ensureVideoRecordingSurfaceLeaseHydrated()).resolves.toBeNull();
});

it('issues a tab-bound capability without copying recording phase', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 42,
  });

  expect(lease).toMatchObject({
    capabilityEpoch: 1,
    documentGeneration: 0,
    lifecycle: 'requested',
    recordingId: 'recording-1',
    tabId: 42,
  });
  expect(lease).not.toHaveProperty('phase');
  expect(
    validateVideoRecordingSurfaceCapability({
      recordingId: 'recording-1',
      surfaceToken: lease.surfaceToken,
      tabId: 42,
    })
  ).toBe(true);
});

it('invalidates the previous document and peer capability before navigation rebind', async () => {
  const initial = await requestVideoRecordingSurface({ entry: 'popup', tabId: 7 });
  const rebound = await beginVideoRecordingSurfaceRebind(7);

  expect(rebound).toMatchObject({
    capabilityEpoch: initial.capabilityEpoch + 1,
    documentGeneration: 1,
    lifecycle: 'binding',
    peerGeneration: 1,
  });
  expect(rebound?.surfaceToken).not.toBe(initial.surfaceToken);
});

it('rotates same-tab authority while retaining recording identity defaults', async () => {
  const initial = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 7,
    toolbarRequested: false,
  });
  const rotated = await requestVideoRecordingSurface({ entry: 'popup', tabId: 7 });
  expect(rotated).toMatchObject({
    capabilityEpoch: initial.capabilityEpoch + 1,
    recordingId: 'recording-1',
    toolbarRequested: true,
  });
  expect(rotated.surfaceSessionId).toBe(initial.surfaceSessionId);
  await expect(beginVideoRecordingSurfaceRebind(8)).resolves.toBeNull();
});

it('retires the old camera peer before replacing a different-tab authority', async () => {
  const previous = await requestVideoRecordingSurface({ entry: 'manual', tabId: 7 });
  const next = await requestVideoRecordingSurface({ entry: 'popup', tabId: 8 });
  expect(closePeerMock).toHaveBeenCalledWith(previous);
  expect(next.tabId).toBe(8);
});

it('rejects stale updates and scoped releases', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 9 });
  await expect(updateVideoRecordingSurface('stale-session', { lifecycle: 'ready' })).resolves.toBe(
    null
  );
  await expect(releaseVideoRecordingSurface({ tabId: 10 })).resolves.toBe(false);
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(lease);
  await expect(
    releaseVideoRecordingSurface({ surfaceSessionId: lease.surfaceSessionId })
  ).resolves.toBe(true);
  expect(closePeerMock).toHaveBeenCalledWith(lease);
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toBeNull();
});

it('retains release authority when durable removal fails and completes on retry', async () => {
  const lease = await requestVideoRecordingSurface({ entry: 'manual', tabId: 9 });
  const removalsBeforeRelease = removeMock.mock.calls.length;
  removeMock.mockRejectedValueOnce(new Error('session storage unavailable'));

  await expect(releaseVideoRecordingSurface({ tabId: 9 })).rejects.toThrow(
    'session storage unavailable'
  );
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(lease);

  await expect(releaseVideoRecordingSurface({ tabId: 9 })).resolves.toBe(true);
  expect(closePeerMock).toHaveBeenCalledTimes(2);
  expect(removeMock).toHaveBeenCalledTimes(removalsBeforeRelease + 2);
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toBeNull();
});

it('publishes mutations only after durable commit and retains prior authority on failure', async () => {
  const initial = await requestVideoRecordingSurface({ entry: 'manual', tabId: 9 });
  setMock.mockRejectedValueOnce(new Error('write failed'));

  await expect(requestVideoRecordingSurface({ entry: 'popup', tabId: 9 })).rejects.toThrow(
    'write failed'
  );
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(initial);

  setMock.mockRejectedValueOnce(new Error('update failed'));
  await expect(
    updateVideoRecordingSurface(initial.surfaceSessionId, { lifecycle: 'ready' })
  ).rejects.toThrow('update failed');
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(initial);

  setMock.mockRejectedValueOnce(new Error('rebind failed'));
  await expect(beginVideoRecordingSurfaceRebind(9)).rejects.toThrow('rebind failed');
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(initial);
});

it('serializes durable mutations so older writes cannot complete after newer authority', async () => {
  const initial = await requestVideoRecordingSurface({ entry: 'manual', tabId: 9 });
  let resolveFirst!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    resolveFirst = resolve;
  });
  setMock.mockReturnValueOnce(firstWrite).mockResolvedValueOnce(undefined);

  const first = updateVideoRecordingSurface(initial.surfaceSessionId, { lifecycle: 'binding' });
  const second = beginVideoRecordingSurfaceRebind(9);
  await Promise.resolve();
  expect(setMock).toHaveBeenCalledTimes(2);
  resolveFirst();
  const [updated, rebound] = await Promise.all([first, second]);

  expect(updated?.lifecycle).toBe('binding');
  expect(rebound).toMatchObject({
    capabilityEpoch: initial.capabilityEpoch + 1,
    documentGeneration: initial.documentGeneration + 1,
    peerGeneration: initial.peerGeneration + 1,
  });
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(rebound);
});

it('rejects a release carrying a token rotated by a newer same-tab activation', async () => {
  const initial = await requestVideoRecordingSurface({ entry: 'manual', tabId: 9 });
  const rotated = await requestVideoRecordingSurface({ entry: 'popup', tabId: 9 });
  await expect(
    releaseVideoRecordingSurface({
      surfaceSessionId: initial.surfaceSessionId,
      surfaceToken: initial.surfaceToken,
    })
  ).resolves.toBe(false);
  expect(getVideoRecordingSurfaceLeaseSnapshot()).toEqual(rotated);
});

it('checks every capability binding and scoped release identity', async () => {
  const lease = await requestVideoRecordingSurface({
    entry: 'manual',
    recordingId: 'recording-1',
    tabId: 9,
  });
  const valid = {
    capabilityEpoch: lease.capabilityEpoch,
    documentGeneration: lease.documentGeneration,
    recordingId: 'recording-1',
    surfaceToken: lease.surfaceToken,
    tabId: 9,
  };
  expect(validateVideoRecordingSurfaceCapability(valid)).toBe(true);
  expect(validateVideoRecordingSurfaceCapability({ ...valid, tabId: 10 })).toBe(false);
  expect(validateVideoRecordingSurfaceCapability({ ...valid, recordingId: null })).toBe(false);
  expect(validateVideoRecordingSurfaceCapability({ ...valid, surfaceToken: 'wrong' })).toBe(false);
  expect(validateVideoRecordingSurfaceCapability({ ...valid, capabilityEpoch: 9 })).toBe(false);
  expect(validateVideoRecordingSurfaceCapability({ ...valid, documentGeneration: 9 })).toBe(false);
  await expect(releaseVideoRecordingSurface({ recordingId: 'wrong' })).resolves.toBe(false);
  await expect(releaseVideoRecordingSurface({ surfaceSessionId: 'wrong' })).resolves.toBe(false);
  await expect(releaseVideoRecordingSurface({ recordingId: 'recording-1' })).resolves.toBe(true);
  await expect(releaseVideoRecordingSurface()).resolves.toBe(false);
});
