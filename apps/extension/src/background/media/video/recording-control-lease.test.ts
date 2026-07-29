import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const {
  browserStorageSessionGetMock,
  browserStorageSessionIsAvailableMock,
  browserStorageSessionRemoveMock,
  browserStorageSessionSetMock,
  getVideoRecordingIdMock,
  getVideoRecordingTabIdMock,
  setOpenEditorAfterRecordingMock,
  setVideoRecordingIdMock,
  setVideoRecordingRuntimeStateMock,
  setVideoRecordingTabIdMock,
} = vi.hoisted(() => ({
  browserStorageSessionGetMock: vi.fn(),
  browserStorageSessionIsAvailableMock: vi.fn(),
  browserStorageSessionRemoveMock: vi.fn(),
  browserStorageSessionSetMock: vi.fn(),
  getVideoRecordingIdMock: vi.fn(),
  getVideoRecordingTabIdMock: vi.fn(),
  setOpenEditorAfterRecordingMock: vi.fn(),
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
  setOpenEditorAfterRecording: setOpenEditorAfterRecordingMock,
  setVideoRecordingId: setVideoRecordingIdMock,
  setVideoRecordingTabId: setVideoRecordingTabIdMock,
}));
vi.mock('./runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime/session-state')>()),
  setVideoRecordingRuntimeState: setVideoRecordingRuntimeStateMock,
}));
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  activateVideoRecordingLease,
  clearActiveVideoRecordingLease,
  ensureActiveVideoRecordingLeaseHydrated,
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
    openEditorAfterRecording: true,
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
    openEditorAfterRecording: false,
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
      openEditorAfterRecording: true,
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
      openEditorAfterRecording: false,
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
  expect(setOpenEditorAfterRecordingMock).toHaveBeenCalledWith(false);
  expect(setVideoRecordingRuntimeStateMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB_CROP,
    countdownEndsAt: null,
    cropRegion: { x: 10, y: 20, width: 300, height: 200 },
    error: null,
    status: VideoRecordingStatus.RECORDING,
    viewportPresetId: null,
  });
  await expect(restoreCurrentRecordingFromLease('recording-2')).resolves.toBe(true);
});

it('keeps a recovered prepared lease out of active runtime state', async () => {
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-prepared',
      expiresAt: Date.now() + 60_000,
      openEditorAfterRecording: false,
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
      openEditorAfterRecording: true,
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
      openEditorAfterRecording: false,
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
    openEditorAfterRecording: true,
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
      openEditorAfterRecording: false,
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
  browserStorageSessionGetMock.mockResolvedValue({
    [storageKey]: {
      captureMode: CaptureMode.TAB,
      controlToken: 'control-token-5',
      expiresAt: Date.now() + 60_000,
      openEditorAfterRecording: true,
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
  expect(setOpenEditorAfterRecordingMock).toHaveBeenCalledWith(true);
});
