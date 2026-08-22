import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  getVideoRecordingIdMock,
  getVideoRecordingRuntimeStateMock,
  getVideoRecordingTabIdMock,
  setVideoRecordingIdMock,
  setVideoRecordingRuntimeStateMock,
  setVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingRuntimeStateMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  setVideoRecordingIdMock: vi.fn(),
  setVideoRecordingRuntimeStateMock: vi.fn(),
  setVideoRecordingTabIdMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: {
        get: browserStorageSessionGetMock,
        isAvailable: browserStorageSessionIsAvailableMock,
        remove: browserStorageSessionRemoveMock,
        set: browserStorageSessionSetMock,
      },
    },
  })
);
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));
vi.mock('./session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-state')>()),
  getVideoRecordingId: getVideoRecordingIdMock,
  getVideoRecordingTabId: getVideoRecordingTabIdMock,
  setVideoRecordingId: setVideoRecordingIdMock,
  setVideoRecordingTabId: setVideoRecordingTabIdMock,
}));
vi.mock('./runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime/session-state')>()),
  getVideoRecordingRuntimeState: getVideoRecordingRuntimeStateMock,
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  activateVideoRecordingLease,
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
  getActiveVideoRecordingLeaseSnapshot,
  hydrateActiveVideoRecordingLease,
  issuePreparedVideoRecordingLease,
  resetActiveVideoRecordingLeaseForTests,
  restoreCurrentRecordingFromLease,
  validateRecordingControlCapability,
} from './recording-control-lease';

const storageKey = 'video-active-recording-lease';
const ownerSenderUrl = 'chrome-extension://test/apps/extension/src/popup/index.html';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'control-token-1') });
  vi.setSystemTime(new Date('2026-06-09T12:00:00.000Z'));
  browserStorageSessionIsAvailableMock.mockReturnValue(true);
  browserStorageSessionGetMock.mockResolvedValue({});
  browserStorageSessionRemoveMock.mockResolvedValue(undefined);
  browserStorageSessionSetMock.mockResolvedValue(undefined);
  getVideoRecordingIdMock.mockReturnValue('recording-1');
  getVideoRecordingRuntimeStateMock.mockReturnValue({ status: VideoRecordingStatus.IDLE });
  getVideoRecordingTabIdMock.mockReturnValue(42);
  resetActiveVideoRecordingLeaseForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('persists an owner-bound recording control lease and validates exact controls', async () => {
  const lease = await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl,
    surfaceBinding: { generation: 2, streamInstanceId: 'stream-instance-1' },
  });

  expect(lease).toEqual(
    expect.objectContaining({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
      recordingTabId: 42,
      surfaceBinding: { generation: 2, streamInstanceId: 'stream-instance-1' },
    })
  );
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      version: 1,
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    }),
  });
  expect(
    validateRecordingControlCapability({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(false);
  await activateVideoRecordingLease({
    generation: 2,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  expect(
    validateRecordingControlCapability({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(true);
  expect(
    validateRecordingControlCapability({
      controlToken: 'old-token',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(false);
});

it('persists a camera recording control lease without a recording tab id', async () => {
  getVideoRecordingTabIdMock.mockReturnValue(null);

  const lease = await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.CAMERA,
    ownerSenderUrl,
  });

  expect(lease).toEqual(
    expect.objectContaining({
      captureMode: CaptureMode.CAMERA,
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
      recordingTabId: null,
    })
  );
  expect(browserStorageSessionSetMock).toHaveBeenCalledWith({
    [storageKey]: expect.objectContaining({
      captureMode: CaptureMode.CAMERA,
      recordingTabId: null,
      version: 1,
    }),
  });
});

it('does not issue non-camera recording leases without a recording tab id', async () => {
  getVideoRecordingTabIdMock.mockReturnValue(null);

  await expect(
    issuePreparedVideoRecordingLease({
      captureMode: CaptureMode.TAB,
      ownerSenderUrl,
    })
  ).resolves.toBeNull();

  expect(browserStorageSessionSetMock).not.toHaveBeenCalled();
});

it('reads an absent persisted lease only once per worker lifetime', async () => {
  await expect(ensureActiveVideoRecordingLeaseHydrated()).resolves.toBeNull();
  await expect(ensureActiveVideoRecordingLeaseHydrated()).resolves.toBeNull();

  expect(browserStorageSessionGetMock).toHaveBeenCalledOnce();
});

it('hydrates active recording state from a persisted lease after restart', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB_CROP,
      controlToken: 'control-token-2',
      cropRegion: { x: 10, y: 20, width: 300, height: 200 },
      expiresAt: Date.now() + 60_000,
      ownerSenderUrl,
      phase: 'active',
      recordingId: 'recording-2',
      recordingTabId: 77,
      surfaceBinding: null,
      version: 1,
    },
  });

  await expect(hydrateActiveVideoRecordingLease()).resolves.toEqual(
    expect.objectContaining({ recordingId: 'recording-2' })
  );

  expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-2');
  expect(setVideoRecordingTabIdMock).toHaveBeenCalledWith(77);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB_CROP,
    countdownEndsAt: null,
    cropRegion: { x: 10, y: 20, width: 300, height: 200 },
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: null,
  });
  getVideoRecordingIdMock.mockReturnValue('recording-2');
  await expect(restoreCurrentRecordingFromLease('recording-2')).resolves.toBe(true);
});

it('reprojects a cached active lease after a late startup reset', async () => {
  await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.SCREEN,
    ownerSenderUrl,
  });
  await activateVideoRecordingLease({
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: null,
  });
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({ status: VideoRecordingStatus.IDLE });

  await expect(ensureActiveVideoRecordingLeaseHydrated()).resolves.toMatchObject({
    phase: 'active',
    recordingId: 'recording-1',
  });

  expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-1');
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: CaptureMode.SCREEN,
      status: VideoRecordingStatus.RECORDING,
    })
  );
});

it('does not overwrite a non-idle runtime state from a cached active lease', async () => {
  await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.SCREEN,
    ownerSenderUrl,
  });
  await activateVideoRecordingLease({
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: null,
  });
  vi.clearAllMocks();
  getVideoRecordingRuntimeStateMock.mockReturnValue({ status: VideoRecordingStatus.PAUSED });

  await expect(ensureActiveVideoRecordingLeaseHydrated()).resolves.toMatchObject({
    phase: 'active',
    recordingId: 'recording-1',
  });

  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('keeps a recovered prepared lease out of active runtime state', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-prepared',
      expiresAt: Date.now() + 60_000,
      ownerSenderUrl,
      phase: 'prepared',
      recordingId: 'recording-prepared',
      recordingTabId: 77,
      surfaceBinding: { generation: 1, streamInstanceId: 'stream-prepared' },
      version: 1,
      viewportPresetId: 'preset-1',
    },
  });

  await expect(hydrateActiveVideoRecordingLease()).resolves.toMatchObject({
    phase: 'prepared',
    recordingId: 'recording-prepared',
  });
  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  await expect(restoreCurrentRecordingFromLease('recording-prepared')).resolves.toBe(false);
});

it('does not expose a control capability when session lease persistence fails', async () => {
  browserStorageSessionSetMock.mockRejectedValueOnce(new Error('storage failed'));

  await expect(
    issuePreparedVideoRecordingLease({
      captureMode: CaptureMode.TAB,
      ownerSenderUrl,
    })
  ).rejects.toThrow('storage failed');

  expect(
    validateRecordingControlCapability({
      controlToken: 'control-token-1',
      ownerSenderUrl,
      recordingId: 'recording-1',
    })
  ).toBe(false);
});

it('drops expired or malformed persisted leases before exposing recording state', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-3',
      expiresAt: Date.now() - 1,
      ownerSenderUrl,
      recordingId: 'recording-3',
      recordingTabId: 12,
      version: 1,
    },
  });

  await expect(hydrateActiveVideoRecordingLease()).resolves.toBeNull();

  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith(storageKey);
});

it('clears only the matching active recording lease', async () => {
  await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl,
  });

  await clearActiveVideoRecordingLease('other-recording');
  expect(browserStorageSessionRemoveMock).not.toHaveBeenCalled();

  await clearActiveVideoRecordingLease('recording-1');
  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith(storageKey);
});

it('clears a matching persisted lease when no in-memory lease has hydrated yet', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-4',
      expiresAt: Date.now() + 60_000,
      ownerSenderUrl,
      phase: 'active',
      recordingId: 'recording-4',
      recordingTabId: 42,
      surfaceBinding: null,
      version: 1,
    },
  });

  await clearActiveVideoRecordingLease('other-recording');
  expect(browserStorageSessionRemoveMock).not.toHaveBeenCalled();

  await clearActiveVideoRecordingLease('recording-4');
  expect(browserStorageSessionRemoveMock).toHaveBeenCalledWith(storageKey);
});

it('hydrates a persisted lease before restoring a post-restart lifecycle event', async () => {
  getVideoRecordingIdMock.mockReturnValue(null);
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-5',
      expiresAt: Date.now() + 60_000,
      ownerSenderUrl,
      phase: 'active',
      recordingId: 'recording-5',
      recordingTabId: 17,
      surfaceBinding: null,
      version: 1,
    },
  });

  await expect(restoreCurrentRecordingFromLease('recording-5')).resolves.toBe(true);

  expect(setVideoRecordingIdMock).toHaveBeenCalledWith('recording-5');
  expect(setVideoRecordingTabIdMock).toHaveBeenCalledWith(17);
});

it('does not hydrate stale recording A over current recording B', async () => {
  getVideoRecordingIdMock.mockReturnValue('recording-B');

  await expect(restoreCurrentRecordingFromLease('recording-A')).resolves.toBe(false);

  expect(browserStorageSessionGetMock).not.toHaveBeenCalled();
  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});

it('retires an expired cached active lease instead of restoring stale runtime authority', async () => {
  const prepared = await issuePreparedVideoRecordingLease({
    captureMode: CaptureMode.TAB,
    ownerSenderUrl,
    surfaceBinding: { generation: 2, streamInstanceId: 'stream-instance-1' },
  });
  if (!prepared) throw new Error('Expected a prepared recording lease');
  await activateVideoRecordingLease({
    generation: 2,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
  });
  vi.clearAllMocks();
  getVideoRecordingIdMock.mockReturnValue(null);
  browserStorageSessionGetMock.mockResolvedValue({});
  vi.setSystemTime(prepared.expiresAt + 1);

  await expect(restoreCurrentRecordingFromLease('recording-1')).resolves.toBe(false);

  expect(getActiveVideoRecordingLeaseSnapshot()).toBeNull();
  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
  expect(browserStorageSessionGetMock).toHaveBeenCalledOnce();
});

it('does not hydrate A when B becomes current while its durable lease is loading', async () => {
  getVideoRecordingIdMock.mockReturnValue(null);
  let resolveLease!: (value: object) => void;
  browserStorageSessionGetMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLease = resolve;
    })
  );

  const restoreA = restoreCurrentRecordingFromLease('recording-A');
  await vi.waitFor(() => expect(browserStorageSessionGetMock).toHaveBeenCalledOnce());
  getVideoRecordingIdMock.mockReturnValue('recording-B');
  resolveLease({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-A',
      expiresAt: Date.now() + 60_000,
      ownerSenderUrl,
      phase: 'active',
      recordingId: 'recording-A',
      recordingTabId: 17,
      surfaceBinding: null,
      version: 1,
    },
  });

  await expect(restoreA).resolves.toBe(false);
  expect(setVideoRecordingIdMock).not.toHaveBeenCalled();
  expect(setVideoRecordingRuntimeStateMock).not.toHaveBeenCalled();
});
