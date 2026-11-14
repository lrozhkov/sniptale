import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  hydrateLease: vi.fn(),
  sendTabMessage: vi.fn(),
  updateLease: vi.fn(),
}));

vi.mock('./surface-lease', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./surface-lease')>()),
  ensureVideoRecordingSurfaceLeaseHydrated: mocks.hydrateLease,
  updateVideoRecordingSurface: mocks.updateLease,
}));

vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendTabMessage: mocks.sendTabMessage }),
}));

import {
  prepareVideoRecordingSurfaceCapture,
  publishVideoRecordingSurfaceRuntimeState,
} from './runtime-state-sync';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createVideoRecordingSurfaceSnapshot } from './snapshot';
import type { VideoRecordingSurfaceLease } from './surface-lease';

const state = {
  captureMode: null,
  captureSource: null,
  countdownEndsAt: null,
  duration: 12,
  error: null,
  liveMedia: null,
  status: VideoRecordingStatus.RECORDING,
  viewportPresetId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateLease.mockImplementation(async (_surfaceSessionId, update) => ({
    expiresAt: Date.now() + 10_000,
    recordingId: update.recordingId,
    surfaceSessionId: 'surface-1',
    tabId: 42,
  }));
});

it('publishes recording lifecycle state to the tab that owns the active surface', async () => {
  mocks.hydrateLease.mockResolvedValue({ expiresAt: Date.now() + 10_000, tabId: 42 });
  mocks.sendTabMessage.mockResolvedValue({ success: true });

  await publishVideoRecordingSurfaceRuntimeState(state);

  expect(mocks.sendTabMessage).toHaveBeenCalledWith(42, {
    type: VideoMessageType.RECORDING_STATE_SYNC,
    state,
  });
});

it('does not publish without a live surface lease', async () => {
  mocks.hydrateLease.mockResolvedValueOnce(null).mockResolvedValueOnce({
    expiresAt: Date.now() - 1,
    tabId: 42,
  });

  await publishVideoRecordingSurfaceRuntimeState(state);
  await publishVideoRecordingSurfaceRuntimeState(state);

  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});

it('clears the finished recording binding before publishing idle', async () => {
  mocks.hydrateLease.mockResolvedValue({
    expiresAt: Date.now() + 10_000,
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    tabId: 42,
  });
  mocks.sendTabMessage.mockResolvedValue({ success: true });

  await publishVideoRecordingSurfaceRuntimeState({
    ...state,
    status: VideoRecordingStatus.IDLE,
  });

  expect(mocks.updateLease).toHaveBeenCalledWith('surface-1', { recordingId: null });
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(42, expect.any(Object));
});

function liveDrawingLease() {
  return {
    capabilityEpoch: 2,
    documentGeneration: 1,
    entry: 'manual',
    expiresAt: Date.now() + 10_000,
    lifecycle: 'ready',
    peerGeneration: 1,
    recordingId: 'recording-1',
    surfaceSessionId: 'surface-1',
    surfaceToken: 'token-1',
    tabId: 42,
    toolbarRequested: true,
  };
}
const drawingSource = { captureMode: CaptureMode.TAB, recordingId: 'recording-1', tabId: 42 };
const snapshotFactory = vi.fn(async (lease: VideoRecordingSurfaceLease) =>
  createVideoRecordingSurfaceSnapshot(lease, DEFAULT_VIDEO_SETTINGS)
);

it('requires the exact paint acknowledgement before admitting an existing drawing surface', async () => {
  const lease = liveDrawingLease();
  mocks.hydrateLease.mockResolvedValue(lease);
  mocks.sendTabMessage.mockImplementation(async (_tabId, message) => ({
    success: true,
    capturePreparationId: message.capturePreparation.requestId,
  }));
  const restore = await prepareVideoRecordingSurfaceCapture(drawingSource, snapshotFactory);
  expect(snapshotFactory).toHaveBeenCalledExactlyOnceWith(lease);
  expect(mocks.sendTabMessage).toHaveBeenCalledWith(
    42,
    expect.objectContaining({
      surfaceToken: 'token-1',
      capturePreparation: { requestId: expect.any(String), suppressed: true },
    }),
    { frameId: 0 }
  );
  await restore();
  expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(
    42,
    expect.objectContaining({
      capturePreparation: { requestId: expect.any(String), suppressed: false },
    }),
    { frameId: 0 }
  );
});

it('refuses an unrelated acknowledgement and requests control recovery', async () => {
  mocks.hydrateLease.mockResolvedValue(liveDrawingLease());
  mocks.sendTabMessage.mockResolvedValue({ success: true, capturePreparationId: 'other-request' });
  await expect(prepareVideoRecordingSurfaceCapture(drawingSource, snapshotFactory)).rejects.toThrow(
    'did not confirm readiness'
  );
  expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(
    42,
    expect.objectContaining({
      capturePreparation: expect.objectContaining({ suppressed: false }),
    }),
    { frameId: 0 }
  );
});

it('refuses a generation replaced while drawing paint was pending', async () => {
  mocks.hydrateLease.mockResolvedValueOnce(liveDrawingLease()).mockResolvedValueOnce({
    ...liveDrawingLease(),
    documentGeneration: 2,
  });
  mocks.sendTabMessage.mockImplementation(async (_tabId, message) => ({
    success: true,
    capturePreparationId: message.capturePreparation.requestId,
  }));
  await expect(prepareVideoRecordingSurfaceCapture(drawingSource, snapshotFactory)).rejects.toThrow(
    'identity changed'
  );
});

it('preserves camera and screen sources without requiring a page drawing surface', async () => {
  await prepareVideoRecordingSurfaceCapture(
    { ...drawingSource, captureMode: CaptureMode.CAMERA },
    snapshotFactory
  );
  await prepareVideoRecordingSurfaceCapture(
    { ...drawingSource, captureMode: CaptureMode.SCREEN },
    snapshotFactory
  );
  expect(mocks.hydrateLease).not.toHaveBeenCalled();
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
  expect(snapshotFactory).not.toHaveBeenCalled();
});

it('bounds a missing paint acknowledgement and requests recovery after timeout', async () => {
  vi.useFakeTimers();
  try {
    mocks.hydrateLease.mockResolvedValue(liveDrawingLease());
    mocks.sendTabMessage.mockImplementation(async (_tabId, message) => {
      if (message.capturePreparation.suppressed) return new Promise<never>(() => undefined);
      return { success: true, capturePreparationId: message.capturePreparation.requestId };
    });
    const failure = expect(
      prepareVideoRecordingSurfaceCapture(drawingSource, snapshotFactory)
    ).rejects.toThrow('preparation timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await failure;
    expect(mocks.sendTabMessage).toHaveBeenLastCalledWith(
      42,
      expect.objectContaining({
        capturePreparation: expect.objectContaining({ suppressed: false }),
      }),
      { frameId: 0 }
    );
  } finally {
    vi.useRealTimers();
  }
});

it('does not hide the surface if its owner cannot create the authoritative snapshot', async () => {
  mocks.hydrateLease.mockResolvedValue(liveDrawingLease());
  snapshotFactory.mockRejectedValueOnce(new Error('Settings unavailable'));
  await expect(prepareVideoRecordingSurfaceCapture(drawingSource, snapshotFactory)).rejects.toThrow(
    'Settings unavailable'
  );
  expect(mocks.sendTabMessage).not.toHaveBeenCalled();
});
