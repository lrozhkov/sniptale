import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

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

import { publishVideoRecordingSurfaceRuntimeState } from './runtime-state-sync';

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
